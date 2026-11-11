-- FrontRow 010: scene-by-scene feedback on our videos (2026-11-11).
-- Mike: "When we put videos on YouTube we can also play them on our own page.
-- ... viewers can react to the video scene by scene. After the whole thing
-- plays ask the viewer if they would be willing to give more detailed
-- feedback especially on the thumbs down parts."
--
-- Page: /watch/<video> (front-row-vite/src/watch/WatchPage.tsx). Rules and
-- validation: server/video-feedback.mjs. Videos and scenes:
-- front-row-vite/src/watch/videos.json.
--
-- One row per viewer per video. The viewer id is a random id the page keeps in
-- the browser; no account. The page sends the viewer's whole state on each
-- change, so a save replaces the row. Written and read only through the two
-- functions below, by service_role (the Netlify functions). Stands alone: needs
-- no earlier FrontRow migration.

CREATE TABLE IF NOT EXISTS public.frontrow_video_feedback (
  video text NOT NULL CHECK (video ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  viewer text NOT NULL CHECK (viewer ~ '^[A-Za-z0-9_-]{16,64}$'),
  -- {scene id: 'up' | 'down'}
  reactions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(reactions) = 'object'),
  -- {scene id: what the viewer wrote about that scene}
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  comment text CHECK (char_length(comment) <= 4000),
  -- A name or email, only if the viewer chose to leave one.
  contact text CHECK (char_length(contact) <= 120),
  -- null: not asked yet; true/false: the answer to "will you say more?"
  wants_detail boolean,
  finished boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (video, viewer)
);
CREATE INDEX IF NOT EXISTS frontrow_video_feedback_recent_idx
  ON public.frontrow_video_feedback (video, updated_at DESC);
ALTER TABLE public.frontrow_video_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.frontrow_video_feedback FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.frontrow_video_feedback TO service_role;
COMMENT ON TABLE public.frontrow_video_feedback IS
  'Scene-by-scene reactions to a video on /watch, one row per viewer. Written only by frontrow_video_feedback_save.';

-- frontrow_video_feedback_save(p): p = {video, viewer, reactions, details,
-- comment, contact, wants_detail, finished}, already checked by
-- server/video-feedback.mjs. Upserts the viewer's row. A video takes at most
-- 5000 viewers, so a flood of made-up viewer ids stops there.
CREATE OR REPLACE FUNCTION public.frontrow_video_feedback_save(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v text := p->>'video';
  w text := p->>'viewer';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM frontrow_video_feedback WHERE video = v AND viewer = w)
     AND (SELECT count(*) FROM frontrow_video_feedback WHERE video = v) >= 5000 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'full');
  END IF;
  INSERT INTO frontrow_video_feedback AS f
    (video, viewer, reactions, details, comment, contact, wants_detail, finished)
  VALUES (v, w,
    coalesce(p->'reactions', '{}'::jsonb),
    coalesce(p->'details', '{}'::jsonb),
    nullif(p->>'comment', ''),
    nullif(p->>'contact', ''),
    (p->>'wants_detail')::boolean,
    coalesce((p->>'finished')::boolean, false))
  ON CONFLICT (video, viewer) DO UPDATE SET
    reactions = excluded.reactions,
    details = excluded.details,
    comment = excluded.comment,
    contact = excluded.contact,
    wants_detail = excluded.wants_detail,
    -- Once a viewer has watched to the end, a later save can't undo it.
    finished = f.finished OR excluded.finished,
    updated_at = now();
  RETURN jsonb_build_object('ok', true);
END
$$;

-- frontrow_video_feedback_summary(p): p = {video}. For admins: thumbs per
-- scene, how many viewers, how many watched to the end, and the newest 200
-- rows that carry any words.
CREATE OR REPLACE FUNCTION public.frontrow_video_feedback_summary(p jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'ok', true,
    'viewers', (SELECT count(*) FROM frontrow_video_feedback WHERE video = p->>'video'),
    'finished', (SELECT count(*) FROM frontrow_video_feedback WHERE video = p->>'video' AND finished),
    'saidMore', (SELECT count(*) FROM frontrow_video_feedback WHERE video = p->>'video' AND wants_detail),
    'scenes', coalesce((
      SELECT jsonb_object_agg(scene, jsonb_build_object('up', up, 'down', down))
      FROM (
        SELECT r.key AS scene,
               count(*) FILTER (WHERE r.value = '"up"') AS up,
               count(*) FILTER (WHERE r.value = '"down"') AS down
        FROM frontrow_video_feedback f, jsonb_each(f.reactions) r
        WHERE f.video = p->>'video'
        GROUP BY r.key) s), '{}'::jsonb),
    'notes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'reactions', reactions, 'details', details, 'comment', comment,
               'contact', contact, 'finished', finished, 'at', updated_at)
             ORDER BY updated_at DESC)
      FROM (SELECT * FROM frontrow_video_feedback
            WHERE video = p->>'video'
              AND (details <> '{}'::jsonb OR comment IS NOT NULL OR contact IS NOT NULL)
            ORDER BY updated_at DESC LIMIT 200) n), '[]'::jsonb))
$$;

REVOKE ALL ON FUNCTION public.frontrow_video_feedback_save(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.frontrow_video_feedback_summary(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.frontrow_video_feedback_save(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.frontrow_video_feedback_summary(jsonb) TO service_role;
