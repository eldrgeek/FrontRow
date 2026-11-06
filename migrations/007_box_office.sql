-- FrontRow box office (theater kit gap 3, 2026-11-05; Mike: "Some tickets are
-- sent out; some might be bought at the door"). NOT YET APPLIED. Applying it is
-- a production data change: Mike's yes first. Idempotent: safe to re-run.
-- Runs after 004_frontrow_tickets.sql (it needs public.tickets) and, in the
-- release order, after 006_performances.sql, whose performances it reads when
-- the table is there. It changes none of 004's or 006's functions.
--
-- What it adds:
--   tickets.label              "Door 7": the name printed on a door card
--   tickets.sold_at/_by/_note  a door card was handed to someone (note = their name)
--   ticket_mail                one row per ticket emailed: the queue the Mac
--                              mail worker drains. The code itself is SEALED to
--                              the worker's public key (X25519 + AES-GCM, see
--                              server/box-office.mjs); neither the database nor
--                              the Netlify functions can read it back. The
--                              sealed copy is wiped once the mail is sent, or
--                              once the ticket's window has closed.
--   ticket_mail_worker         the worker's last check-in, so the box office
--                              can say "Waiting for Mike's Mac".
--
-- As in 004: every function is SECURITY DEFINER and callable only by
-- service_role; the tables have RLS on with no policies.

ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS label text;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS sold_at timestamptz;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS sold_by text;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS sold_note text;
DO $$ BEGIN
  ALTER TABLE public.tickets ADD CONSTRAINT tickets_label_len CHECK (char_length(label) <= 40);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.tickets ADD CONSTRAINT tickets_sold_note_len CHECK (char_length(sold_note) <= 80);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.ticket_mail (
  id uuid PRIMARY KEY,
  batch_id uuid NOT NULL,
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (char_length(email) <= 120 AND email ~ '^[a-z0-9][a-z0-9._%+''-]*@[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  name text CHECK (char_length(name) <= 80),
  -- v1.<ephemeral pub>.<iv>.<ciphertext+tag>, base64url; NULL once sent or expired
  sealed text CHECK (char_length(sealed) <= 400),
  -- what the worker puts in the letter: titles, time zone, site, window. No secrets.
  payload jsonb NOT NULL,
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'sending', 'sent', 'failed')),
  error text CHECK (char_length(error) <= 300),
  requested_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  queued_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  finished_at timestamptz,
  attempts integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ticket_mail_state_idx ON public.ticket_mail (state, queued_at);
CREATE INDEX IF NOT EXISTS ticket_mail_ticket_idx ON public.ticket_mail (ticket_id);
ALTER TABLE public.ticket_mail ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.ticket_mail IS 'Box office mail queue. sealed = ticket code encrypted to the Mac worker key; wiped when sent. Service role only.';

CREATE TABLE IF NOT EXISTS public.ticket_mail_worker (
  id integer PRIMARY KEY CHECK (id = 1),
  host text,
  armed boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ticket_mail_worker ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- frontrow_box_office_issue(p): tickets and, optionally, their mail, in one
-- transaction. p = {issued_by, tickets:[{code_hash, venue_id, ..., label?}],
--   mail:[{id, batch_id, index, email, name, sealed, payload}]}
-- mail[].index is the position in tickets[] the letter carries.
-- The caller has already checked the issuer's authority and the seat count.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.frontrow_box_office_issue(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  ids uuid[];
  out_tickets jsonb;
BEGIN
  IF coalesce(p->>'issued_by', '') = '' THEN RAISE EXCEPTION 'issued_by required'; END IF;
  WITH ins AS (
    INSERT INTO public.tickets (code_hash, venue_id, room_id, performance_id, role,
      valid_from, valid_until, max_devices, holder, seat, channel, issued_by, label)
    SELECT x->>'code_hash', x->>'venue_id', x->>'room_id', x->>'performance_id', x->>'role',
      (x->>'valid_from')::timestamptz, (x->>'valid_until')::timestamptz,
      coalesce((x->>'max_devices')::integer, 1), x->>'holder', x->>'seat', x->>'channel',
      p->>'issued_by', x->>'label'
    FROM jsonb_array_elements(p->'tickets') WITH ORDINALITY AS a(x, i)
    ORDER BY i
    RETURNING id, code_hash
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'code_hash', code_hash)), '[]'::jsonb)
    INTO out_tickets FROM ins;

  INSERT INTO public.ticket_mail (id, batch_id, ticket_id, email, name, sealed, payload, requested_by)
  SELECT (m->>'id')::uuid, (m->>'batch_id')::uuid, t.id, m->>'email', m->>'name', m->>'sealed',
         m->'payload', p->>'issued_by'
  FROM jsonb_array_elements(coalesce(p->'mail', '[]'::jsonb)) AS b(m)
  JOIN public.tickets t
    ON t.code_hash = (p->'tickets'->((m->>'index')::integer))->>'code_hash';

  IF (SELECT count(*) FROM jsonb_array_elements(coalesce(p->'mail', '[]'::jsonb)))
     <> (SELECT count(*) FROM public.ticket_mail WHERE batch_id = (p->'mail'->0->>'batch_id')::uuid) THEN
    RAISE EXCEPTION 'every letter must name a ticket in this batch';
  END IF;
  RETURN jsonb_build_object('ok', true, 'tickets', out_tickets);
END $$;

-- frontrow_box_office_list(p): p = {venue_id, room_id?, performance_id?}.
-- Every ticket in scope with its label, sale mark, claims and latest letter.
-- Never returns code_hash or sealed.
CREATE OR REPLACE FUNCTION public.frontrow_box_office_list(p jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object('ok', true,
    'tickets', coalesce(jsonb_agg(row ORDER BY issued_at DESC, label), '[]'::jsonb),
    'worker', (SELECT jsonb_build_object('host', w.host, 'armed', w.armed, 'last_seen_at', w.last_seen_at)
               FROM public.ticket_mail_worker w WHERE w.id = 1))
  FROM (
    SELECT t.issued_at, t.label, jsonb_build_object(
      'id', t.id, 'venue_id', t.venue_id, 'room_id', t.room_id, 'performance_id', t.performance_id,
      'role', t.role, 'valid_from', t.valid_from, 'valid_until', t.valid_until,
      'max_devices', t.max_devices, 'holder', t.holder, 'seat', t.seat, 'channel', t.channel,
      'label', t.label, 'sold_at', t.sold_at, 'sold_by', t.sold_by, 'sold_note', t.sold_note,
      'issued_by', t.issued_by, 'issued_at', t.issued_at, 'revoked_at', t.revoked_at,
      'claimed', (SELECT count(*) FROM public.ticket_claims c WHERE c.ticket_id = t.id),
      'mail', (SELECT jsonb_build_object('id', m.id, 'email', m.email, 'state', m.state,
                 'error', m.error, 'queued_at', m.queued_at, 'finished_at', m.finished_at,
                 'retryable', m.sealed IS NOT NULL AND m.state = 'failed')
               FROM public.ticket_mail m WHERE m.ticket_id = t.id
               ORDER BY m.created_at DESC LIMIT 1)) AS row
    FROM public.tickets t
    WHERE t.venue_id = p->>'venue_id'
      AND (p->>'room_id' IS NULL OR t.room_id = p->>'room_id')
      AND (p->>'performance_id' IS NULL OR t.performance_id = p->>'performance_id')
  ) s
$$;

-- frontrow_box_office_sold(p): p = {id, sold: bool, by, note?}. Door cards only.
CREATE OR REPLACE FUNCTION public.frontrow_box_office_sold(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE t public.tickets%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.tickets WHERE id::text = p->>'id' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'unknown'); END IF;
  IF t.channel <> 'door' THEN RETURN jsonb_build_object('ok', false, 'reason', 'not-door'); END IF;
  IF (p->>'sold')::boolean THEN
    UPDATE public.tickets SET sold_at = coalesce(sold_at, now()), sold_by = p->>'by',
      sold_note = nullif(p->>'note', '') WHERE id = t.id;
  ELSE
    UPDATE public.tickets SET sold_at = NULL, sold_by = NULL, sold_note = NULL WHERE id = t.id;
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- frontrow_mail_get(p): p = {id}. A letter's ticket scope, for an authority check.
CREATE OR REPLACE FUNCTION public.frontrow_mail_get(p jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT jsonb_build_object('ok', true, 'mail', jsonb_build_object('id', m.id, 'state', m.state),
       'ticket', jsonb_build_object('id', t.id, 'venue_id', t.venue_id, 'room_id', t.room_id,
         'performance_id', t.performance_id))
     FROM public.ticket_mail m JOIN public.tickets t ON t.id = m.ticket_id WHERE m.id::text = p->>'id'),
    jsonb_build_object('ok', false, 'reason', 'unknown'))
$$;

-- frontrow_mail_retry(p): p = {id}. A failed letter goes back in the queue, if
-- its ticket still stands and the sealed code is still held.
CREATE OR REPLACE FUNCTION public.frontrow_mail_retry(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE m public.ticket_mail%ROWTYPE; t public.tickets%ROWTYPE;
BEGIN
  SELECT * INTO m FROM public.ticket_mail WHERE id::text = p->>'id' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'unknown'); END IF;
  SELECT * INTO t FROM public.tickets WHERE id = m.ticket_id;
  IF m.state <> 'failed' THEN RETURN jsonb_build_object('ok', false, 'reason', 'not-failed'); END IF;
  IF t.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'revoked'); END IF;
  IF t.valid_until <= now() OR m.sealed IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'closed'); END IF;
  UPDATE public.ticket_mail SET state = 'queued', error = NULL, queued_at = now(),
    claimed_at = NULL, finished_at = NULL WHERE id = m.id;
  RETURN jsonb_build_object('ok', true);
END $$;

-- frontrow_mail_claim(p): the worker's poll. p = {limit, wait_seconds,
-- stale_seconds, host, armed}. Records the check-in, fails letters nobody
-- picked up in time, then hands out up to `limit` queued letters.
CREATE OR REPLACE FUNCTION public.frontrow_mail_claim(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  lim integer := least(greatest(coalesce((p->>'limit')::integer, 0), 0), 20);
  wait_s integer := greatest(coalesce((p->>'wait_seconds')::integer, 21600), 60);
  stale_s integer := greatest(coalesce((p->>'stale_seconds')::integer, 900), 60);
  jobs jsonb;
BEGIN
  INSERT INTO public.ticket_mail_worker (id, host, armed, last_seen_at)
    VALUES (1, left(p->>'host', 80), coalesce((p->>'armed')::boolean, false), now())
    ON CONFLICT (id) DO UPDATE SET host = EXCLUDED.host, armed = EXCLUDED.armed, last_seen_at = now();

  -- The sealed code goes as soon as its ticket can no longer be used.
  UPDATE public.ticket_mail m SET sealed = NULL
    FROM public.tickets t
    WHERE t.id = m.ticket_id AND m.sealed IS NOT NULL
      AND (t.valid_until <= now() OR t.revoked_at IS NOT NULL);
  UPDATE public.ticket_mail SET state = 'failed', finished_at = now(),
    error = 'the ticket was revoked or its window closed before it was sent'
    WHERE state = 'queued' AND sealed IS NULL;
  UPDATE public.ticket_mail SET state = 'failed', finished_at = now(),
    error = 'Mike''s Mac did not pick it up in time; nothing was sent'
    WHERE state = 'queued' AND queued_at < now() - make_interval(secs => wait_s);
  UPDATE public.ticket_mail SET state = 'failed', finished_at = now(),
    error = 'Mike''s Mac took it and never said whether it was sent; check before you retry'
    WHERE state = 'sending' AND claimed_at < now() - make_interval(secs => stale_s);

  WITH picked AS (
    SELECT id FROM public.ticket_mail
    WHERE state = 'queued' ORDER BY queued_at
    LIMIT lim FOR UPDATE SKIP LOCKED
  ), upd AS (
    UPDATE public.ticket_mail m SET state = 'sending', claimed_at = now(), attempts = attempts + 1
    FROM picked WHERE m.id = picked.id
    RETURNING m.id, m.email, m.name, m.sealed, m.payload
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'email', email, 'name', name,
           'sealed', sealed, 'payload', payload)), '[]'::jsonb)
    INTO jobs FROM upd;
  RETURN jsonb_build_object('ok', true, 'jobs', jobs);
END $$;

-- frontrow_mail_report(p): p = {id, ok, error?}. Only a letter that is out
-- with the worker can be reported on. Sent = the sealed code is wiped.
CREATE OR REPLACE FUNCTION public.frontrow_mail_report(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (p->>'ok')::boolean THEN
    UPDATE public.ticket_mail SET state = 'sent', sealed = NULL, error = NULL, finished_at = now()
      WHERE id::text = p->>'id' AND state = 'sending';
  ELSE
    UPDATE public.ticket_mail SET state = 'failed', finished_at = now(),
      error = left(coalesce(nullif(p->>'error', ''), 'not sent'), 300)
      WHERE id::text = p->>'id' AND state = 'sending';
  END IF;
  RETURN jsonb_build_object('ok', FOUND);
END $$;

-- frontrow_box_office_performance(p): p = {venue_id, room_id, slug}. The night
-- the box office is selling for (006's performances), so it can refuse a night
-- that does not exist or is over before minting anything, and use the night's
-- own seat count. {ok:true, found:false} when 006 is not applied.
CREATE OR REPLACE FUNCTION public.frontrow_box_office_performance(p jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE r jsonb;
BEGIN
  IF to_regclass('public.performances') IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'found', false, 'table', false);
  END IF;
  EXECUTE $q$
    SELECT jsonb_build_object('ok', true, 'found', true, 'table', true,
      'slug', x.slug, 'title', x.title, 'artist', x.artist, 'status', x.status,
      'seats', x.seats, 'starts_at', x.starts_at, 'doors_at', x.doors_at, 'ends_at', x.ends_at)
    FROM public.performances x
    JOIN public.venues t ON t.id = x.theater_id AND t.slug = $1
    JOIN public.venues s ON s.id = x.screen_id AND s.screen_key = $2
    WHERE x.slug = $3 $q$
    INTO r USING p->>'venue_id', p->>'room_id', p->>'slug';
  RETURN coalesce(r, jsonb_build_object('ok', true, 'found', false, 'table', true));
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['frontrow_box_office_issue', 'frontrow_box_office_list', 'frontrow_box_office_sold',
                           'frontrow_mail_get', 'frontrow_mail_retry', 'frontrow_mail_claim',
                           'frontrow_mail_report', 'frontrow_box_office_performance'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(jsonb) FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(jsonb) TO service_role', f);
  END LOOP;
END $$;

REVOKE ALL ON public.ticket_mail, public.ticket_mail_worker FROM anon, authenticated;
GRANT ALL ON public.ticket_mail, public.ticket_mail_worker TO service_role;
