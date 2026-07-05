-- FrontRow SOMA Upgrade Schema & RLS Policies
-- Date: 2026-07-05
-- Runs against: omfwcodoimjmbrhssvfl (shared SOMA Supabase project)
-- Author: Claude (Sonnet 5) for Mike Wolf

-- ============================================================================
-- 1. USER PROFILES (including delegation model)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  is_ai boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS 'User profiles for FrontRow (human or AI). is_ai flag is ONLY for UX affordances.';
COMMENT ON COLUMN public.profiles.is_ai IS 'Is this user an AI? Only affects UI/UX, NOT permissions or capabilities.';

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_read_public_profiles" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "users_update_own_profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ============================================================================
-- 2. DELEGATION MODEL (many-to-many: users can have multiple agents)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE(user_id, agent_id),
  CONSTRAINT cannot_delegate_to_self CHECK (user_id != agent_id)
);

COMMENT ON TABLE public.delegations IS 'Many-to-many delegation: user delegates to agent (human or AI). Agent has full authority to act on user behalf.';
COMMENT ON COLUMN public.delegations.user_id IS 'The person/entity delegating authority.';
COMMENT ON COLUMN public.delegations.agent_id IS 'The person/AI acting on behalf of user_id.';
COMMENT ON COLUMN public.delegations.revoked_at IS 'When delegation was revoked (null = active).';

ALTER TABLE public.delegations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "delegator_revokes_own_delegation" ON public.delegations
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "user_sees_own_delegations" ON public.delegations
  FOR SELECT USING (auth.uid() = user_id OR auth.uid() = agent_id);

CREATE POLICY "super_admin_read_all_delegations" ON public.delegations
  FOR SELECT USING (auth.uid() IN (SELECT user_id FROM public.frontrow_admins));

-- ============================================================================
-- 3. SUPER ADMIN REGISTRY
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.frontrow_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.frontrow_admins IS 'Global FrontRow super admins (5 people). Can manage all venues and sessions.';

ALTER TABLE public.frontrow_admins ENABLE ROW LEVEL SECURITY;

-- Only super admins can view this table (used internally for permission checks)
CREATE POLICY "super_admins_read" ON public.frontrow_admins
  FOR SELECT USING (
    auth.uid() IN (SELECT user_id FROM public.frontrow_admins)
  );

-- ============================================================================
-- 2. ROOM TEMPLATES (immutable reference data)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.room_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.room_templates IS 'Immutable room layout templates (Proscenium, Cabaret, Black Box, etc). Can be customized per venue.';

ALTER TABLE public.room_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_read_templates" ON public.room_templates
  FOR SELECT USING (true);

-- Seed templates (run once)
INSERT INTO public.room_templates (name, description)
VALUES
  ('proscenium', 'Traditional stage with audience facing'),
  ('cabaret', 'Intimate round tables facing stage'),
  ('black-box', 'Flexible performance space'),
  ('custom', 'Custom layout defined by theater manager')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 3. VENUE HIERARCHY
-- ============================================================================

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

COMMENT ON TABLE public.venues IS 'Theater venues (theater complexes or individual theaters). Can be hierarchical (complex → theaters).';
COMMENT ON COLUMN public.venues.super_venue_id IS 'Parent venue (e.g., theater complex). Nullable for standalone theaters.';
COMMENT ON COLUMN public.venues.theater_manager_id IS 'Single human manager who owns this venue. Can promote performance managers.';

ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_read_active_venues" ON public.venues
  FOR SELECT USING (active = true);

CREATE POLICY "theater_manager_read_own_and_siblings" ON public.venues
  FOR SELECT USING (
    auth.uid() = theater_manager_id
    OR auth.uid() IN (SELECT user_id FROM public.frontrow_admins)
  );

CREATE POLICY "theater_manager_update_own" ON public.venues
  FOR UPDATE USING (
    auth.uid() = theater_manager_id
    OR auth.uid() IN (SELECT user_id FROM public.frontrow_admins)
  ) WITH CHECK (
    auth.uid() = theater_manager_id
    OR auth.uid() IN (SELECT user_id FROM public.frontrow_admins)
  );

CREATE POLICY "super_admin_all_venues" ON public.venues
  FOR ALL USING (
    auth.uid() IN (SELECT user_id FROM public.frontrow_admins)
  );

-- ============================================================================
-- 4. VENUE SETTINGS & CUSTOMIZATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.venue_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL UNIQUE REFERENCES public.venues(id) ON DELETE CASCADE,
  config jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  CONSTRAINT config_not_empty CHECK (config IS NOT NULL)
);

COMMENT ON TABLE public.venue_settings IS 'Venue-level customization (colors, curtain style, stage depth, seat defaults, etc).';

ALTER TABLE public.venue_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_settings_read" ON public.venue_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.venues v
      WHERE v.id = venue_settings.venue_id AND v.active = true
    )
  );

CREATE POLICY "theater_manager_update_own_venue_settings" ON public.venue_settings
  FOR UPDATE USING (
    auth.uid() IN (SELECT v.theater_manager_id FROM public.venues v WHERE v.id = venue_id)
    OR auth.uid() IN (SELECT user_id FROM public.frontrow_admins)
  ) WITH CHECK (
    auth.uid() IN (SELECT v.theater_manager_id FROM public.venues v WHERE v.id = venue_id)
    OR auth.uid() IN (SELECT user_id FROM public.frontrow_admins)
  );

CREATE POLICY "super_admin_all_venue_settings" ON public.venue_settings
  FOR ALL USING (
    auth.uid() IN (SELECT user_id FROM public.frontrow_admins)
  );

-- ============================================================================
-- 5. SESSIONS (SHOWS)
-- ============================================================================

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

COMMENT ON TABLE public.sessions IS 'Shows/performances in a venue. Can be attended live or replayed.';
COMMENT ON COLUMN public.sessions.performer_ids IS 'Array of user_ids invited as performers for this session.';

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audience_read_active_sessions" ON public.sessions
  FOR SELECT USING (
    status IN ('pre-show', 'live')
    OR (status = 'post-show' AND can_replay = true)
  );

CREATE POLICY "performers_read_own_sessions" ON public.sessions
  FOR SELECT USING (
    auth.uid() = ANY(performer_ids)
  );

CREATE POLICY "theater_manager_read_own_venue_sessions" ON public.sessions
  FOR SELECT USING (
    auth.uid() IN (SELECT theater_manager_id FROM public.venues WHERE id = venue_id)
    OR auth.uid() IN (SELECT user_id FROM public.frontrow_admins)
  );

CREATE POLICY "super_admin_all_sessions" ON public.sessions
  FOR ALL USING (
    auth.uid() IN (SELECT user_id FROM public.frontrow_admins)
  );

-- ============================================================================
-- 6. SESSION SETTINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.session_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE REFERENCES public.sessions(id) ON DELETE CASCADE,
  config jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  CONSTRAINT config_not_empty CHECK (config IS NOT NULL)
);

COMMENT ON TABLE public.session_settings IS 'Session-level customization (seat count, spotlight intensity, etc). Can override venue defaults.';

ALTER TABLE public.session_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_read_session_settings_for_live_show" ON public.session_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_id AND s.status IN ('pre-show', 'live', 'post-show')
    )
  );

CREATE POLICY "performers_update_own_session_settings" ON public.session_settings
  FOR UPDATE USING (
    auth.uid() IN (SELECT unnest(performer_ids) FROM public.sessions WHERE id = session_id)
  ) WITH CHECK (
    auth.uid() IN (SELECT unnest(performer_ids) FROM public.sessions WHERE id = session_id)
  );

CREATE POLICY "super_admin_all_session_settings" ON public.session_settings
  FOR ALL USING (
    auth.uid() IN (SELECT user_id FROM public.frontrow_admins)
  );

-- ============================================================================
-- 7. SHOW FEEDBACK (Audience ratings + comments on performances)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.show_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text,
  rating integer CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  text text,
  viewed_how text NOT NULL CHECK (viewed_how IN ('attended', 'replayed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.show_feedback IS 'Audience feedback on performances (anonymous by default, user can self-identify).';
COMMENT ON COLUMN public.show_feedback.author_name IS 'If provided, the feedback is signed. If NULL, feedback is anonymous.';
COMMENT ON COLUMN public.show_feedback.viewed_how IS 'Was this show attended live or viewed as a replay?';

ALTER TABLE public.show_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_read_show_feedback" ON public.show_feedback
  FOR SELECT USING (true);

CREATE POLICY "audience_write_own_feedback" ON public.show_feedback
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND (
      -- Can feedback if they attended OR session can be replayed
      auth.uid() IN (SELECT user_id FROM public.audience_attendance WHERE session_id = show_feedback.session_id)
      OR EXISTS (SELECT 1 FROM public.sessions WHERE id = session_id AND can_replay = true)
    )
  );

CREATE POLICY "super_admin_all_feedback" ON public.show_feedback
  FOR ALL USING (
    auth.uid() IN (SELECT user_id FROM public.frontrow_admins)
  );

-- ============================================================================
-- 8. DESIGN FEEDBACK (SOMA standard — app improvement requests)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.frontrow_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('bug', 'feature')),
  description text NOT NULL,
  submitter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'approved', 'built', 'deferred')),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.frontrow_feedback IS 'Design/implementation feedback from FrontRow users (Mike, performers, admins).';

ALTER TABLE public.frontrow_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_write_own_feedback" ON public.frontrow_feedback
  FOR INSERT WITH CHECK (auth.uid() = submitter_id);

CREATE POLICY "super_admin_read_all_feedback" ON public.frontrow_feedback
  FOR SELECT USING (
    auth.uid() IN (SELECT user_id FROM public.frontrow_admins)
  );

-- ============================================================================
-- 9. CHANGELOGS (Audit trails)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.venue_changelog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  change_type text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.venue_changelog IS 'Audit log of venue configuration changes (settings, manager, name, etc).';

ALTER TABLE public.venue_changelog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "theater_manager_read_own_venue_changelog" ON public.venue_changelog
  FOR SELECT USING (
    auth.uid() IN (SELECT theater_manager_id FROM public.venues WHERE id = venue_id)
    OR auth.uid() IN (SELECT user_id FROM public.frontrow_admins)
  );

CREATE POLICY "super_admin_all_venue_changelog" ON public.venue_changelog
  FOR ALL USING (
    auth.uid() IN (SELECT user_id FROM public.frontrow_admins)
  );

CREATE TABLE IF NOT EXISTS public.session_changelog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.session_changelog IS 'Audit log of session events (created, started, performer invited, ended, etc).';

ALTER TABLE public.session_changelog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "performers_read_own_session_changelog" ON public.session_changelog
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_id AND auth.uid() = ANY(s.performer_ids)
    )
  );

CREATE POLICY "theater_manager_read_own_venue_session_changelog" ON public.session_changelog
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_id AND auth.uid() IN (SELECT theater_manager_id FROM public.venues WHERE id = s.venue_id)
    )
    OR auth.uid() IN (SELECT user_id FROM public.frontrow_admins)
  );

CREATE POLICY "super_admin_all_session_changelog" ON public.session_changelog
  FOR ALL USING (
    auth.uid() IN (SELECT user_id FROM public.frontrow_admins)
  );

-- ============================================================================
-- 10. HELPER TABLE: AUDIENCE ATTENDANCE (for replay eligibility)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.audience_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, user_id)
);

COMMENT ON TABLE public.audience_attendance IS 'Track who attended a session (for feedback eligibility). Populated when user joins a live session.';

ALTER TABLE public.audience_attendance ENABLE ROW LEVEL SECURITY;

-- Users can only write their own attendance
CREATE POLICY "users_write_own_attendance" ON public.audience_attendance
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Only super admins can read (for analytics)
CREATE POLICY "super_admin_read_attendance" ON public.audience_attendance
  FOR SELECT USING (
    auth.uid() IN (SELECT user_id FROM public.frontrow_admins)
  );

-- ============================================================================
-- 11. GRANT PERMISSIONS (for Netlify functions, if needed)
-- ============================================================================

-- Service role (via Netlify env) can manage feedback submissions
GRANT INSERT ON public.show_feedback TO authenticated;
GRANT INSERT ON public.frontrow_feedback TO authenticated;

-- ============================================================================
-- DONE
-- ============================================================================

-- All tables are ready for RLS. Deploy this migration via Supabase Dashboard SQL Editor.
-- After deployment:
-- 1. Run `INSERT INTO public.frontrow_admins (user_id, email) VALUES (...)`
--    to register the 5 super admins
-- 2. Create at least one venue + room_template for testing
-- 3. Auth flow can begin

