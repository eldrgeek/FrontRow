// Front Row performances: the server's side of migration 006.
//
// A performance is one night on one screen of a kit theater (public.performances). Its
// status walks scheduled -> tickets-out -> doors -> green-room -> curtain -> after -> library,
// and the database refuses anything else, so this module only names the calls. The per-room
// runtime (frontrow-server) moves the status as the room moves; the Library job shelves a
// finished night's recording once the performer has agreed to publish it.
//
// Same RPC caller as tickets.mjs (makeRpc: one jsonb argument `p`, service role).
//
//   node server/performances.mjs shelve      run the Library job once (SUPABASE_URL and
//                                            SUPABASE_SERVICE_ROLE_KEY from the environment)
//
// startLibraryJob() runs it on a timer inside frontrow-server when FRONTROW_LIBRARY_JOB_MS is
// set; nothing runs it until someone turns that on.

import { makeRpc, callerAuthority, isCode, isDevice, isSlug, sha256 } from './tickets.mjs';

// frontrow-server's onStatus hook (server/rooms.js, PR #9) builds its caller from here.
export { makeRpc };

export const STATUSES = ['scheduled', 'tickets-out', 'doors', 'green-room', 'curtain', 'after', 'library', 'cancelled'];
const ORDER = STATUSES.slice(0, 7);
const AUDIENCE_FROM = ORDER.indexOf('doors');

/** Would a ticket of this role get in at this status? (The database decides; this is for words on a page.) */
export function guestMayEnter(status, role) {
  const i = ORDER.indexOf(status);
  if (i < 0 || status === 'library') return false;
  if (role === 'audience') return i >= AUDIENCE_FROM;
  return true;
}

/** A performance row, as the front of house's Show (theater/show.ts). */
export function toShow(perf, screenSeats = 12) {
  const b = (perf && perf.billing) || {};
  return {
    slug: perf.slug,
    artist: perf.artist || perf.title,
    stageName: b.stageName || (perf.artist || perf.title).toUpperCase(),
    tagline: b.tagline || '',
    when: b.when || '',
    doorsOpen: b.doorsOpen || '',
    setLength: b.setLength || '',
    invitedBy: b.invitedBy || '',
    seats: perf.seats || screenSeats,
    fallbackVideoUrl: b.fallbackVideoUrl || '',
  };
}

export const getPerformance = (rpc, theater, slug) => rpc('frontrow_performance_get', { theater, slug });

/** The night on this screen that is not yet filed: the earliest by start time. */
export const currentPerformance = (rpc, theater, screen) =>
  rpc('frontrow_performance_get', { theater, screen, current: true });

/** Create or change a performance. fields: screen, title, artist, billing, starts_at, ... */
export const savePerformance = (rpc, theater, slug, fields, actor) =>
  rpc('frontrow_performance_save', { ...fields, theater, slug, ...(actor ? { actor } : {}) });

/**
 * Move a performance's status. Reaching 'after' with a ready, publishable recording shelves
 * it straight away; the result then carries {shelve}.
 */
export async function setStatus(rpc, { theater, slug, status, actor }) {
  const r = await savePerformance(rpc, theater, slug, { status }, actor);
  if (!r || !r.ok) return r;
  const p = r.performance;
  if (p.status === 'after' && p.recording_status === 'ready' && p.publish_recording) {
    return { ...r, shelve: await rpc('frontrow_performance_shelve', { id: p.id }) };
  }
  return r;
}

/**
 * A recording exists (a YouTube link, or an https file a recorder wrote). If the night is
 * over and the performer agreed, it goes on the shelf now; otherwise the job picks it up.
 */
export async function attachRecording(rpc, { theater, slug, url, note, actor }) {
  const r = await savePerformance(rpc, theater, slug, { recording_url: url, ...(note ? { recording_note: note } : {}) }, actor);
  if (!r || !r.ok) return r;
  const p = r.performance;
  if (p.status === 'after' && p.publish_recording) {
    return { ...r, shelve: await rpc('frontrow_performance_shelve', { id: p.id }) };
  }
  return r;
}

// The per-room runtime (server/rooms.js, PR #9) keeps its own show.status words.
const ROOM_TO_PERFORMANCE = { 'pre-show': 'doors', live: 'curtain', 'post-show': 'after' };

/**
 * For rooms.js's onStatus(house, from, to): move the house's current performance along.
 * 'idle' moves nothing (filing a night is the Library job's call, or a manager's).
 * house: {venue, room}. Returns null when there is nothing to do.
 */
export async function followRoom(rpc, house, _from, to) {
  const status = ROOM_TO_PERFORMANCE[to];
  if (!rpc || !status || !house) return null;
  const cur = await currentPerformance(rpc, house.venue, house.room);
  if (!cur || !cur.ok) return null;
  if (ORDER.indexOf(cur.performance.status) >= ORDER.indexOf(status)) return null;
  return setStatus(rpc, { theater: house.venue, slug: cur.performance.slug, status });
}

// ── Attaching a recording over HTTP (netlify/functions/performance-recording.ts) ──
//
// Front Row's recordings live on YouTube (Mike, 2026-11-06). The team, the performer, or
// the performer's own AI uploads to the performer's channel (or the team's) and then hands
// Front Row the link. Front Row never holds anyone's YouTube credentials.
//
// POST {theater, performance, url, note?, publish?}
//   with a performer or manager ticket that covers the night (X-Frontrow-Ticket and
//   X-Frontrow-Device, or ticket/device in the body), or a signed-in admin or manager.
// publish: true is the performer's yes to the Library; once the night is over, the
// recording is shelved at once.

const YT = /^https:\/\/(?:www\.|m\.)?(?:youtu\.be\/|youtube\.com\/watch\?(?:[^#\s]*&)?v=|youtube\.com\/live\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{6,20})(?:[?&#][^\s<>"]*)?$/;
export const youtubeIdOf = (url) => {
  const m = YT.exec(String(url || '').trim());
  return m ? m[1] : null;
};

const out = (status, body) => ({ status, body });

export async function handleAttachRecording(req, deps) {
  if (!deps.rpc) return out(503, { error: 'Performances are not configured on this server' });
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  if (!isSlug(b.theater, 40) || !isSlug(b.performance, 60)) return out(400, { error: 'theater and performance must be slugs' });
  const id = youtubeIdOf(b.url);
  if (!id) return out(400, { error: 'url must be a YouTube video link' });
  if (b.note !== undefined && (typeof b.note !== 'string' || b.note.length > 200)) return out(400, { error: 'note is at most 200 characters' });
  if (b.publish !== undefined && typeof b.publish !== 'boolean') return out(400, { error: 'publish must be true or false' });

  const cur = await getPerformance(deps.rpc, b.theater, b.performance);
  if (!cur || !cur.ok) return out(404, { error: 'No such performance' });
  const perf = cur.performance;

  // Who is asking.
  let actor = null;
  let who = null;
  if (req.ticket) {
    if (!isCode(req.ticket) || !isDevice(req.device)) return out(400, { error: 'Bad ticket' });
    const r = await deps.rpc('frontrow_ticket_redeem', {
      code_hash: sha256(req.ticket), device_hash: sha256(req.device), purpose: 'check',
    });
    const t = r && r.ok ? r.ticket : null;
    const covers = t && t.venue_id === b.theater
      && (!t.room_id || t.room_id === perf.screen)
      && (!t.performance_id || t.performance_id === perf.slug);
    if (!covers || !['performer', 'manager'].includes(t.role)) {
      return out(403, { error: 'This ticket cannot attach a recording to that performance', reason: (r && r.reason) || 'not-covered' });
    }
    who = `ticket:${t.id}`;
  } else {
    const auth = await callerAuthority(req, deps);
    if (!auth || !auth.user) return out(401, { error: 'Sign in, or bring a performer or manager ticket' });
    if (!auth.any) actor = auth.user.id; // the database checks this user manages the screen
    who = auth.who;
  }

  const url = `https://youtu.be/${id}`;
  const r = await attachRecording(deps.rpc, { theater: b.theater, slug: b.performance, url, note: b.note, actor });
  if (!r || !r.ok) {
    const reason = (r && r.reason) || 'error';
    const status = reason === 'not-allowed' ? 403 : reason === 'closed' || reason === 'already-shelved' ? 409 : 400;
    return out(status, { error: `Could not attach the recording (${reason})`, reason });
  }
  let result = r;
  if (b.publish !== undefined && b.publish !== r.performance.publish_recording) {
    const p = await savePerformance(deps.rpc, b.theater, b.performance, { publish_recording: b.publish }, actor);
    if (!p || !p.ok) return out(400, { error: `Recording attached; publish not changed (${p && p.reason})`, reason: p && p.reason });
    result = p;
    if (p.performance.status === 'after' && p.performance.publish_recording && p.performance.recording_status === 'ready') {
      result = { ...p, shelve: await deps.rpc('frontrow_performance_shelve', { id: p.performance.id }) };
    }
  }
  const shelved = !!(result.shelve && result.shelve.shelved && result.shelve.shelved.length);
  const now = shelved ? ((await getPerformance(deps.rpc, b.theater, b.performance)) || {}).performance || result.performance : result.performance;
  return out(200, {
    ok: true, by: who, youtubeId: id,
    status: now.status, recording: now.recording_status, publish: now.publish_recording, shelved,
  });
}

/** The Library job: shelve every finished, published recording. */
export const shelveDue = (rpc) => rpc('frontrow_performance_shelve', {});

/** Run shelveDue every `ms` (at least a minute). Returns a stop function. */
export function startLibraryJob(rpc, ms, log = console) {
  if (!rpc || !(ms > 0)) return () => {};
  const every = Math.max(60_000, ms);
  const tick = async () => {
    try {
      const r = await shelveDue(rpc);
      for (const s of (r && r.shelved) || []) log.log(`[library] shelved ${s.slug} on ${s.shelf}`);
      for (const s of (r && r.skipped) || []) log.warn(`[library] skipped ${s.slug}: ${s.reason}`);
    } catch (e) {
      log.warn(`[library] job failed: ${e.message}`);
    }
  };
  const t = setInterval(tick, every);
  if (t.unref) t.unref();
  return () => clearInterval(t);
}

// CLI
if (import.meta.url === `file://${process.argv[1]}` && process.argv[2] === 'shelve') {
  const rpc = makeRpc({ url: process.env.SUPABASE_URL, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY });
  if (!rpc) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed');
    process.exit(2);
  }
  shelveDue(rpc).then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r && r.ok ? 0 : 1);
  }, (e) => { console.error(e.message); process.exit(1); });
}
