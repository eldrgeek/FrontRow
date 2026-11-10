-- FrontRow 009: pay-what-you-want ticket sales through Stripe (theater kit,
-- box office, 2026-11-07). Mike: ticket money goes to Minds Aligned, LLC
-- (the Stripe account inthefutureof.work already uses), "pay what you want
-- for now". Rules: server/box-office-pay.mjs.
--
-- One row per paid Stripe Checkout Session. The session id is the key, so the
-- webhook and the buyer's thank-you page can both fulfil the same sale and
-- only one ticket is ever made. Needs 004 (frontrow_tickets), 006
-- (performances) and 007 (ticket_mail).

CREATE TABLE IF NOT EXISTS public.frontrow_ticket_sales (
  session_id text PRIMARY KEY CHECK (session_id ~ '^cs_(test|live)_[A-Za-z0-9]{10,200}$'),
  ticket_id uuid NOT NULL REFERENCES public.frontrow_tickets(id) ON DELETE RESTRICT,
  venue_id text NOT NULL,
  room_id text NOT NULL,
  performance_id text NOT NULL,
  amount integer NOT NULL CHECK (amount >= 0),
  currency text NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
  email text NOT NULL,
  name text,
  livemode boolean NOT NULL,
  paid_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS frontrow_ticket_sales_night_idx
  ON public.frontrow_ticket_sales (venue_id, room_id, performance_id);
ALTER TABLE public.frontrow_ticket_sales ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.frontrow_ticket_sales IS 'Paid Stripe Checkout Sessions, one ticket each. Written only by frontrow_ticket_sale_fulfil.';

-- frontrow_ticket_sale_night(p): p = {venue_id, room_id, slug}. What the buy
-- page shows and the checkout checks: the night (006), the theater's name,
-- and how many seats audience tickets already hold.
CREATE OR REPLACE FUNCTION public.frontrow_ticket_sale_night(p jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce((
    SELECT jsonb_build_object('ok', true, 'found', true,
      'slug', x.slug, 'title', x.title, 'artist', x.artist, 'status', x.status,
      'seats', x.seats, 'starts_at', x.starts_at, 'doors_at', x.doors_at, 'ends_at', x.ends_at,
      'theater', t.name,
      'taken', (SELECT coalesce(sum(k.max_devices), 0) FROM public.frontrow_tickets k
                WHERE k.venue_id = t.slug AND k.room_id = s.screen_key AND k.performance_id = x.slug
                  AND k.role = 'audience' AND k.revoked_at IS NULL))
    FROM public.performances x
    JOIN public.venues t ON t.id = x.theater_id AND t.slug = p->>'venue_id'
    JOIN public.venues s ON s.id = x.screen_id AND s.screen_key = p->>'room_id'
    WHERE x.slug = p->>'slug'), jsonb_build_object('ok', true, 'found', false))
$$;

-- frontrow_ticket_sale_fulfil(p): the ticket for one paid session, made once.
-- p = {session_id, amount, currency, email, name?, livemode, paid_at,
--      ticket:{code_hash, venue_id, room_id, performance_id, valid_from, valid_until},
--      mail:{id, sealed, payload} | null}
-- Returns {ok, created, ticket_id, revoked, code_hash, mailed}. A second call for the same
-- session makes nothing and returns the first ticket.
CREATE OR REPLACE FUNCTION public.frontrow_ticket_sale_fulfil(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  s public.frontrow_ticket_sales;
  t jsonb := p->'ticket';
  tid uuid;
BEGIN
  -- Two fulfilments of one session (webhook and thank-you page at once) queue here.
  PERFORM pg_advisory_xact_lock(hashtext('frontrow_ticket_sale:' || (p->>'session_id')));
  SELECT * INTO s FROM public.frontrow_ticket_sales WHERE session_id = p->>'session_id';
  IF FOUND THEN
    RETURN (SELECT jsonb_build_object('ok', true, 'created', false, 'ticket_id', k.id,
      'revoked', k.revoked_at IS NOT NULL, 'code_hash', k.code_hash,
      'mailed', EXISTS (SELECT 1 FROM public.ticket_mail m WHERE m.ticket_id = k.id))
      FROM public.frontrow_tickets k WHERE k.id = s.ticket_id);
  END IF;

  INSERT INTO public.frontrow_tickets (code_hash, venue_id, room_id, performance_id, role,
    valid_from, valid_until, max_devices, holder, channel, issued_by, label,
    sold_at, sold_by, sold_note)
  VALUES (t->>'code_hash', t->>'venue_id', t->>'room_id', t->>'performance_id', 'audience',
    (t->>'valid_from')::timestamptz, (t->>'valid_until')::timestamptz, 1, p->>'email', 'sent',
    'stripe', 'Paid online', now(), 'stripe',
    format('Paid %s %s online', to_char((p->>'amount')::integer / 100.0, 'FM999990.00'),
      upper(p->>'currency')))
  RETURNING id INTO tid;

  INSERT INTO public.frontrow_ticket_sales (session_id, ticket_id, venue_id, room_id, performance_id,
    amount, currency, email, name, livemode, paid_at)
  VALUES (p->>'session_id', tid, t->>'venue_id', t->>'room_id', t->>'performance_id',
    (p->>'amount')::integer, p->>'currency', p->>'email', nullif(p->>'name', ''),
    (p->>'livemode')::boolean, (p->>'paid_at')::timestamptz);

  IF jsonb_typeof(p->'mail') = 'object' THEN
    INSERT INTO public.ticket_mail (id, batch_id, ticket_id, email, name, sealed, payload, requested_by)
    VALUES ((p->'mail'->>'id')::uuid, (p->'mail'->>'id')::uuid, tid, p->>'email', nullif(p->>'name', ''),
      p->'mail'->>'sealed', p->'mail'->'payload', 'stripe');
  END IF;
  RETURN jsonb_build_object('ok', true, 'created', true, 'ticket_id', tid, 'revoked', false,
    'code_hash', t->>'code_hash', 'mailed', jsonb_typeof(p->'mail') = 'object');
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['frontrow_ticket_sale_night', 'frontrow_ticket_sale_fulfil'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(jsonb) FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(jsonb) TO service_role', f);
  END LOOP;
END $$;

REVOKE ALL ON public.frontrow_ticket_sales FROM anon, authenticated;
GRANT ALL ON public.frontrow_ticket_sales TO service_role;
