-- FrontRow venues: applied 2026-07-08 against shared project omfwcodoimjmbrhssvfl.
--
-- Context: migration 001 was authored but NEVER run, so venues/sessions/etc.
-- did not exist and the Lobby query failed ("Failed to load venues"). This
-- migration creates the missing FrontRow-specific tables, FIXES an infinite-
-- recursion bug in 001's admin RLS policies, and seeds the original theater.
--
-- Bug fixed: 001's super_admin_* policies did `auth.uid() IN (SELECT user_id
-- FROM frontrow_admins)`, and frontrow_admins' own policy did the same against
-- itself → 42P17 infinite recursion on ANY read. Routed through a
-- SECURITY DEFINER function that bypasses RLS.
--
-- Deliberately does NOT touch shared `public.profiles` (owned by Legends) or
-- `public.delegations` (owned by Playmaker — different schema/policies).
-- Idempotent: safe to re-run.

-- Shared profiles: additive column FrontRow reads (non-breaking for Legends).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_ai boolean NOT NULL DEFAULT false;

-- room_templates
CREATE TABLE IF NOT EXISTS public.room_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.room_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anyone_read_templates" ON public.room_templates;
CREATE POLICY "anyone_read_templates" ON public.room_templates FOR SELECT USING (true);
INSERT INTO public.room_templates (name, description) VALUES
  ('proscenium', 'Traditional stage with audience facing'),
  ('cabaret', 'Intimate round tables facing stage'),
  ('black-box', 'Flexible performance space'),
  ('custom', 'Custom layout defined by theater manager')
ON CONFLICT (name) DO NOTHING;

-- frontrow_admins
CREATE TABLE IF NOT EXISTS public.frontrow_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.frontrow_admins ENABLE ROW LEVEL SECURITY;

-- Non-recursive admin check (bypasses RLS on frontrow_admins).
CREATE OR REPLACE FUNCTION public.is_frontrow_admin(uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.frontrow_admins WHERE user_id = uid) $$;
GRANT EXECUTE ON FUNCTION public.is_frontrow_admin(uuid) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "super_admins_read" ON public.frontrow_admins;
CREATE POLICY "super_admins_read" ON public.frontrow_admins
  FOR SELECT USING (public.is_frontrow_admin(auth.uid()));

-- venues
CREATE TABLE IF NOT EXISTS public.venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  super_venue_id uuid REFERENCES public.venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  room_template_id uuid NOT NULL REFERENCES public.room_templates(id),
  theater_manager_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id)
);
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anyone_read_active_venues" ON public.venues;
CREATE POLICY "anyone_read_active_venues" ON public.venues FOR SELECT USING (active = true);
DROP POLICY IF EXISTS "theater_manager_update_own" ON public.venues;
CREATE POLICY "theater_manager_update_own" ON public.venues FOR UPDATE
  USING (auth.uid() = theater_manager_id OR public.is_frontrow_admin(auth.uid()))
  WITH CHECK (auth.uid() = theater_manager_id OR public.is_frontrow_admin(auth.uid()));
DROP POLICY IF EXISTS "super_admin_all_venues" ON public.venues;
CREATE POLICY "super_admin_all_venues" ON public.venues FOR ALL
  USING (public.is_frontrow_admin(auth.uid()));

-- venue_settings
CREATE TABLE IF NOT EXISTS public.venue_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL UNIQUE REFERENCES public.venues(id) ON DELETE CASCADE,
  config jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES auth.users(id)
);
ALTER TABLE public.venue_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "venue_settings_read" ON public.venue_settings;
CREATE POLICY "venue_settings_read" ON public.venue_settings FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.venues v WHERE v.id = venue_settings.venue_id AND v.active = true));
DROP POLICY IF EXISTS "super_admin_all_venue_settings" ON public.venue_settings;
CREATE POLICY "super_admin_all_venue_settings" ON public.venue_settings FOR ALL
  USING (public.is_frontrow_admin(auth.uid()));

-- sessions (shows)
CREATE TABLE IF NOT EXISTS public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'pre-show', 'live', 'post-show')),
  performer_ids uuid[] NOT NULL DEFAULT '{}',
  started_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  can_replay boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  ended_at timestamptz
);
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audience_read_active_sessions" ON public.sessions;
CREATE POLICY "audience_read_active_sessions" ON public.sessions FOR SELECT
  USING (status IN ('pre-show', 'live') OR (status = 'post-show' AND can_replay = true));
DROP POLICY IF EXISTS "super_admin_all_sessions" ON public.sessions;
CREATE POLICY "super_admin_all_sessions" ON public.sessions FOR ALL
  USING (public.is_frontrow_admin(auth.uid()));

-- session_settings
CREATE TABLE IF NOT EXISTS public.session_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE REFERENCES public.sessions(id) ON DELETE CASCADE,
  config jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);
ALTER TABLE public.session_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anyone_read_session_settings_for_live_show" ON public.session_settings;
CREATE POLICY "anyone_read_session_settings_for_live_show" ON public.session_settings FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id AND s.status IN ('pre-show', 'live', 'post-show')));
DROP POLICY IF EXISTS "super_admin_all_session_settings" ON public.session_settings;
CREATE POLICY "super_admin_all_session_settings" ON public.session_settings FOR ALL
  USING (public.is_frontrow_admin(auth.uid()));

-- table-level grants (RLS still gates rows)
GRANT SELECT ON public.room_templates, public.venues, public.venue_settings, public.sessions, public.session_settings TO anon, authenticated;
GRANT ALL ON public.room_templates, public.venues, public.venue_settings, public.sessions, public.session_settings, public.frontrow_admins TO service_role;

-- ============================================================================
-- SEED: Mike as admin + the original FrontRow theater + the Jess Wayne show
-- ============================================================================
INSERT INTO public.frontrow_admins (user_id, email)
VALUES ('e411d3d3-d2fb-4dae-8f26-6d7542f17346', 'mw@mike-wolf.com')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.venues (id, name, room_template_id, theater_manager_id, active, created_by)
VALUES ('a0000000-0000-4000-8000-000000000001', 'FrontRow Theater',
  (SELECT id FROM public.room_templates WHERE name = 'proscenium'),
  'e411d3d3-d2fb-4dae-8f26-6d7542f17346', true, 'e411d3d3-d2fb-4dae-8f26-6d7542f17346')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.venue_settings (venue_id, config, updated_by)
VALUES ('a0000000-0000-4000-8000-000000000001',
  '{"seatCount":20,"arrangement":"semicircle","curtainStyle":"velvet-red","stage":{"depth":18},"backdrop":{"type":"video","videoUrl":"https://youtu.be/K6ZeroIZd5g"}}',
  'e411d3d3-d2fb-4dae-8f26-6d7542f17346')
ON CONFLICT (venue_id) DO NOTHING;

INSERT INTO public.sessions (id, venue_id, title, status, can_replay)
VALUES ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
  'Jess Wayne — Live at FrontRow', 'pre-show', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.session_settings (session_id, config, updated_by)
VALUES ('b0000000-0000-4000-8000-000000000001',
  '{"showTitle":"Jess Wayne","seatCount":20,"curtainStyle":"velvet-red","backdrop":{"type":"video","videoUrl":"https://youtu.be/K6ZeroIZd5g"}}',
  'e411d3d3-d2fb-4dae-8f26-6d7542f17346')
ON CONFLICT (session_id) DO NOTHING;
