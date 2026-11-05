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

import { makeRpc } from './tickets.mjs';

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
