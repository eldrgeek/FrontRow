-- FrontRow 005: who may build and run a theater, and what state it is in.
-- Target: shared project omfwcodoimjmbrhssvfl. NOT YET APPLIED: needs Mike's yes.
-- Runs after 003 (theater definitions) and 004 (tickets); it replaces 004's two
-- hook functions (frontrow_ticket_can_manage, frontrow_room_mode). Additive and idempotent.
--
-- Adds:
--   1. create_theater(slug, blueprint, manager): admin-only; stores a new theater.
--   2. theater_roles: venue_manager on a theater, performance_manager on a screen.
--      frontrow_can_manage_theater() / frontrow_can_manage_room() are the one
--      answer to "is this person a manager"; tickets (004) and the builder call them.
--   3. builder_grants: one theater, one email, an expiry (at most 90 days),
--      revocable. frontrow_can_build() gates /build/:theater and saves.
--   4. venues.builder_room_id: the theater's one SOMA builder room.
--   5. venues.status: theater draft|preview|open|dark|archived,
--      screen proposed|setup|open|dark|retired. Guests see a theater only when
--      it is open or dark; preview/draft are visible to its builders only.
--   6. save_theater_definition() re-created with JSON shape checks, so calling
--      the RPC directly cannot store a definition the app would choke on.
--
-- Existing rows: Front Row and its screens become 'open', and Mike (Front Row's
-- theater_manager_id) gets an explicit venue_manager role. Nothing guests see changes.

-- ---------------------------------------------------------------------------
-- 5. Status (first, because the visibility helpers read it)
-- ---------------------------------------------------------------------------
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS builder_room_id text;

UPDATE public.venues SET status = 'open' WHERE status IS NULL;

-- New rows without a status: a theater starts as a draft, a screen as proposed.
CREATE OR REPLACE FUNCTION public.frontrow_venue_default_status() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS NULL THEN
    NEW.status := CASE WHEN NEW.super_venue_id IS NULL THEN 'draft' ELSE 'proposed' END;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS venues_default_status ON public.venues;
CREATE TRIGGER venues_default_status BEFORE INSERT ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.frontrow_venue_default_status();

ALTER TABLE public.venues ALTER COLUMN status SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venues_status_values') THEN
    ALTER TABLE public.venues ADD CONSTRAINT venues_status_values CHECK (
      (super_venue_id IS NULL AND status IN ('draft', 'preview', 'open', 'dark', 'archived'))
      OR (super_venue_id IS NOT NULL AND status IN ('proposed', 'setup', 'open', 'dark', 'retired'))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venues_builder_room_only_on_theaters') THEN
    ALTER TABLE public.venues ADD CONSTRAINT venues_builder_room_only_on_theaters
      CHECK (builder_room_id IS NULL OR (super_venue_id IS NULL AND length(builder_room_id) BETWEEN 1 AND 128));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Roles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.theater_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('venue_manager', 'performance_manager')),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
COMMENT ON TABLE public.theater_roles IS 'venue_manager on a theater (parent venue) or performance_manager on a screen (child venue). Written only through grant_theater_role / revoke_theater_role.';
CREATE UNIQUE INDEX IF NOT EXISTS theater_roles_one_active
  ON public.theater_roles (venue_id, user_id, role) WHERE revoked_at IS NULL;

-- A venue_manager role sits on a theater; a performance_manager role on a screen.
CREATE OR REPLACE FUNCTION public.frontrow_theater_role_check() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_parent uuid;
BEGIN
  SELECT super_venue_id INTO v_parent FROM public.venues WHERE id = NEW.venue_id;
  IF NEW.role = 'venue_manager' AND v_parent IS NOT NULL THEN
    RAISE EXCEPTION 'venue_manager goes on a theater, not a screen' USING ERRCODE = '22023';
  END IF;
  IF NEW.role = 'performance_manager' AND v_parent IS NULL THEN
    RAISE EXCEPTION 'performance_manager goes on a screen, not a theater' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS theater_roles_check ON public.theater_roles;
CREATE TRIGGER theater_roles_check BEFORE INSERT OR UPDATE ON public.theater_roles
  FOR EACH ROW EXECUTE FUNCTION public.frontrow_theater_role_check();

-- ---------------------------------------------------------------------------
-- 3. Builder grants
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.builder_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(email) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  expires_at timestamptz NOT NULL,
  note text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT builder_grants_at_most_90_days CHECK (expires_at <= created_at + interval '90 days')
);
COMMENT ON TABLE public.builder_grants IS 'One theater, one email, an expiry (<= 90 days), revocable. Re-read on every check, so a revoke takes effect on the next request.';
CREATE INDEX IF NOT EXISTS builder_grants_lookup ON public.builder_grants (venue_id, email) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- Answers (SECURITY DEFINER so policies can call them without recursion)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.frontrow_user_email(uid uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$ SELECT lower(email) FROM auth.users WHERE id = uid $$;

-- The theater a venue belongs to (itself, for a theater).
CREATE OR REPLACE FUNCTION public.frontrow_theater_of(p_venue uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE(super_venue_id, id) FROM public.venues WHERE id = p_venue $$;

-- Admin, the theater's theater_manager_id, or an active venue_manager role.
CREATE OR REPLACE FUNCTION public.frontrow_can_manage_theater(uid uuid, p_venue uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT uid IS NOT NULL AND (
    public.is_frontrow_admin(uid)
    OR EXISTS (SELECT 1 FROM public.venues v WHERE v.id = public.frontrow_theater_of(p_venue) AND v.theater_manager_id = uid)
    OR EXISTS (SELECT 1 FROM public.theater_roles r
                WHERE r.venue_id = public.frontrow_theater_of(p_venue) AND r.user_id = uid
                  AND r.role = 'venue_manager' AND r.revoked_at IS NULL)
  )
$$;

-- A theater manager, or an active performance_manager on this screen.
CREATE OR REPLACE FUNCTION public.frontrow_can_manage_room(uid uuid, p_screen uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT uid IS NOT NULL AND (
    public.frontrow_can_manage_theater(uid, p_screen)
    OR EXISTS (SELECT 1 FROM public.theater_roles r
                WHERE r.venue_id = p_screen AND r.user_id = uid
                  AND r.role = 'performance_manager' AND r.revoked_at IS NULL)
  )
$$;

-- A theater manager, or someone whose email holds an unexpired, unrevoked builder grant.
CREATE OR REPLACE FUNCTION public.frontrow_can_build(uid uuid, p_venue uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT uid IS NOT NULL AND (
    public.frontrow_can_manage_theater(uid, p_venue)
    OR EXISTS (SELECT 1 FROM public.builder_grants g
                WHERE g.venue_id = public.frontrow_theater_of(p_venue)
                  AND g.email = public.frontrow_user_email(uid)
                  AND g.revoked_at IS NULL AND g.expires_at > now())
  )
$$;

-- Slug-based forms, for callers that only know slugs (tickets, the builder).
CREATE OR REPLACE FUNCTION public.frontrow_venue_by_slug(p_slug text, p_screen text DEFAULT NULL) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE WHEN p_screen IS NULL THEN t.id
              ELSE (SELECT s.id FROM public.venues s WHERE s.super_venue_id = t.id AND s.screen_key = p_screen) END
    FROM public.venues t WHERE t.slug = p_slug AND t.super_venue_id IS NULL
$$;

-- Who may manage {theater slug, screen key or null}. Tickets call this with service_role.
CREATE OR REPLACE FUNCTION public.frontrow_can_manage(uid uuid, p_slug text, p_screen text DEFAULT NULL) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE WHEN p_screen IS NULL
              THEN COALESCE(public.frontrow_can_manage_theater(uid, public.frontrow_venue_by_slug(p_slug)), false)
              ELSE COALESCE(public.frontrow_can_manage_room(uid, public.frontrow_venue_by_slug(p_slug, p_screen)), false) END
$$;

-- Can this caller see the theater (or screen) at all? Open/dark: everyone. Draft/preview: its builders.
CREATE OR REPLACE FUNCTION public.frontrow_venue_visible(uid uuid, p_venue uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.venues t
     WHERE t.id = public.frontrow_theater_of(p_venue) AND t.active
       AND (t.status IN ('open', 'dark')
            OR (t.status IN ('draft', 'preview') AND public.frontrow_can_build(uid, t.id))
            OR public.is_frontrow_admin(uid))
  )
$$;

GRANT EXECUTE ON FUNCTION public.frontrow_can_manage_theater(uuid, uuid), public.frontrow_can_manage_room(uuid, uuid),
  public.frontrow_can_build(uuid, uuid), public.frontrow_venue_visible(uuid, uuid), public.frontrow_can_manage(uuid, text, text),
  public.frontrow_venue_by_slug(text, text), public.frontrow_theater_of(uuid)
  TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.frontrow_user_email(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.frontrow_user_email(uuid) TO service_role;

-- The caller's own email, for policies (frontrow_user_email would let anyone look up anyone).
CREATE OR REPLACE FUNCTION public.frontrow_my_email() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$ SELECT lower(email) FROM auth.users WHERE id = auth.uid() $$;
GRANT EXECUTE ON FUNCTION public.frontrow_my_email() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Visibility: replace 002's "every active venue" read with the status rule.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "anyone_read_active_venues" ON public.venues;
DROP POLICY IF EXISTS "read_visible_venues" ON public.venues;
CREATE POLICY "read_visible_venues" ON public.venues FOR SELECT
  USING (public.frontrow_venue_visible(auth.uid(), id));

DROP POLICY IF EXISTS "venue_settings_read" ON public.venue_settings;
CREATE POLICY "venue_settings_read" ON public.venue_settings FOR SELECT
  USING (public.frontrow_venue_visible(auth.uid(), venue_id));

DROP POLICY IF EXISTS "theater_changes_manager_read" ON public.theater_changes;
CREATE POLICY "theater_changes_manager_read" ON public.theater_changes FOR SELECT
  USING (public.frontrow_can_build(auth.uid(), venue_id));

ALTER TABLE public.theater_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "theater_roles_read" ON public.theater_roles;
CREATE POLICY "theater_roles_read" ON public.theater_roles FOR SELECT
  USING (user_id = auth.uid() OR public.frontrow_can_manage_theater(auth.uid(), venue_id));

ALTER TABLE public.builder_grants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "builder_grants_read" ON public.builder_grants;
CREATE POLICY "builder_grants_read" ON public.builder_grants FOR SELECT
  USING (public.frontrow_can_manage_theater(auth.uid(), venue_id)
         OR email = public.frontrow_my_email());

GRANT SELECT ON public.theater_roles, public.builder_grants TO authenticated;
GRANT ALL ON public.theater_roles, public.builder_grants TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Shape checks
-- ---------------------------------------------------------------------------
-- Returns the problems with a definition; empty means storable. Mirrors
-- validateDefinition() in src/theater/definition.ts, plus value checks.
CREATE OR REPLACE FUNCTION public.frontrow_definition_problems(d jsonb) RETURNS text[]
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  errs text[] := '{}';
  slug_re constant text := '^[a-z0-9]+(-[a-z0-9]+)*$';
  s jsonb; i int := 0; k text; v jsonb; ids text[] := '{}'; lives int := 0; at text;
BEGIN
  IF jsonb_typeof(d) IS DISTINCT FROM 'object' THEN RETURN ARRAY['definition is not an object']; END IF;
  IF pg_column_size(d) > 262144 THEN errs := errs || text 'definition is larger than 256 KB'; END IF;
  IF d->'schema' IS DISTINCT FROM '1'::jsonb THEN errs := errs || text 'schema must be 1'; END IF;
  IF NOT (COALESCE(d->>'slug', '') ~ slug_re AND length(d->>'slug') <= 40) THEN errs := errs || text 'slug is not a slug'; END IF;
  IF COALESCE(btrim(d->>'name'), '') = '' OR length(d->>'name') > 80 THEN errs := errs || text 'name must be 1 to 80 characters'; END IF;

  IF jsonb_typeof(d->'theme'->'palette') IS DISTINCT FROM 'object' THEN
    errs := errs || text 'theme.palette is required';
  ELSE
    FOREACH k IN ARRAY ARRAY['wall', 'marquee', 'marqueeText', 'accent', 'seat'] LOOP
      IF NOT (d->'theme'->'palette' ? k) THEN errs := errs || format('theme.palette.%s is required', k); END IF;
    END LOOP;
    FOR k, v IN SELECT * FROM jsonb_each(d->'theme'->'palette') LOOP
      IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR (v #>> '{}') !~ '^#[0-9a-f]{6}$' THEN
        errs := errs || format('theme.palette.%s must be a color like #1a2b3c', k);
      END IF;
    END LOOP;
  END IF;
  IF d->'theme' ? 'curtain' AND (d->'theme'->>'curtain') NOT IN ('velvet-red', 'velvet-blue', 'none') THEN
    errs := errs || text 'theme.curtain must be velvet-red, velvet-blue or none';
  END IF;

  IF jsonb_typeof(d->'screens') IS DISTINCT FROM 'array' OR jsonb_array_length(d->'screens') = 0 THEN
    RETURN errs || text 'at least one screen is required';
  END IF;
  IF jsonb_array_length(d->'screens') > 24 THEN errs := errs || text 'at most 24 screens'; END IF;

  FOR s IN SELECT * FROM jsonb_array_elements(d->'screens') LOOP
    at := format('screens[%s]', i); i := i + 1;
    IF jsonb_typeof(s) IS DISTINCT FROM 'object' THEN errs := errs || (at || ' is not an object'); CONTINUE; END IF;
    IF NOT (COALESCE(s->>'id', '') ~ slug_re AND length(s->>'id') <= 40) THEN errs := errs || (at || '.id is not a slug');
    ELSIF (s->>'id') = ANY (ids) THEN errs := errs || format('%s.id "%s" is used twice', at, s->>'id');
    ELSE ids := ids || (s->>'id'); END IF;
    IF (s->>'kind') IS NULL OR (s->>'kind') NOT IN ('live', 'shelf') THEN errs := errs || (at || '.kind must be live or shelf'); END IF;
    IF (s->>'template') IS NULL OR (s->>'template') NOT IN ('proscenium', 'cabaret', 'black-box', 'roundtable', 'custom') THEN
      errs := errs || (at || '.template is not a known template');
    END IF;
    IF jsonb_typeof(s->'order') IS DISTINCT FROM 'number' THEN errs := errs || (at || '.order must be a number'); END IF;
    IF jsonb_typeof(s->'marquee') IS DISTINCT FROM 'array'
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(s->'marquee') m WHERE jsonb_typeof(m) <> 'string' OR length(m #>> '{}') > 60)
       OR jsonb_array_length(s->'marquee') > 4 THEN
      errs := errs || (at || '.marquee must be up to 4 lines of up to 60 characters');
    END IF;
    IF jsonb_typeof(s->'title') IS DISTINCT FROM 'string' OR length(s->>'title') > 120 THEN errs := errs || (at || '.title must be text up to 120 characters'); END IF;
    IF jsonb_typeof(s->'blurb') IS DISTINCT FROM 'string' OR length(s->>'blurb') > 600 THEN errs := errs || (at || '.blurb must be text up to 600 characters'); END IF;
    IF s->>'kind' = 'live' THEN
      lives := lives + 1;
      IF jsonb_typeof(s->'seats'->'count') IS DISTINCT FROM 'number'
         OR (s->'seats'->>'count')::numeric NOT BETWEEN 1 AND 99
         OR (s->'seats'->>'count')::numeric <> trunc((s->'seats'->>'count')::numeric) THEN
        errs := errs || (at || '.seats.count must be a whole number from 1 to 99');
      END IF;
    END IF;
    IF s->'seats' ? 'arrangement' AND (s->'seats'->>'arrangement') NOT IN ('semicircle', 'rows', 'tables', 'round', 'horseshoe') THEN
      errs := errs || (at || '.seats.arrangement is not a known arrangement');
    END IF;
    IF s ? 'shelf' AND (jsonb_typeof(s->'shelf') IS DISTINCT FROM 'array'
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(s->'shelf') x
                   WHERE NOT (COALESCE(x->>'youtubeId', '') ~ '^[A-Za-z0-9_-]{6,20}$'
                              OR (COALESCE(x->>'videoUrl', '') ~ '^https://[^\s"<>]+$' AND length(x->>'videoUrl') <= 500)))) THEN
      errs := errs || (at || '.shelf videos need a YouTube id or an https videoUrl');
    END IF;
  END LOOP;
  IF lives > 1 THEN errs := errs || text 'only one live screen is supported for now'; END IF;
  RETURN errs;
END $$;
GRANT EXECUTE ON FUNCTION public.frontrow_definition_problems(jsonb) TO anon, authenticated, service_role;

-- Keep one active child venue per screen of a definition; switch off the rest.
CREATE OR REPLACE FUNCTION public.frontrow_sync_screens(p_theater uuid, p_definition jsonb, p_uid uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s jsonb; keys text[] := '{}'; mgr uuid;
BEGIN
  SELECT theater_manager_id INTO mgr FROM public.venues WHERE id = p_theater;
  FOR s IN SELECT * FROM jsonb_array_elements(p_definition->'screens') LOOP
    keys := keys || (s->>'id');
    INSERT INTO public.venues (super_venue_id, screen_key, name, room_template_id, theater_manager_id, active, created_by)
    VALUES (p_theater, s->>'id', replace(s->>'title', '{artist}', 'Tonight'),
            (SELECT id FROM public.room_templates WHERE name = s->>'template'), mgr, true, COALESCE(p_uid, mgr))
    ON CONFLICT (super_venue_id, screen_key) WHERE screen_key IS NOT NULL
    DO UPDATE SET name = EXCLUDED.name, room_template_id = EXCLUDED.room_template_id, active = true,
                  status = CASE WHEN public.venues.status = 'retired' THEN 'setup' ELSE public.venues.status END;
  END LOOP;
  UPDATE public.venues SET active = false, status = 'retired'
   WHERE super_venue_id = p_theater AND screen_key IS NOT NULL AND NOT (screen_key = ANY (keys));
END $$;
REVOKE ALL ON FUNCTION public.frontrow_sync_screens(uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- save_theater_definition, again: builders may save; shape checked; screens synced.
-- Same signature and return shape as 003.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_theater_definition(
  p_slug text, p_definition jsonb, p_base_version integer, p_change_note text DEFAULT ''
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_theater public.venues%ROWTYPE;
  v_settings public.venue_settings%ROWTYPE;
  v_uid uuid := auth.uid();
  v_new integer;
  v_problems text[];
BEGIN
  SELECT * INTO v_theater FROM public.venues WHERE slug = p_slug AND super_venue_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'no theater with slug %', p_slug USING ERRCODE = 'P0002'; END IF;
  IF NOT public.frontrow_can_build(v_uid, v_theater.id) THEN
    RAISE EXCEPTION 'only this theater''s managers and builders can change it' USING ERRCODE = '42501';
  END IF;
  IF v_theater.status = 'archived' THEN
    RAISE EXCEPTION 'this theater is archived' USING ERRCODE = '55000';
  END IF;
  IF p_definition->>'slug' IS DISTINCT FROM p_slug THEN
    RAISE EXCEPTION 'definition.slug must equal %', p_slug USING ERRCODE = '22023';
  END IF;
  v_problems := public.frontrow_definition_problems(p_definition);
  IF cardinality(v_problems) > 0 THEN
    RAISE EXCEPTION 'definition not stored: %', array_to_string(v_problems, '; ') USING ERRCODE = '22023';
  END IF;
  IF length(COALESCE(p_change_note, '')) > 500 THEN
    RAISE EXCEPTION 'change note is longer than 500 characters' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_settings FROM public.venue_settings WHERE venue_id = v_theater.id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.venue_settings (venue_id, config, updated_by, version)
    VALUES (v_theater.id, '{}', v_uid, 0) RETURNING * INTO v_settings;
  END IF;
  IF p_base_version IS DISTINCT FROM v_settings.version THEN
    RETURN jsonb_build_object('ok', false, 'conflict', true, 'version', v_settings.version,
                              'definition', v_settings.config->'definition');
  END IF;

  v_new := v_settings.version + 1;
  UPDATE public.venue_settings
     SET config = jsonb_set(config, '{definition}', p_definition, true),
         version = v_new, updated_at = now(), updated_by = v_uid
   WHERE id = v_settings.id;
  UPDATE public.venues SET name = p_definition->>'name' WHERE id = v_theater.id;
  PERFORM public.frontrow_sync_screens(v_theater.id, p_definition, v_uid);
  INSERT INTO public.theater_changes (venue_id, version, definition, change_note, changed_by)
  VALUES (v_theater.id, v_new, p_definition, COALESCE(p_change_note, ''), v_uid);
  RETURN jsonb_build_object('ok', true, 'version', v_new);
END $$;
REVOKE ALL ON FUNCTION public.save_theater_definition(text, jsonb, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_theater_definition(text, jsonb, integer, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. create_theater: admin-only. The theater starts as a draft.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_theater(p_slug text, p_blueprint jsonb, p_manager uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_def jsonb;
  v_problems text[];
BEGIN
  IF NOT public.is_frontrow_admin(v_uid) THEN
    RAISE EXCEPTION 'only a FrontRow admin can create a theater' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_manager) THEN
    RAISE EXCEPTION 'manager % is not a user', p_manager USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.venues WHERE slug = p_slug) THEN
    RAISE EXCEPTION 'a theater called % already exists', p_slug USING ERRCODE = '23505';
  END IF;
  -- The blueprint's slug is replaced by the new one, so a copied theater gets its own.
  v_def := jsonb_set(p_blueprint, '{slug}', to_jsonb(p_slug), true);
  v_problems := public.frontrow_definition_problems(v_def);
  IF cardinality(v_problems) > 0 THEN
    RAISE EXCEPTION 'blueprint not stored: %', array_to_string(v_problems, '; ') USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.venues (slug, name, room_template_id, theater_manager_id, active, status, created_by)
  VALUES (p_slug, v_def->>'name', (SELECT id FROM public.room_templates WHERE name = 'custom'),
          p_manager, true, 'draft', v_uid)
  RETURNING id INTO v_id;
  INSERT INTO public.venue_settings (venue_id, config, updated_by, version)
  VALUES (v_id, jsonb_build_object('definition', v_def), v_uid, 1);
  PERFORM public.frontrow_sync_screens(v_id, v_def, v_uid);
  INSERT INTO public.theater_roles (venue_id, user_id, role, granted_by) VALUES (v_id, p_manager, 'venue_manager', v_uid);
  INSERT INTO public.theater_changes (venue_id, version, definition, change_note, changed_by)
  VALUES (v_id, 1, v_def, 'Created', v_uid);
  RETURN jsonb_build_object('ok', true, 'venue_id', v_id, 'version', 1);
END $$;
REVOKE ALL ON FUNCTION public.create_theater(text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_theater(text, jsonb, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Roles, grants, room, status: small RPCs, each checking the caller.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_theater_role(p_slug text, p_screen text, p_user uuid, p_role text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_venue uuid := public.frontrow_venue_by_slug(p_slug, p_screen); v_id uuid;
BEGIN
  IF v_venue IS NULL THEN RAISE EXCEPTION 'no such theater or screen' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.frontrow_can_manage_theater(auth.uid(), v_venue) THEN
    RAISE EXCEPTION 'only this theater''s managers can give roles' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO v_id FROM public.theater_roles WHERE venue_id = v_venue AND user_id = p_user AND role = p_role AND revoked_at IS NULL;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  INSERT INTO public.theater_roles (venue_id, user_id, role, granted_by) VALUES (v_venue, p_user, p_role, auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.revoke_theater_role(p_role_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_venue uuid;
BEGIN
  SELECT venue_id INTO v_venue FROM public.theater_roles WHERE id = p_role_id AND revoked_at IS NULL;
  IF v_venue IS NULL THEN RETURN false; END IF;
  IF NOT public.frontrow_can_manage_theater(auth.uid(), v_venue) THEN
    RAISE EXCEPTION 'only this theater''s managers can take roles away' USING ERRCODE = '42501';
  END IF;
  UPDATE public.theater_roles SET revoked_at = now(), revoked_by = auth.uid() WHERE id = p_role_id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.grant_builder(p_slug text, p_email text, p_days integer DEFAULT 30, p_note text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_venue uuid := public.frontrow_venue_by_slug(p_slug); v_id uuid;
BEGIN
  IF v_venue IS NULL THEN RAISE EXCEPTION 'no theater with slug %', p_slug USING ERRCODE = 'P0002'; END IF;
  IF NOT public.frontrow_can_manage_theater(auth.uid(), v_venue) THEN
    RAISE EXCEPTION 'only this theater''s managers can invite builders' USING ERRCODE = '42501';
  END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 90 THEN
    RAISE EXCEPTION 'a builder grant lasts 1 to 90 days' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.builder_grants (venue_id, email, expires_at, note, created_by)
  VALUES (v_venue, lower(btrim(p_email)), now() + make_interval(days => p_days), COALESCE(p_note, ''), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.revoke_builder_grant(p_grant uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_venue uuid;
BEGIN
  SELECT venue_id INTO v_venue FROM public.builder_grants WHERE id = p_grant AND revoked_at IS NULL;
  IF v_venue IS NULL THEN RETURN false; END IF;
  IF NOT public.frontrow_can_manage_theater(auth.uid(), v_venue) THEN
    RAISE EXCEPTION 'only this theater''s managers can revoke a builder' USING ERRCODE = '42501';
  END IF;
  UPDATE public.builder_grants SET revoked_at = now(), revoked_by = auth.uid() WHERE id = p_grant;
  RETURN true;
END $$;

-- Sets the theater's builder room once; changing an existing one needs a manager.
CREATE OR REPLACE FUNCTION public.set_builder_room(p_slug text, p_room_id text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_venue uuid := public.frontrow_venue_by_slug(p_slug); v_current text;
BEGIN
  IF v_venue IS NULL THEN RAISE EXCEPTION 'no theater with slug %', p_slug USING ERRCODE = 'P0002'; END IF;
  IF NOT public.frontrow_can_build(auth.uid(), v_venue) THEN
    RAISE EXCEPTION 'only this theater''s builders can set its room' USING ERRCODE = '42501';
  END IF;
  SELECT builder_room_id INTO v_current FROM public.venues WHERE id = v_venue FOR UPDATE;
  IF v_current IS NOT NULL AND v_current <> p_room_id AND NOT public.frontrow_can_manage_theater(auth.uid(), v_venue) THEN
    RETURN v_current;  -- someone already made the room: join that one
  END IF;
  UPDATE public.venues SET builder_room_id = p_room_id WHERE id = v_venue;
  RETURN p_room_id;
END $$;

CREATE OR REPLACE FUNCTION public.set_venue_status(p_slug text, p_screen text, p_status text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_venue uuid := public.frontrow_venue_by_slug(p_slug, p_screen);
BEGIN
  IF v_venue IS NULL THEN RAISE EXCEPTION 'no such theater or screen' USING ERRCODE = 'P0002'; END IF;
  IF p_screen IS NULL AND NOT public.frontrow_can_manage_theater(auth.uid(), v_venue) THEN
    RAISE EXCEPTION 'only this theater''s managers can change its status' USING ERRCODE = '42501';
  END IF;
  IF p_screen IS NOT NULL AND NOT public.frontrow_can_manage_room(auth.uid(), v_venue) THEN
    RAISE EXCEPTION 'only this room''s managers can change its status' USING ERRCODE = '42501';
  END IF;
  UPDATE public.venues SET status = p_status WHERE id = v_venue;  -- venues_status_values rejects a wrong value
  RETURN p_status;
END $$;

-- What the builder page needs to know about the caller, in one call.
CREATE OR REPLACE FUNCTION public.frontrow_builder_access(p_slug text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_venue uuid := public.frontrow_venue_by_slug(p_slug); v_room text; v_status text;
BEGIN
  IF v_venue IS NULL THEN
    RETURN jsonb_build_object('exists', false, 'can_build', false, 'can_approve', false, 'builder_room_id', null, 'status', null);
  END IF;
  IF NOT public.frontrow_can_build(auth.uid(), v_venue) THEN
    -- A draft or preview theater is not admitted to, even by name.
    RETURN jsonb_build_object('exists', public.frontrow_venue_visible(auth.uid(), v_venue), 'can_build', false, 'can_approve', false, 'builder_room_id', null, 'status', null);
  END IF;
  SELECT builder_room_id, status INTO v_room, v_status FROM public.venues WHERE id = v_venue;
  RETURN jsonb_build_object('exists', true, 'can_build', true,
                            'can_approve', public.frontrow_can_manage_theater(auth.uid(), v_venue),
                            'builder_room_id', v_room, 'status', v_status);
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['grant_theater_role(text, text, uuid, text)', 'revoke_theater_role(uuid)',
                           'grant_builder(text, text, integer, text)', 'revoke_builder_grant(uuid)',
                           'set_builder_room(text, text)', 'set_venue_status(text, text, text)', 'frontrow_builder_access(text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Ticket hooks from 004, now reading roles and status. Same signatures and
-- return shapes; service_role only, as in 004.
-- ---------------------------------------------------------------------------
-- {user_id, venue_id: theater slug} -> {ok, admin, manager}. manager covers
-- theater_manager_id and an active venue_manager role (frontrow_can_manage).
CREATE OR REPLACE FUNCTION public.frontrow_ticket_can_manage(p jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object('ok', true,
    'admin', public.is_frontrow_admin((p->>'user_id')::uuid),
    'manager', public.frontrow_can_manage((p->>'user_id')::uuid, p->>'venue_id'))
$$;

-- {venue_id: theater slug, room_id: screen slug} -> {mode}. A ticketless guest
-- gets in only when both the theater and the screen are open, which is how
-- Front Row works today. Dark, setup, preview, draft, retired, archived or an
-- unknown room all need a ticket.
CREATE OR REPLACE FUNCTION public.frontrow_room_mode(p jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object('mode', CASE WHEN EXISTS (
    SELECT 1 FROM public.venues t JOIN public.venues s ON s.super_venue_id = t.id
     WHERE t.slug = p->>'venue_id' AND t.super_venue_id IS NULL AND t.active AND t.status = 'open'
       AND s.screen_key = p->>'room_id' AND s.active AND s.status = 'open'
  ) THEN 'open' ELSE 'ticketed' END)
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['frontrow_ticket_can_manage', 'frontrow_room_mode'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(jsonb) FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(jsonb) TO service_role', f);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Existing data: Front Row's manager gets an explicit role.
-- ---------------------------------------------------------------------------
INSERT INTO public.theater_roles (venue_id, user_id, role, granted_by)
SELECT v.id, v.theater_manager_id, 'venue_manager', v.theater_manager_id
  FROM public.venues v
 WHERE v.super_venue_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.theater_roles r WHERE r.venue_id = v.id AND r.user_id = v.theater_manager_id
                     AND r.role = 'venue_manager' AND r.revoked_at IS NULL);
