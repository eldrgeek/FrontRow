// Scene-by-scene feedback on our videos (2026-11-11). The page is /watch/<video>
// (front-row-vite/src/watch/WatchPage.tsx); the table and its two functions are
// migrations/010_video_feedback.sql. Pure handlers: the Netlify functions
// (netlify/functions/video-feedback*.ts) pass in the catalog
// (front-row-vite/src/watch/videos.json), an rpc and the auth checks, and
// scripts/video-feedback-selftest.mjs passes in its own.
//
//   POST /api/video-feedback          public: one viewer's reactions and words
//   GET  /api/video-feedback-summary  FrontRow admins: thumbs per scene, notes

const res = (status, body) => ({ status, body });
const VIEWER_RE = /^[A-Za-z0-9_-]{16,64}$/;
export const LIMITS = { detail: 2000, comment: 4000, contact: 120 };

/** Strip control characters (keeping newlines in long text) and cap the length. */
function cleanText(v, max, { multiline = true } = {}) {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const bad = multiline ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g;
  const s = v.replace(/\r\n?/g, '\n').replace(bad, '').trim();
  return s.length > max ? null : s;
}

export function findVideo(catalog, slug) {
  if (typeof slug !== 'string') return null;
  return (catalog?.videos || []).find((v) => v.slug === slug) || null;
}

/**
 * Check one save against the catalog. Returns {error} or {p}, the rpc payload.
 * Unknown scene ids, values other than up/down, and over-long text are refused
 * rather than trimmed, so a bad client finds out.
 */
export function parseSave(body, catalog) {
  const b = body && typeof body === 'object' ? body : {};
  const video = findVideo(catalog, b.video);
  if (!video) return { error: 'unknown video' };
  if (typeof b.viewer !== 'string' || !VIEWER_RE.test(b.viewer)) return { error: 'viewer must be a random id' };
  const scenes = new Set(video.scenes.map((s) => s.id));

  const reactions = {};
  const r = b.reactions ?? {};
  if (typeof r !== 'object' || Array.isArray(r)) return { error: 'reactions must be an object' };
  for (const [k, v] of Object.entries(r)) {
    if (!scenes.has(k)) return { error: `no scene ${String(k).slice(0, 40)} in this video` };
    if (v !== 'up' && v !== 'down') return { error: 'a reaction is up or down' };
    reactions[k] = v;
  }

  const details = {};
  const d = b.details ?? {};
  if (typeof d !== 'object' || Array.isArray(d)) return { error: 'details must be an object' };
  for (const [k, v] of Object.entries(d)) {
    if (!scenes.has(k)) return { error: `no scene ${String(k).slice(0, 40)} in this video` };
    const t = cleanText(v, LIMITS.detail);
    if (t === null) return { error: `a scene note is at most ${LIMITS.detail} characters` };
    if (t) details[k] = t;
  }

  const comment = cleanText(b.comment, LIMITS.comment);
  if (comment === null) return { error: `the comment is at most ${LIMITS.comment} characters` };
  const contact = cleanText(b.contact, LIMITS.contact, { multiline: false });
  if (contact === null) return { error: `name or email is at most ${LIMITS.contact} characters` };
  if (b.wantsDetail !== undefined && b.wantsDetail !== null && typeof b.wantsDetail !== 'boolean') {
    return { error: 'wantsDetail is true, false or null' };
  }
  return {
    p: {
      video: video.slug,
      viewer: b.viewer,
      reactions,
      details,
      comment,
      contact,
      wants_detail: typeof b.wantsDetail === 'boolean' ? b.wantsDetail : null,
      finished: b.finished === true,
    },
  };
}

/** POST /api/video-feedback. deps: {catalog, rpc}. Public; no account. */
export async function handleSave(req, deps) {
  if (!deps.rpc) return res(503, { error: 'Feedback is not set up on this server' });
  const parsed = parseSave(req.body, deps.catalog);
  if (parsed.error) return res(400, { error: parsed.error });
  let r;
  try {
    r = await deps.rpc('frontrow_video_feedback_save', parsed.p);
  } catch (err) {
    // Before migration 010 is applied the function does not exist yet. The page
    // keeps the viewer's answers in the browser and says they were not sent.
    if (/frontrow_video_feedback_save/.test(String(err?.message)) && /404|PGRST202|does not exist/.test(String(err?.message))) {
      return res(503, { error: 'Feedback is not set up on this server', reason: 'not-set-up' });
    }
    throw err;
  }
  if (!r?.ok) return res(429, { error: 'This video is not taking more feedback', reason: r?.reason || 'refused' });
  return res(200, { ok: true });
}

/** GET /api/video-feedback-summary?video=. deps: {catalog, rpc, getUser, isAdmin}. */
export async function handleSummary(req, deps) {
  if (!deps.rpc) return res(503, { error: 'Feedback is not set up on this server' });
  const user = await deps.getUser(req.authorization);
  if (!user) return res(401, { error: 'Sign in as a FrontRow admin' });
  if (!(await deps.isAdmin(user))) return res(403, { error: 'Only FrontRow admins can read feedback' });
  const video = findVideo(deps.catalog, req.query?.video);
  if (!video) return res(400, { error: 'unknown video' });
  const r = await deps.rpc('frontrow_video_feedback_summary', { video: video.slug });
  return res(200, r);
}
