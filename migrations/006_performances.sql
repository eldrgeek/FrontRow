-- FrontRow 006: performances, and recordings that reach the Library (theater kit, gap 7
-- in the plan review: "lifecycles aren't stored ... shows are compiled in, no recording
-- reaches the Library"). NOT YET APPLIED. Applying it is a production data change:
-- Mike's yes first. Idempotent: safe to re-run.
--
-- Runs after 003 (theaters as venues records), 004 (tickets) and 005 (records follow-up:
-- theater_roles, frontrow_can_manage_room, frontrow_definition_problems, venues.status).
-- Where 005's functions or columns are missing, this file falls back to "FrontRow admin or
-- the theater's theater_manager_id" and to a minimal shelf check, so it also applies on a
-- database that has only 003 and 004.
--
-- Shape:
--   * A performance is one night on one screen: theater_id (parent venues row), screen_id
--     (child venues row of that theater), and a slug unique within the theater. Tickets
--     already name a performance by slug (tickets.performance_id, 004), with venue_id =
--     theater slug and room_id = screen key, so no ticket column changes.
--   * status walks forward:
--       scheduled -> tickets-out -> doors -> green-room -> curtain -> after -> library
--     Steps may be skipped, never reversed. 'cancelled' can be reached from any step before
--     'after'. 'library' means the recording is on the shelf, or the night is filed with none.
--   * A recording is attached when it exists (a YouTube link or an https file URL, by a
--     manager or by a recorder's webhook). The Library job (frontrow_performance_shelve) puts it
--     on the theater's library shelf only if publish_recording is true: a performer agrees to
--     the Library before a recording goes there, and nothing publishes by default.
--
-- 002's `sessions` table is left alone: the pre-kit /venues pages (AdminDashboard, Room,
-- server/api-routes.js) still read it with their own status words.
--
-- Re-running 004 after this file puts 004's plain frontrow_ticket_redeem back in place of the
-- performance-aware one below; re-run this file after any re-run of 004.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.performances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  theater_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  screen_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE RESTRICT,
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 60),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  artist text NOT NULL DEFAULT '' CHECK (char_length(artist) <= 120),
  -- The words a guest reads (show.ts Show): stageName, tagline, when, doorsOpen, setLength,
  -- invitedBy, fallbackVideoUrl. Display text only; times that matter are the columns below.
  billing jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(billing) = 'object' AND pg_column_size(billing) <= 8192),
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'tickets-out', 'doors', 'green-room', 'curtain', 'after', 'library', 'cancelled')),
  starts_at timestamptz,
  doors_at timestamptz,
  ends_at timestamptz,
  -- NULL = the screen's own seat count. Same cap as lib/seatLayout.ts.
  seats integer CHECK (seats BETWEEN 1 AND 99),
  -- Which shelf screen the recording goes to. NULL = the screen whose key is 'library', else
  -- the first shelf screen in lobby order.
  shelf_screen_key text CHECK (shelf_screen_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(shelf_screen_key) <= 40),
  publish_recording boolean NOT NULL DEFAULT false,
  recording_status text NOT NULL DEFAULT 'none'
    CHECK (recording_status IN ('none', 'recording', 'ready', 'failed', 'shelved')),
  recording_url text CHECK (recording_url ~ '^https://' AND char_length(recording_url) <= 500),
  recording_note text CHECK (char_length(recording_note) <= 200),
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  shelved_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (theater_id, slug),
  CHECK (doors_at IS NULL OR starts_at IS NULL OR doors_at <= starts_at),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
  CHECK (recording_status NOT IN ('ready', 'shelved') OR recording_url IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS performances_screen_idx ON public.performances (screen_id, starts_at);
CREATE INDEX IF NOT EXISTS performances_shelve_due_idx ON public.performances (status, recording_status)
  WHERE status = 'after' AND recording_status = 'ready';
COMMENT ON TABLE public.performances IS 'One night on one screen of a kit theater. Status walks scheduled..library; tickets name it by slug. Written only through the functions in migration 006.';

-- Status order, for "forward only".
CREATE OR REPLACE FUNCTION public.frontrow_performance_step(s text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT array_position(ARRAY['scheduled', 'tickets-out', 'doors', 'green-room', 'curtain', 'after', 'library'], s)
$$;

-- screen_id must be a screen of theater_id, and theater_id a theater.
CREATE OR REPLACE FUNCTION public.frontrow_performance_check_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.venues WHERE id = NEW.theater_id AND super_venue_id IS NULL AND slug IS NOT NULL) THEN
    RAISE EXCEPTION 'performance theater_id must be a theater with a slug' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.venues WHERE id = NEW.screen_id AND super_venue_id = NEW.theater_id AND screen_key IS NOT NULL) THEN
    RAISE EXCEPTION 'performance screen_id must be a screen of its theater' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.theater_id IS DISTINCT FROM OLD.theater_id OR NEW.slug IS DISTINCT FROM OLD.slug THEN
      RAISE EXCEPTION 'a performance keeps its theater and slug (tickets name it by them)' USING ERRCODE = '23514';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS performances_check_row ON public.performances;
CREATE TRIGGER performances_check_row BEFORE INSERT OR UPDATE ON public.performances
  FOR EACH ROW EXECUTE FUNCTION public.frontrow_performance_check_row();

-- Guests read the schedule; the recording URL stays out of it until the job shelves it (the
-- shelf in the theater definition is then where guests find it). Writes go through the
-- functions below only.
ALTER TABLE public.performances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anyone_reads_performances" ON public.performances;
CREATE POLICY "anyone_reads_performances" ON public.performances FOR SELECT USING (true);
REVOKE ALL ON public.performances FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, theater_id, screen_id, slug, title, artist, billing, status, starts_at, doors_at, ends_at,
              seats, publish_recording, recording_status, status_changed_at, shelved_at)
  ON public.performances TO anon, authenticated;
GRANT ALL ON public.performances TO service_role;

-- ---------------------------------------------------------------------------
-- Authority
-- ---------------------------------------------------------------------------
-- May uid run performances on this screen? 005's frontrow_can_manage_room when it exists
-- (admin, theater_manager_id, venue_manager, performance_manager on that screen), else
-- admin or the theater's theater_manager_id.
CREATE OR REPLACE FUNCTION public.frontrow_performance_may_run(p_uid uuid, p_screen_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE ok boolean;
BEGIN
  IF p_uid IS NULL THEN RETURN false; END IF;
  IF to_regprocedure('public.frontrow_can_manage_room(uuid,uuid)') IS NOT NULL THEN
    EXECUTE 'SELECT public.frontrow_can_manage_room($1, $2)' INTO ok USING p_uid, p_screen_id;
    RETURN coalesce(ok, false);
  END IF;
  RETURN public.is_frontrow_admin(p_uid) OR EXISTS (
    SELECT 1 FROM public.venues s JOIN public.venues t ON t.id = s.super_venue_id
     WHERE s.id = p_screen_id AND t.theater_manager_id = p_uid);
END $$;

-- 005 gives screens a status; a performance only reaches the stage in an open screen.
CREATE OR REPLACE FUNCTION public.frontrow_performance_screen_open(p_screen_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE st text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'status') THEN
    RETURN true;
  END IF;
  EXECUTE 'SELECT status FROM public.venues WHERE id = $1' INTO st USING p_screen_id;
  RETURN st IS NULL OR st = 'open';
END $$;

-- ---------------------------------------------------------------------------
-- The one writer. p = {theater, slug, ...fields}. Callers:
--   save_performance(p)                   a signed-in manager (authenticated)
--   frontrow_performance_save(p)          frontrow-server / Netlify (service_role), p.actor = uid or null
-- Creates the performance if (theater, slug) is new, else updates the fields given.
-- Returns {ok:true, performance:{...}} or {ok:false, reason}.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.frontrow_performance_write(p jsonb, p_uid uuid, p_service boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_theater public.venues%ROWTYPE;
  v_screen public.venues%ROWTYPE;
  v_perf public.performances%ROWTYPE;
  v_exists boolean;
  v_status text;
  v_rec text;
  v_url text;
BEGIN
  SELECT * INTO v_theater FROM public.venues WHERE slug = p->>'theater' AND super_venue_id IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no-theater'); END IF;

  SELECT * INTO v_perf FROM public.performances WHERE theater_id = v_theater.id AND slug = p->>'slug' FOR UPDATE;
  v_exists := FOUND;

  IF p ? 'screen' THEN
    SELECT * INTO v_screen FROM public.venues WHERE super_venue_id = v_theater.id AND screen_key = p->>'screen';
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no-screen'); END IF;
  ELSIF v_exists THEN
    SELECT * INTO v_screen FROM public.venues WHERE id = v_perf.screen_id;
  ELSE
    RETURN jsonb_build_object('ok', false, 'reason', 'screen-required');
  END IF;

  IF NOT p_service OR p_uid IS NOT NULL THEN
    IF NOT public.frontrow_performance_may_run(p_uid, v_screen.id) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'not-allowed');
    END IF;
    -- Moving a performance to another screen needs the right on both.
    IF v_exists AND v_screen.id <> v_perf.screen_id AND NOT public.frontrow_performance_may_run(p_uid, v_perf.screen_id) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'not-allowed');
    END IF;
  END IF;

  IF NOT v_exists THEN
    IF NOT (p ? 'title') THEN RETURN jsonb_build_object('ok', false, 'reason', 'title-required'); END IF;
    INSERT INTO public.performances (theater_id, screen_id, slug, title, created_by)
    VALUES (v_theater.id, v_screen.id, p->>'slug', p->>'title', p_uid)
    RETURNING * INTO v_perf;
  END IF;

  -- A filed or cancelled night is history: it changes no more.
  IF v_exists AND v_perf.status IN ('library', 'cancelled') AND (p - 'theater' - 'slug' - 'actor') <> '{}'::jsonb THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'closed', 'status', v_perf.status);
  END IF;

  -- Status: forward only, cancel before 'after', curtain only in an open screen.
  v_status := coalesce(p->>'status', v_perf.status);
  IF v_status IS DISTINCT FROM v_perf.status THEN
    IF v_status = 'cancelled' THEN
      IF public.frontrow_performance_step(v_perf.status) >= public.frontrow_performance_step('after') THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'too-late-to-cancel', 'status', v_perf.status);
      END IF;
    ELSIF public.frontrow_performance_step(v_status) IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'bad-status');
    ELSIF v_perf.status = 'cancelled'
       OR public.frontrow_performance_step(v_status) < public.frontrow_performance_step(v_perf.status) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'backwards', 'status', v_perf.status);
    ELSIF v_status = 'library' AND v_perf.recording_status = 'ready' AND v_perf.publish_recording THEN
      -- A publishable recording reaches 'library' through the shelving job, which also shelves it.
      RETURN jsonb_build_object('ok', false, 'reason', 'shelve-instead', 'status', v_perf.status);
    END IF;
    IF public.frontrow_performance_step(v_status) BETWEEN public.frontrow_performance_step('green-room')
                                                       AND public.frontrow_performance_step('curtain')
       AND NOT public.frontrow_performance_screen_open(v_screen.id) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'screen-not-open');
    END IF;
  END IF;

  -- Recording.
  v_url := CASE WHEN p ? 'recording_url' THEN nullif(p->>'recording_url', '') ELSE v_perf.recording_url END;
  v_rec := coalesce(p->>'recording_status',
                    CASE WHEN p ? 'recording_url' AND v_url IS NOT NULL AND v_perf.recording_status IN ('none', 'recording', 'failed') THEN 'ready'
                         WHEN p ? 'recording_url' AND v_url IS NULL AND v_perf.recording_status <> 'shelved' THEN 'none'
                         ELSE v_perf.recording_status END);
  IF v_rec = 'shelved' AND v_perf.recording_status <> 'shelved' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'shelve-instead');
  END IF;
  IF v_perf.recording_status = 'shelved' AND (v_rec <> 'shelved' OR v_url IS DISTINCT FROM v_perf.recording_url) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already-shelved');
  END IF;
  IF v_url IS NOT NULL AND (v_url !~ '^https://[^\s<>"]+$' OR char_length(v_url) > 500) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad-recording-url');
  END IF;

  UPDATE public.performances SET
    screen_id = v_screen.id,
    title = coalesce(p->>'title', title),
    artist = coalesce(p->>'artist', artist),
    billing = CASE WHEN jsonb_typeof(p->'billing') = 'object' THEN p->'billing' ELSE billing END,
    status = v_status,
    status_changed_at = CASE WHEN v_status IS DISTINCT FROM status THEN now() ELSE status_changed_at END,
    starts_at = CASE WHEN p ? 'starts_at' THEN (p->>'starts_at')::timestamptz ELSE starts_at END,
    doors_at = CASE WHEN p ? 'doors_at' THEN (p->>'doors_at')::timestamptz ELSE doors_at END,
    ends_at = CASE WHEN p ? 'ends_at' THEN (p->>'ends_at')::timestamptz ELSE ends_at END,
    seats = CASE WHEN p ? 'seats' THEN (p->>'seats')::integer ELSE seats END,
    shelf_screen_key = CASE WHEN p ? 'shelf_screen_key' THEN nullif(p->>'shelf_screen_key', '') ELSE shelf_screen_key END,
    publish_recording = coalesce((p->>'publish_recording')::boolean, publish_recording),
    recording_status = v_rec,
    recording_url = v_url,
    recording_note = CASE WHEN p ? 'recording_note' THEN nullif(p->>'recording_note', '') ELSE recording_note END
  WHERE id = v_perf.id
  RETURNING * INTO v_perf;

  RETURN jsonb_build_object('ok', true, 'created', NOT v_exists, 'performance', public.frontrow_performance_json(v_perf, true));
EXCEPTION
  WHEN check_violation OR invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow
       OR numeric_value_out_of_range OR string_data_right_truncation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad-field', 'detail', SQLERRM);
END $$;

CREATE OR REPLACE FUNCTION public.frontrow_performance_json(v public.performances, p_full boolean)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', v.id, 'slug', v.slug, 'title', v.title, 'artist', v.artist, 'billing', v.billing,
    'theater', (SELECT slug FROM public.venues WHERE id = v.theater_id),
    'screen', (SELECT screen_key FROM public.venues WHERE id = v.screen_id),
    'status', v.status, 'starts_at', v.starts_at, 'doors_at', v.doors_at, 'ends_at', v.ends_at,
    'seats', v.seats, 'publish_recording', v.publish_recording, 'recording_status', v.recording_status,
    'status_changed_at', v.status_changed_at, 'shelved_at', v.shelved_at)
  || CASE WHEN p_full THEN jsonb_build_object(
    'shelf_screen_key', v.shelf_screen_key, 'recording_url', v.recording_url, 'recording_note', v.recording_note)
     ELSE '{}'::jsonb END
$$;

-- Signed-in manager (the builder, a manager's page).
CREATE OR REPLACE FUNCTION public.save_performance(p jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.frontrow_performance_write(p - 'actor', auth.uid(), false)
$$;

-- Service role (frontrow-server's per-room runtime, Netlify functions, a recorder webhook).
-- p.actor = the user acting, checked like save_performance; omitted = the server itself.
CREATE OR REPLACE FUNCTION public.frontrow_performance_save(p jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.frontrow_performance_write(p, nullif(p->>'actor', '')::uuid, true)
$$;

-- frontrow_performance_get(p): p = {theater, slug} or {theater, screen, current:true}: the
-- performance the room is running (doors to after), else the next one not filed or
-- cancelled, earliest start first. Full row, for the server.
CREATE OR REPLACE FUNCTION public.frontrow_performance_get(p jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((
    SELECT jsonb_build_object('ok', true, 'performance', public.frontrow_performance_json(x, true))
    FROM public.performances x
    JOIN public.venues t ON t.id = x.theater_id AND t.slug = p->>'theater'
    JOIN public.venues s ON s.id = x.screen_id
    WHERE CASE WHEN (p->>'current')::boolean IS TRUE
               THEN s.screen_key = p->>'screen' AND x.status NOT IN ('library', 'cancelled')
               ELSE x.slug = p->>'slug' END
    ORDER BY (x.status IN ('doors', 'green-room', 'curtain', 'after')) DESC, x.starts_at NULLS LAST, x.created_at
    LIMIT 1), jsonb_build_object('ok', false, 'reason', 'unknown'))
$$;

-- ---------------------------------------------------------------------------
-- The Library job. frontrow_performance_shelve(p): p = {id} for one performance, or {} for
-- every performance that is due (status 'after', recording ready, publish_recording true).
-- For each: appends a ShelfVideo to the shelf screen of the theater's definition (unless one
-- with the same performanceSlug is there already), bumps venue_settings.version, writes
-- theater_changes, and moves the performance to 'library' / 'shelved'. A performance that is
-- not due is skipped with its reason. Service role only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.frontrow_performance_shelve(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.performances%ROWTYPE;
  v_settings public.venue_settings%ROWTYPE;
  v_def jsonb;
  v_screens jsonb;
  v_idx integer;
  v_key text;
  v_item jsonb;
  v_yt text;
  v_problems jsonb;
  v_done jsonb := '[]';
  v_skipped jsonb := '[]';
  v_new integer;
BEGIN
  FOR v IN
    SELECT * FROM public.performances x
     WHERE CASE WHEN p ? 'id' THEN x.id::text = p->>'id'
                ELSE x.status = 'after' AND x.recording_status = 'ready' AND x.publish_recording END
     ORDER BY x.theater_id, x.starts_at NULLS LAST
     FOR UPDATE
  LOOP
    IF v.status = 'library' AND v.recording_status = 'shelved' THEN
      v_skipped := v_skipped || jsonb_build_object('slug', v.slug, 'reason', 'already-shelved'); CONTINUE;
    END IF;
    IF v.status <> 'after' THEN
      v_skipped := v_skipped || jsonb_build_object('slug', v.slug, 'reason', 'not-after', 'status', v.status); CONTINUE;
    END IF;
    IF v.recording_status <> 'ready' OR v.recording_url IS NULL THEN
      v_skipped := v_skipped || jsonb_build_object('slug', v.slug, 'reason', 'no-recording'); CONTINUE;
    END IF;
    IF NOT v.publish_recording THEN
      v_skipped := v_skipped || jsonb_build_object('slug', v.slug, 'reason', 'not-published'); CONTINUE;
    END IF;

    SELECT * INTO v_settings FROM public.venue_settings WHERE venue_id = v.theater_id FOR UPDATE;
    v_def := v_settings.config->'definition';
    IF v_def IS NULL OR jsonb_typeof(v_def->'screens') IS DISTINCT FROM 'array' THEN
      v_skipped := v_skipped || jsonb_build_object('slug', v.slug, 'reason', 'no-definition'); CONTINUE;
    END IF;
    v_screens := v_def->'screens';

    -- Which shelf: the named one, else 'library', else the first shelf screen in lobby order.
    v_key := v.shelf_screen_key;
    IF v_key IS NULL THEN
      SELECT e->>'id' INTO v_key FROM jsonb_array_elements(v_screens) e
       WHERE e->>'kind' = 'shelf'
       ORDER BY (e->>'id' = 'library') DESC, coalesce((e->>'order')::integer, 0)
       LIMIT 1;
    END IF;
    SELECT i - 1 INTO v_idx FROM jsonb_array_elements(v_screens) WITH ORDINALITY AS a(e, i)
     WHERE e->>'id' = v_key AND e->>'kind' = 'shelf';
    IF v_idx IS NULL THEN
      v_skipped := v_skipped || jsonb_build_object('slug', v.slug, 'reason', 'no-shelf', 'shelf', v_key); CONTINUE;
    END IF;

    IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(v_screens->v_idx->'shelf', '[]')) s
                WHERE s->>'performanceSlug' = v.slug) THEN
      -- Shelved before (e.g. by hand through the builder): just file the performance.
      UPDATE public.performances SET status = 'library', recording_status = 'shelved',
             status_changed_at = now(), shelved_at = now() WHERE id = v.id;
      v_done := v_done || jsonb_build_object('slug', v.slug, 'shelf', v_key, 'version', v_settings.version, 'existing', true);
      CONTINUE;
    END IF;

    v_yt := substring(v.recording_url FROM '^https://(?:www\.|m\.)?(?:youtu\.be/|youtube\.com/watch\?(?:[^#]*&)?v=|youtube\.com/live/)([A-Za-z0-9_-]{6,20})');
    v_item := jsonb_build_object(
      'title', left(v.title, 120),
      'artist', left(coalesce(nullif(v.artist, ''), v.title), 120),
      'performanceSlug', v.slug)
      || CASE WHEN v_yt IS NOT NULL THEN jsonb_build_object('youtubeId', v_yt)
              ELSE jsonb_build_object('videoUrl', v.recording_url) END
      || CASE WHEN v.recording_note IS NOT NULL THEN jsonb_build_object('note', v.recording_note)
              WHEN v.starts_at IS NOT NULL THEN jsonb_build_object('note', 'Recorded ' || to_char(v.starts_at AT TIME ZONE 'America/New_York', 'FMMonth FMDD, YYYY'))
              ELSE '{}'::jsonb END;

    v_def := jsonb_set(v_def, ARRAY['screens', v_idx::text, 'shelf'],
                       coalesce(v_screens->v_idx->'shelf', '[]'::jsonb) || jsonb_build_array(v_item), true);

    -- 005's shape check when present; refuse rather than store a definition it rejects.
    IF to_regprocedure('public.frontrow_definition_problems(jsonb)') IS NOT NULL THEN
      EXECUTE 'SELECT to_jsonb(public.frontrow_definition_problems($1))' INTO v_problems USING v_def;
      IF v_problems IS NOT NULL AND v_problems NOT IN ('null'::jsonb, '[]'::jsonb, '""'::jsonb, '{}'::jsonb) THEN
        v_skipped := v_skipped || jsonb_build_object('slug', v.slug, 'reason', 'definition-refused', 'problems', v_problems);
        CONTINUE;
      END IF;
    END IF;

    v_new := v_settings.version + 1;
    UPDATE public.venue_settings
       SET config = jsonb_set(config, '{definition}', v_def, true), version = v_new, updated_at = now()
     WHERE id = v_settings.id;
    INSERT INTO public.theater_changes (venue_id, version, definition, change_note, changed_by)
    VALUES (v.theater_id, v_new, v_def, 'Library: ' || v.title || ' (' || v.slug || ')', NULL);

    UPDATE public.performances SET status = 'library', recording_status = 'shelved',
           status_changed_at = now(), shelved_at = now() WHERE id = v.id;
    v_done := v_done || jsonb_build_object('slug', v.slug, 'shelf', v_key, 'version', v_new);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'shelved', v_done, 'skipped', v_skipped);
END $$;

-- ---------------------------------------------------------------------------
-- Tickets: a performance ticket follows its performance.
-- ---------------------------------------------------------------------------
-- Issuing: a ticket that names a performance must name one that exists on that theater and
-- screen and is not filed or cancelled.
CREATE OR REPLACE FUNCTION public.frontrow_ticket_check_performance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE st text;
BEGIN
  IF NEW.performance_id IS NULL THEN RETURN NEW; END IF;
  SELECT x.status INTO st
    FROM public.performances x
    JOIN public.venues t ON t.id = x.theater_id AND t.slug = NEW.venue_id
    JOIN public.venues s ON s.id = x.screen_id AND s.screen_key = NEW.room_id
   WHERE x.slug = NEW.performance_id;
  IF st IS NULL THEN
    RAISE EXCEPTION 'no performance % on %/%', NEW.performance_id, NEW.venue_id, NEW.room_id USING ERRCODE = '23503';
  END IF;
  IF st IN ('library', 'cancelled') THEN
    RAISE EXCEPTION 'performance % is %', NEW.performance_id, st USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tickets_check_performance ON public.tickets;
CREATE TRIGGER tickets_check_performance BEFORE INSERT ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.frontrow_ticket_check_performance();

-- Redeeming: 004's frontrow_ticket_redeem keeps all its rules and becomes
-- frontrow_ticket_redeem_base; the function under the old name asks the performance first.
--   audience            enters at doors, green-room, curtain, after
--   performer/crew/manager  any step from scheduled to after (rehearsal, setup, the green room)
--   library, cancelled  nobody: {ok:false, reason:'over' | 'cancelled'}
-- Before doors an audience ticket gets {ok:false, reason:'not-open', doors_at}. Tickets
-- with no performance, and tickets the base would refuse anyway, go straight to the base.
DO $$ BEGIN
  IF to_regprocedure('public.frontrow_ticket_redeem_base(jsonb)') IS NULL THEN
    ALTER FUNCTION public.frontrow_ticket_redeem(jsonb) RENAME TO frontrow_ticket_redeem_base;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.frontrow_ticket_redeem(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t public.tickets%ROWTYPE;
  x public.performances%ROWTYPE;
  step integer;
BEGIN
  SELECT * INTO t FROM public.tickets WHERE code_hash = p->>'code_hash';
  IF FOUND AND t.performance_id IS NOT NULL AND t.revoked_at IS NULL
     AND now() >= t.valid_from AND now() < t.valid_until THEN
    SELECT perf.* INTO x
      FROM public.performances perf
      JOIN public.venues th ON th.id = perf.theater_id AND th.slug = t.venue_id
      JOIN public.venues sc ON sc.id = perf.screen_id AND sc.screen_key = t.room_id
     WHERE perf.slug = t.performance_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no-performance'); END IF;
    IF x.status = 'cancelled' THEN RETURN jsonb_build_object('ok', false, 'reason', 'cancelled'); END IF;
    IF x.status = 'library' THEN RETURN jsonb_build_object('ok', false, 'reason', 'over'); END IF;
    step := public.frontrow_performance_step(x.status);
    IF t.role = 'audience' AND step < public.frontrow_performance_step('doors') THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'not-open', 'valid_from', coalesce(x.doors_at, x.starts_at), 'status', x.status);
    END IF;
  END IF;
  RETURN public.frontrow_ticket_redeem_base(p);
END $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['frontrow_ticket_redeem', 'frontrow_ticket_redeem_base', 'frontrow_performance_save',
                           'frontrow_performance_get', 'frontrow_performance_shelve'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(jsonb) FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(jsonb) TO service_role', f);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.frontrow_performance_write(jsonb, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.frontrow_performance_may_run(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.frontrow_performance_json(public.performances, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.frontrow_performance_write(jsonb, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.frontrow_performance_may_run(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.save_performance(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_performance(jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Seed: tonight's show (show.ts SHOWS['jess-wayne']) on Front Row's live screen, so existing
-- jess-wayne performance tickets keep a performance to point at. Only when Front Row and its
-- live screen exist and no such row does. Status 'doors': the front of house is open to guests
-- today with no schedule behind it, and an audience ticket must keep working until the
-- per-room runtime moves the status itself.
-- ---------------------------------------------------------------------------
INSERT INTO public.performances (theater_id, screen_id, slug, title, artist, billing, status)
SELECT t.id, s.id, 'jess-wayne', 'Jess Wayne', 'Jess Wayne',
       '{"stageName":"JESS WAYNE","tagline":"live at Front Row Theater","when":"Friday · 8:00 pm","doorsOpen":"7:45 pm","setLength":"Twenty-minute set and an encore","invitedBy":"Noel, Harold, George and the Hootnet gang","fallbackVideoUrl":"https://youtu.be/K6ZeroIZd5g"}'::jsonb,
       'doors'
  FROM public.venues t JOIN public.venues s ON s.super_venue_id = t.id AND s.screen_key = 'live'
 WHERE t.slug = 'front-row'
ON CONFLICT (theater_id, slug) DO NOTHING;
