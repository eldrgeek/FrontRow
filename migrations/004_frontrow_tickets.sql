-- FrontRow tickets: a ticket is the one thing that lets someone into a kit
-- theater, and it carries their role (Mike, 2026-11-05; spec: "Tickets" in the
-- Theater Building Kit doc). NOT YET APPLIED. Applying it is a production data
-- change: Mike's yes first. Idempotent: safe to re-run.
--
-- Model (after soma-zoom-presence director grants): a ticket is a revocable
-- grant, re-read on every request, so revoking it takes effect on the next
-- token request with no secret rotated.
--
--   scope    venue_id (theater slug), room_id (screen slug, NULL = whole venue),
--            performance_id (show slug, NULL = any performance in scope)
--   window   valid_from .. valid_until
--   role     audience | performer | crew | manager
--   uses     max_devices: how many devices may claim it (1 = a personal ticket,
--            N = an open door pass). A device that already claimed it re-enters
--            free, so a reload does not spend a use.
--   holder   optional name or email, for the box office's list
--   seat     optional reserved seat (seat-N), otherwise general admission
--   channel  sent | door | comp
--
-- The bearer code is never stored: only sha256(code) (code_hash). Device ids
-- are stored hashed too. Every function here is SECURITY DEFINER and callable
-- only by service_role (the Netlify functions and frontrow-server); anon and
-- authenticated get nothing, and the tables have RLS on with no policies, so
-- PostgREST exposes no rows to a browser.

-- Runs after 003_theater_definitions.sql, which adds venues.slug (the theater
-- slug a ticket's venue_id names). Repeated here as IF NOT EXISTS, with 003's
-- index name, so this file also stands alone.
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS slug text;
CREATE UNIQUE INDEX IF NOT EXISTS venues_slug_key ON public.venues (slug) WHERE slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  venue_id text NOT NULL CHECK (venue_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(venue_id) <= 40),
  room_id text CHECK (room_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(room_id) <= 40),
  performance_id text CHECK (performance_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(performance_id) <= 60),
  role text NOT NULL CHECK (role IN ('audience', 'performer', 'crew', 'manager')),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  max_devices integer NOT NULL DEFAULT 1 CHECK (max_devices BETWEEN 1 AND 1000),
  holder text CHECK (char_length(holder) <= 120),
  seat text CHECK (seat ~ '^seat-[0-9]{1,2}$'),
  channel text NOT NULL CHECK (channel IN ('sent', 'door', 'comp')),
  issued_by text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by text,
  CHECK (valid_until > valid_from),
  CHECK (valid_until - valid_from <= interval '400 days'),
  CHECK (performance_id IS NULL OR room_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS tickets_scope_idx ON public.tickets (venue_id, room_id, performance_id);
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.tickets IS 'Revocable entry grants for a venue, room or performance. Bearer code stored only as sha256. Service role only.';

CREATE TABLE IF NOT EXISTS public.ticket_claims (
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  device_hash text NOT NULL CHECK (device_hash ~ '^[0-9a-f]{64}$'),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, device_hash)
);
ALTER TABLE public.ticket_claims ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.ticket_claims IS 'Devices that claimed a ticket (first-claim binding). Count is capped by tickets.max_devices.';

-- audience_attendance: 001 defined it but 001 never ran (see 002's header), so
-- create it here in 001's shape, then widen it for ticketed guests, who may not
-- have an account (Mike 7/8: the invite-link bypass).
CREATE TABLE IF NOT EXISTS public.audience_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);
ALTER TABLE public.audience_attendance ALTER COLUMN session_id DROP NOT NULL;
ALTER TABLE public.audience_attendance ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.audience_attendance ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES public.tickets(id);
ALTER TABLE public.audience_attendance ADD COLUMN IF NOT EXISTS device_hash text;
ALTER TABLE public.audience_attendance ADD COLUMN IF NOT EXISTS venue_id text;
ALTER TABLE public.audience_attendance ADD COLUMN IF NOT EXISTS room_id text;
-- Show slug (a performance is a Show in theater/show.ts, keyed by slug).
ALTER TABLE public.audience_attendance ADD COLUMN IF NOT EXISTS performance_id text;
ALTER TABLE public.audience_attendance ADD COLUMN IF NOT EXISTS role text;
DO $$ BEGIN
  ALTER TABLE public.audience_attendance
    ADD CONSTRAINT audience_attendance_who CHECK (user_id IS NOT NULL OR ticket_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS audience_attendance_ticket_visit
  ON public.audience_attendance (ticket_id, device_hash, (coalesce(performance_id, '')))
  WHERE ticket_id IS NOT NULL;
ALTER TABLE public.audience_attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_write_own_attendance" ON public.audience_attendance;
CREATE POLICY "users_write_own_attendance" ON public.audience_attendance
  FOR INSERT WITH CHECK (auth.uid() = user_id AND ticket_id IS NULL);
DROP POLICY IF EXISTS "super_admin_read_attendance" ON public.audience_attendance;
CREATE POLICY "super_admin_read_attendance" ON public.audience_attendance
  FOR SELECT USING (public.is_frontrow_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- frontrow_ticket_redeem(p): the only door. p = {code_hash, device_hash,
--   venue_id?, room_id?  (the LiveKit room being entered; omitted = no room check),
--   performance_id?      (show slug, used for attendance when the ticket has none),
--   user_id?             (signed-in guest, optional),
--   purpose: 'enter' | 'manage' | 'check'}
-- 'enter' claims the device and writes attendance; 'manage' claims the device
-- and requires role manager; 'check' changes nothing and says whether this
-- device would be let in.
-- Returns {ok:true, ticket:{...}} or {ok:false, reason, valid_from?}.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.frontrow_ticket_redeem(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  t public.tickets%ROWTYPE;
  purpose text := coalesce(p->>'purpose', 'enter');
  dev text := p->>'device_hash';
  claimed boolean;
  n integer;
  perf text;
BEGIN
  IF purpose NOT IN ('enter', 'manage', 'check') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad-request');
  END IF;
  IF dev IS NULL OR dev !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no-device');
  END IF;

  -- FOR UPDATE: two devices racing for the last use of a ticket serialize here.
  SELECT * INTO t FROM public.tickets WHERE code_hash = p->>'code_hash'
    FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'unknown'); END IF;
  IF t.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'revoked'); END IF;
  IF now() < t.valid_from THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not-open', 'valid_from', t.valid_from);
  END IF;
  IF now() >= t.valid_until THEN RETURN jsonb_build_object('ok', false, 'reason', 'closed'); END IF;
  IF purpose = 'manage' AND t.role <> 'manager' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not-manager');
  END IF;
  IF p ? 'venue_id' AND (
       t.venue_id IS DISTINCT FROM p->>'venue_id'
       OR (t.room_id IS NOT NULL AND t.room_id IS DISTINCT FROM p->>'room_id')) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong-room');
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.ticket_claims WHERE ticket_id = t.id AND device_hash = dev)
    INTO claimed;
  IF NOT claimed THEN
    SELECT count(*) INTO n FROM public.ticket_claims WHERE ticket_id = t.id;
    IF n >= t.max_devices THEN RETURN jsonb_build_object('ok', false, 'reason', 'used-up'); END IF;
  END IF;

  IF purpose <> 'check' THEN
    IF claimed THEN
      UPDATE public.ticket_claims SET last_seen_at = now() WHERE ticket_id = t.id AND device_hash = dev;
    ELSE
      INSERT INTO public.ticket_claims (ticket_id, device_hash) VALUES (t.id, dev);
    END IF;
  END IF;

  IF purpose = 'enter' THEN
    perf := coalesce(t.performance_id, CASE
      WHEN p->>'performance_id' ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(p->>'performance_id') <= 60
      THEN p->>'performance_id' END);
    INSERT INTO public.audience_attendance
      (ticket_id, device_hash, user_id, venue_id, room_id, performance_id, role)
    VALUES (t.id, dev, (p->>'user_id')::uuid, t.venue_id, coalesce(t.room_id, p->>'room_id'), perf, t.role)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object('ok', true, 'ticket', jsonb_build_object(
    'id', t.id, 'role', t.role, 'venue_id', t.venue_id, 'room_id', t.room_id,
    'performance_id', t.performance_id, 'seat', t.seat, 'holder', t.holder,
    'valid_from', t.valid_from, 'valid_until', t.valid_until));
END $$;

-- frontrow_ticket_issue(p): p = {issued_by, tickets:[{code_hash, venue_id, ...}]}.
-- All or nothing. The caller has already checked the issuer's authority.
CREATE OR REPLACE FUNCTION public.frontrow_ticket_issue(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  ids jsonb;
BEGIN
  IF coalesce(p->>'issued_by', '') = '' THEN RAISE EXCEPTION 'issued_by required'; END IF;
  WITH ins AS (
    INSERT INTO public.tickets (code_hash, venue_id, room_id, performance_id, role,
      valid_from, valid_until, max_devices, holder, seat, channel, issued_by)
    SELECT x->>'code_hash', x->>'venue_id', x->>'room_id', x->>'performance_id', x->>'role',
      (x->>'valid_from')::timestamptz, (x->>'valid_until')::timestamptz,
      coalesce((x->>'max_devices')::integer, 1), x->>'holder', x->>'seat', x->>'channel',
      p->>'issued_by'
    FROM jsonb_array_elements(p->'tickets') WITH ORDINALITY AS a(x, i)
    ORDER BY i
    RETURNING id, code_hash
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'code_hash', code_hash)), '[]'::jsonb)
    INTO ids FROM ins;
  RETURN jsonb_build_object('ok', true, 'tickets', ids);
END $$;

-- frontrow_ticket_list(p): p = {venue_id, room_id?, performance_id?}. Tickets
-- inside that scope with how many devices claimed each. Never returns code_hash.
CREATE OR REPLACE FUNCTION public.frontrow_ticket_list(p jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object('ok', true, 'tickets', coalesce(jsonb_agg(row ORDER BY issued_at DESC), '[]'::jsonb))
  FROM (
    SELECT t.issued_at, jsonb_build_object(
      'id', t.id, 'venue_id', t.venue_id, 'room_id', t.room_id, 'performance_id', t.performance_id,
      'role', t.role, 'valid_from', t.valid_from, 'valid_until', t.valid_until,
      'max_devices', t.max_devices, 'holder', t.holder, 'seat', t.seat, 'channel', t.channel,
      'issued_by', t.issued_by, 'issued_at', t.issued_at, 'revoked_at', t.revoked_at,
      'claimed', (SELECT count(*) FROM public.ticket_claims c WHERE c.ticket_id = t.id)) AS row
    FROM public.tickets t
    WHERE t.venue_id = p->>'venue_id'
      AND (p->>'room_id' IS NULL OR t.room_id = p->>'room_id')
      AND (p->>'performance_id' IS NULL OR t.performance_id = p->>'performance_id')
  ) s
$$;

-- frontrow_ticket_get(p): p = {id}. One ticket's scope, for an authority check.
CREATE OR REPLACE FUNCTION public.frontrow_ticket_get(p jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT jsonb_build_object('ok', true, 'ticket', jsonb_build_object(
       'id', t.id, 'venue_id', t.venue_id, 'room_id', t.room_id, 'performance_id', t.performance_id,
       'role', t.role, 'revoked_at', t.revoked_at))
     FROM public.tickets t WHERE t.id::text = p->>'id'),
    jsonb_build_object('ok', false, 'reason', 'unknown'))
$$;

-- frontrow_ticket_revoke(p): p = {id, revoked_by}. Idempotent.
CREATE OR REPLACE FUNCTION public.frontrow_ticket_revoke(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.tickets SET revoked_at = now(), revoked_by = p->>'revoked_by'
    WHERE id::text = p->>'id' AND revoked_at IS NULL;
  RETURN jsonb_build_object('ok', true);
END $$;

-- frontrow_ticket_can_manage(p): p = {user_id, venue_id}. A FrontRow admin, or
-- the theater manager of the venue whose slug is venue_id.
CREATE OR REPLACE FUNCTION public.frontrow_ticket_can_manage(p jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object('ok', true,
    'admin', public.is_frontrow_admin((p->>'user_id')::uuid),
    'manager', EXISTS (SELECT 1 FROM public.venues v
                       WHERE v.slug = p->>'venue_id'
                         AND v.theater_manager_id = (p->>'user_id')::uuid))
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['frontrow_ticket_redeem', 'frontrow_ticket_issue', 'frontrow_ticket_list',
                           'frontrow_ticket_get', 'frontrow_ticket_revoke', 'frontrow_ticket_can_manage'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(jsonb) FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(jsonb) TO service_role', f);
  END LOOP;
END $$;

REVOKE ALL ON public.tickets, public.ticket_claims FROM anon, authenticated;
GRANT ALL ON public.tickets, public.ticket_claims, public.audience_attendance TO service_role;
