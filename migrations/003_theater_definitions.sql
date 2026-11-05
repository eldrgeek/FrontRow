-- FrontRow 003: theaters as definition records (theater kit, workstream 1).
-- Target: shared project omfwcodoimjmbrhssvfl. NOT YET APPLIED: needs Mike's yes.
-- Builds on 002 (which is what actually created venues/venue_settings; 001 was never run).
--
-- Shape:
--   * A theater is a parent `venues` row (super_venue_id IS NULL) with a unique `slug`.
--   * Each screen is a child `venues` row (super_venue_id = the theater) with a
--     `screen_key` equal to the screen's id in the definition ('revolution', 'live', ...).
--   * The whole definition (src/theater/definition.ts, TheaterDefinition) lives in the
--     parent's venue_settings.config->'definition', with venue_settings.version
--     counting saves.
--   * Every save goes through save_theater_definition(), which checks the caller is
--     the theater manager or a FrontRow admin, refuses a stale base version, keeps
--     the child screen rows in step, and appends to theater_changes.
--
-- Additive and idempotent: no column is dropped, no existing row loses data.
-- Front Row's existing venue_settings.config keys (seatCount, arrangement, ...) are
-- left alone; only a `definition` key is added.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS screen_key text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venues_slug_format') THEN
    ALTER TABLE public.venues ADD CONSTRAINT venues_slug_format
      CHECK (slug IS NULL OR slug ~ '^[a-z0-9][a-z0-9-]{0,39}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venues_screen_key_format') THEN
    ALTER TABLE public.venues ADD CONSTRAINT venues_screen_key_format
      CHECK (screen_key IS NULL OR screen_key ~ '^[a-z0-9][a-z0-9-]{0,39}$');
  END IF;
  -- A theater has a slug and no screen_key; a screen has a screen_key and no slug.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venues_slug_only_on_theaters') THEN
    ALTER TABLE public.venues ADD CONSTRAINT venues_slug_only_on_theaters
      CHECK (slug IS NULL OR super_venue_id IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venues_screen_key_only_on_screens') THEN
    ALTER TABLE public.venues ADD CONSTRAINT venues_screen_key_only_on_screens
      CHECK (screen_key IS NULL OR super_venue_id IS NOT NULL);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS venues_slug_key ON public.venues (slug) WHERE slug IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS venues_screen_key_per_theater
  ON public.venues (super_venue_id, screen_key) WHERE screen_key IS NOT NULL;

ALTER TABLE public.venue_settings ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- The definition type allows a 'roundtable' template that 002 did not seed.
INSERT INTO public.room_templates (name, description)
VALUES ('roundtable', 'Seats in a ring, no stage: a conversation room')
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Change log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.theater_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  version integer NOT NULL,
  definition jsonb NOT NULL,
  change_note text NOT NULL DEFAULT '',
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, version)
);
COMMENT ON TABLE public.theater_changes IS 'Every saved version of a theater definition, newest = venue_settings.version. Written only by save_theater_definition().';

ALTER TABLE public.theater_changes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "theater_changes_manager_read" ON public.theater_changes;
CREATE POLICY "theater_changes_manager_read" ON public.theater_changes FOR SELECT
  USING (
    public.is_frontrow_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.venues v WHERE v.id = theater_changes.venue_id AND v.theater_manager_id = auth.uid())
  );
GRANT SELECT ON public.theater_changes TO authenticated;
GRANT ALL ON public.theater_changes TO service_role;

-- ---------------------------------------------------------------------------
-- Save
-- ---------------------------------------------------------------------------
-- Returns {"ok":true,"version":n} or {"ok":false,"conflict":true,"version":n,"definition":{...}}
-- or raises (not found, not allowed, bad definition).
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
  v_screen jsonb;
  v_keys text[] := '{}';
  v_template uuid;
BEGIN
  SELECT * INTO v_theater FROM public.venues WHERE slug = p_slug AND super_venue_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'no theater with slug %', p_slug USING ERRCODE = 'P0002'; END IF;

  IF v_uid IS NULL OR NOT (v_uid = v_theater.theater_manager_id OR public.is_frontrow_admin(v_uid)) THEN
    RAISE EXCEPTION 'only this theater''s manager or a FrontRow admin can change it' USING ERRCODE = '42501';
  END IF;

  IF p_definition->>'slug' IS DISTINCT FROM p_slug THEN
    RAISE EXCEPTION 'definition.slug must equal %', p_slug USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_definition->'screens') IS DISTINCT FROM 'array' OR jsonb_array_length(p_definition->'screens') = 0 THEN
    RAISE EXCEPTION 'definition needs at least one screen' USING ERRCODE = '22023';
  END IF;

  -- Lock the settings row so two saves serialize.
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

  UPDATE public.venues SET name = COALESCE(p_definition->>'name', name) WHERE id = v_theater.id;

  -- Keep one active child venue per screen.
  FOR v_screen IN SELECT * FROM jsonb_array_elements(p_definition->'screens') LOOP
    IF (v_screen->>'id') IS NULL OR (v_screen->>'id') !~ '^[a-z0-9][a-z0-9-]{0,39}$' THEN
      RAISE EXCEPTION 'screen id % is not a slug', v_screen->>'id' USING ERRCODE = '22023';
    END IF;
    IF (v_screen->>'id') = ANY (v_keys) THEN
      RAISE EXCEPTION 'screen id % is used twice', v_screen->>'id' USING ERRCODE = '22023';
    END IF;
    v_keys := v_keys || (v_screen->>'id');
    SELECT id INTO v_template FROM public.room_templates WHERE name = COALESCE(v_screen->>'template', 'custom');
    IF v_template IS NULL THEN SELECT id INTO v_template FROM public.room_templates WHERE name = 'custom'; END IF;

    INSERT INTO public.venues (super_venue_id, screen_key, name, room_template_id, theater_manager_id, active, created_by)
    VALUES (v_theater.id, v_screen->>'id', replace(COALESCE(v_screen->>'title', v_screen->>'id'), '{artist}', 'Tonight'), v_template,
            v_theater.theater_manager_id, true, v_uid)
    ON CONFLICT (super_venue_id, screen_key) WHERE screen_key IS NOT NULL
    DO UPDATE SET name = EXCLUDED.name, room_template_id = EXCLUDED.room_template_id, active = true;
  END LOOP;

  -- A screen taken out of the definition is switched off, not deleted (its history stays).
  UPDATE public.venues SET active = false
   WHERE super_venue_id = v_theater.id AND screen_key IS NOT NULL AND NOT (screen_key = ANY (v_keys));

  INSERT INTO public.theater_changes (venue_id, version, definition, change_note, changed_by)
  VALUES (v_theater.id, v_new, p_definition, COALESCE(p_change_note, ''), v_uid);

  RETURN jsonb_build_object('ok', true, 'version', v_new);
END $$;

REVOKE ALL ON FUNCTION public.save_theater_definition(text, jsonb, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_theater_definition(text, jsonb, integer, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Seed: Front Row Theater is record 1.
-- The definition is src/theater/definition.ts `frontRowTheater`, verbatim. Guests see
-- no change: the app already renders this same definition from its built-in copy.
-- ---------------------------------------------------------------------------
UPDATE public.venues SET slug = 'front-row'
 WHERE id = 'a0000000-0000-4000-8000-000000000001' AND slug IS NULL;

-- Seeding runs as the migration owner (auth.uid() is null), so it writes directly
-- instead of calling save_theater_definition(). Only runs while no definition is stored.
DO $$
DECLARE
  v_id uuid := 'a0000000-0000-4000-8000-000000000001';
  v_mgr uuid;
  v_def jsonb := $json$
{"schema":1,"slug":"front-row","name":"Front Row Theater","hostedBy":"Noel Paul Stookey",
 "theme":{"palette":{"wall":"#2a0812","marquee":"#12050a","marqueeText":"#fff4d2","accent":"#d4af37","seat":"#9b1529"},"curtain":"velvet-red"},
 "currentShowSlug":"jess-wayne",
 "screens":[
  {"id":"revolution","kind":"shelf","template":"black-box","order":0,"marquee":["Songs of the","Revolution"],"title":"Songs of the Revolution","blurb":"Three-to-five-minute music videos. Short, urgent songs, playing all the time.","shelf":[]},
  {"id":"live","kind":"live","template":"proscenium","order":1,"marquee":["Live tonight","{artist}"],"title":"{artist}, live","blurb":"{when}. {setLength}. {seatsWord} seats, close to the stage.","seats":{"count":12,"arrangement":"semicircle"}},
  {"id":"library","kind":"shelf","template":"cabaret","order":2,"marquee":["Performance","Library"],"title":"The Performance Library","blurb":"Full concerts and past shows, ready whenever you want a front row seat.","shelf":[{"title":"Jess Wayne Trio, Part III","artist":"Jess Wayne Trio","youtubeId":"K6ZeroIZd5g","note":"A full set, 25 minutes."}]}
 ]}
$json$;
  v_screen jsonb;
BEGIN
  SELECT theater_manager_id INTO v_mgr FROM public.venues WHERE id = v_id;
  IF v_mgr IS NULL THEN RETURN; END IF;  -- Front Row not present: nothing to seed.
  IF EXISTS (SELECT 1 FROM public.venue_settings WHERE venue_id = v_id AND config ? 'definition') THEN RETURN; END IF;

  INSERT INTO public.venue_settings (venue_id, config, updated_by, version)
  VALUES (v_id, jsonb_build_object('definition', v_def), v_mgr, 1)
  ON CONFLICT (venue_id) DO UPDATE
    SET config = public.venue_settings.config || jsonb_build_object('definition', v_def),
        version = 1, updated_at = now();

  FOR v_screen IN SELECT * FROM jsonb_array_elements(v_def->'screens') LOOP
    INSERT INTO public.venues (super_venue_id, screen_key, name, room_template_id, theater_manager_id, active, created_by)
    VALUES (v_id, v_screen->>'id', replace(v_screen->>'title', '{artist}', 'Tonight'),
            (SELECT id FROM public.room_templates WHERE name = v_screen->>'template'), v_mgr, true, v_mgr)
    ON CONFLICT (super_venue_id, screen_key) WHERE screen_key IS NOT NULL DO NOTHING;
  END LOOP;

  INSERT INTO public.theater_changes (venue_id, version, definition, change_note, changed_by)
  VALUES (v_id, 1, v_def, 'Front Row Theater, seeded from the built-in definition (migration 003)', v_mgr)
  ON CONFLICT (venue_id, version) DO NOTHING;
END $$;
