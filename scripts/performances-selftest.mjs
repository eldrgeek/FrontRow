#!/usr/bin/env node
// Performances selftest: migrations 002, 003, 004 and 006 on a real, throwaway Postgres
// (with a minimal stand-in for Supabase's auth schema and roles), then every rule in 006:
// who may schedule, the status walk, performance tickets, the Library job, and what a
// browser may read. Also drives server/performances.mjs against the same database.
//
//   node scripts/performances-selftest.mjs
//
// Postgres: PERF_PG_URL = an empty scratch database, or initdb on PATH or in
// /usr/lib/postgresql/*/bin, and the script makes its own cluster in a temp dir (as the
// postgres user when run as root), on port 5498 by default.
// Exit 0 = all pass, 1 = a failure, 2 = could not run (no Postgres).

import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = await import(path.join(ROOT, 'server/performances.mjs'));

// ── Postgres ────────────────────────────────────────────────────────────────
let PG = process.env.PERF_PG_URL;
let cleanup = () => {};
const asRoot = process.getuid && process.getuid() === 0;

function findBin(name) {
  const r = spawnSync('which', [name], { encoding: 'utf8' });
  if (r.status === 0) return r.stdout.trim();
  for (const base of ['/usr/lib/postgresql', '/opt/homebrew/opt']) {
    if (!fs.existsSync(base)) continue;
    for (const v of fs.readdirSync(base).sort().reverse()) {
      const p = path.join(base, v, 'bin', name);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

if (!PG) {
  const initdb = findBin('initdb');
  const pgctl = findBin('pg_ctl');
  if (!initdb || !pgctl) {
    console.log('SKIP: no Postgres (set PERF_PG_URL or install initdb)');
    process.exit(2);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frt-perf-pg-'));
  const port = process.env.PERF_PG_PORT || '5498';
  const run = (bin, args) => {
    if (asRoot) {
      fs.chmodSync(dir, 0o777);
      return execFileSync('runuser', ['-u', 'postgres', '--', bin, ...args], { stdio: 'pipe' });
    }
    return execFileSync(bin, args, { stdio: 'pipe' });
  };
  run(initdb, ['-D', path.join(dir, 'data'), '-U', 'postgres', '-A', 'trust']);
  run(pgctl, ['-D', path.join(dir, 'data'), '-l', path.join(dir, 'log'), '-o', `-p ${port} -k ${dir} -c listen_addresses=''`, '-w', 'start']);
  PG = `postgresql://postgres@/postgres?host=${dir}&port=${port}`;
  cleanup = () => {
    try { run(pgctl, ['-D', path.join(dir, 'data'), '-m', 'immediate', 'stop']); } catch { /* already down */ }
    fs.rmSync(dir, { recursive: true, force: true });
  };
}
process.on('exit', () => cleanup());

function psql(sql, vars = {}) {
  const args = [PG, '-XqtA', '-v', 'ON_ERROR_STOP=1'];
  for (const [k, v] of Object.entries(vars)) args.push('-v', `${k}=${v}`);
  const r = spawnSync(findBin('psql') || 'psql', args, { input: sql, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr.trim());
  return r.stdout.trim();
}
const json = (sql, vars) => JSON.parse(psql(sql, vars));

// As a signed-in user: Supabase's auth.uid() reads the JWT's sub claim.
const asUser = (uid, sql, vars) =>
  json(`SET ROLE authenticated; SET request.jwt.claim.sub = '${uid}'; ${sql}`, vars);
const svc = (fn, p) => json(`SET ROLE service_role; SELECT public.${fn}(:'p'::jsonb);`, { p: JSON.stringify(p) });
const rpc = async (fn, p) => {
  if (!/^frontrow_(performance|ticket)_[a-z_]+$/.test(fn)) throw new Error(`unexpected rpc ${fn}`);
  return svc(fn, p);
};

let failed = 0;
let passed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`ok   ${name}`); }
  else { failed++; console.log(`FAIL ${name}${detail === undefined ? '' : ` -- ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`); }
}
function throws(name, fn, re) {
  try { fn(); check(name, false, 'did not throw'); }
  catch (e) { check(name, !re || re.test(e.message), e.message); }
}

// ── Schema ──────────────────────────────────────────────────────────────────
const MIKE = 'e411d3d3-d2fb-4dae-8f26-6d7542f17346';
const MGR = '11111111-1111-4111-8111-111111111111';
const JOE = '22222222-2222-4222-8222-222222222222';
psql(`
  DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  CREATE SCHEMA IF NOT EXISTS auth;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text);
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $f$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
  CREATE TABLE IF NOT EXISTS public.profiles (id uuid PRIMARY KEY);
  INSERT INTO auth.users VALUES ('${MIKE}', 'mw@mike-wolf.com'), ('${MGR}', 'mgr@example.com'), ('${JOE}', 'joe@example.com')
    ON CONFLICT DO NOTHING;
`);
const mig = (n) => fs.readFileSync(path.join(ROOT, 'migrations', fs.readdirSync(path.join(ROOT, 'migrations')).find((f) => f.startsWith(n))), 'utf8');
psql(mig('002'));
// Front Row's manager is MGR in this test (002 seeds it with whoever created it).
psql(`UPDATE public.venues SET theater_manager_id = '${MGR}' WHERE id = 'a0000000-0000-4000-8000-000000000001';
      INSERT INTO public.frontrow_admins (user_id, email) VALUES ('${MIKE}', 'mw@mike-wolf.com') ON CONFLICT DO NOTHING;`);
psql(mig('003'));
psql(mig('004'));
// PERF_SKIP_005=1 runs 006 on 003 + 004 alone, to check its fallbacks.
const has005 = !process.env.PERF_SKIP_005 && fs.readdirSync(path.join(ROOT, 'migrations')).some((f) => f.startsWith('005'));
if (has005) { psql(mig('005')); console.log('applied 005 first'); }
const M006 = mig('006');
psql(M006);
psql(M006); // idempotent
check('006 runs twice', true);
check('004 redeem kept as the base', psql(`SELECT to_regprocedure('public.frontrow_ticket_redeem_base(jsonb)') IS NOT NULL`) === 't');

// A second theater, managed by JOE, for "not your theater".
psql(`
  INSERT INTO public.venues (id, name, room_template_id, theater_manager_id, active, created_by, slug)
    VALUES ('b0000000-0000-4000-8000-000000000002', 'Joe House', (SELECT id FROM public.room_templates WHERE name = 'proscenium'), '${JOE}', true, '${JOE}', 'joe-house');
  INSERT INTO public.venues (super_venue_id, screen_key, name, room_template_id, theater_manager_id, active, created_by)
    VALUES ('b0000000-0000-4000-8000-000000000002', 'main', 'Main', (SELECT id FROM public.room_templates WHERE name = 'proscenium'), '${JOE}', true, '${JOE}');
`);

// ── Seed ────────────────────────────────────────────────────────────────────
const seed = svc('frontrow_performance_get', { theater: 'front-row', slug: 'jess-wayne' });
check('seed: jess-wayne on front-row/live', seed.ok && seed.performance.screen === 'live' && seed.performance.status === 'doors', seed);
check('seed: billing carries the show words', seed.ok && seed.performance.billing.stageName === 'JESS WAYNE');

// ── Who may schedule ────────────────────────────────────────────────────────
const save = (uid, p) => asUser(uid, `SELECT public.save_performance(:'p'::jsonb);`, { p: JSON.stringify(p) });
const night = { theater: 'front-row', slug: 'noel-friday', screen: 'live', title: 'Noel on Friday', artist: 'Noel Paul Stookey',
  starts_at: '2026-11-13T01:00:00Z', doors_at: '2026-11-13T00:45:00Z' };
check('signed out: refused', save('', night).reason === 'not-allowed');
check('another theater\'s manager: refused', save(JOE, night).reason === 'not-allowed');
if (has005) {
  const BEA = '33333333-3333-4333-8333-333333333333';
  psql(`INSERT INTO auth.users VALUES ('${BEA}', 'bea@example.com') ON CONFLICT DO NOTHING;`);
  check('005: no role, no schedule', save(BEA, { ...night, slug: 'bea-night' }).reason === 'not-allowed');
  psql(`INSERT INTO public.theater_roles (venue_id, user_id, role) SELECT id, '${BEA}', 'performance_manager' FROM public.venues
        WHERE super_venue_id = 'a0000000-0000-4000-8000-000000000001' AND screen_key = 'live';`);
  check('005: performance manager of the live screen may schedule there', save(BEA, { ...night, slug: 'bea-night' }).ok);
  check('005: ...but not on another screen', save(BEA, { theater: 'front-row', slug: 'bea-night', screen: 'library' }).reason === 'not-allowed');
  psql(`UPDATE public.theater_roles SET revoked_at = now() WHERE user_id = '${BEA}'`);
  check('005: a revoked role stops at once', save(BEA, { theater: 'front-row', slug: 'bea-night', seats: 5 }).reason === 'not-allowed');
}
let r = save(MGR, night);
check('theater manager: scheduled', r.ok && r.created && r.performance.status === 'scheduled', r);
check('admin: may edit it', save(MIKE, { theater: 'front-row', slug: 'noel-friday', seats: 20 }).performance.seats === 20);
check('JOE cannot schedule on front-row with actor', svc('frontrow_performance_save', { ...night, slug: 'x', actor: JOE }).reason === 'not-allowed');
check('server itself may', svc('frontrow_performance_save', { theater: 'joe-house', slug: 'open-mic', screen: 'main', title: 'Open mic' }).ok);
check('unknown screen', save(MGR, { ...night, slug: 'n2', screen: 'nope' }).reason === 'no-screen');
check('a screen of another theater', save(MGR, { ...night, slug: 'n3', screen: 'main' }).reason === 'no-screen');
check('new needs a screen', save(MGR, { theater: 'front-row', slug: 'n4', title: 'x' }).reason === 'screen-required');
check('new needs a title', save(MGR, { theater: 'front-row', slug: 'n5', screen: 'live' }).reason === 'title-required');
check('bad slug refused', save(MGR, { ...night, slug: 'Bad--Slug' }).reason === 'bad-field');
check('doors after start refused', save(MGR, { ...night, slug: 'n6', doors_at: '2026-11-13T02:00:00Z' }).reason === 'bad-field');
check('seats over 99 refused', save(MGR, { theater: 'front-row', slug: 'noel-friday', seats: 100 }).reason === 'bad-field');
check('nothing half-written by a refused save', save(MIKE, { theater: 'front-row', slug: 'noel-friday', seats: 20 }).performance.seats === 20);

// Direct writes are not open to browsers.
throws('anon cannot insert', () => psql(`SET ROLE anon; INSERT INTO public.performances (theater_id, screen_id, slug, title) SELECT theater_id, screen_id, 'z', 'z' FROM public.performances LIMIT 1;`), /permission denied/);
throws('authenticated cannot update', () => psql(`SET ROLE authenticated; UPDATE public.performances SET status = 'library';`), /permission denied/);
check('anon reads the schedule', psql(`SET ROLE anon; SELECT count(*) FROM public.performances WHERE slug = 'noel-friday';`) === '1');
throws('anon cannot read recording_url', () => psql(`SET ROLE anon; SELECT recording_url FROM public.performances;`), /permission denied/);
throws('anon cannot run the Library job', () => psql(`SET ROLE anon; SELECT public.frontrow_performance_shelve('{}'::jsonb);`), /permission denied/);
throws('authenticated cannot call the service writer', () => psql(`SET ROLE authenticated; SELECT public.frontrow_performance_save('{}'::jsonb);`), /permission denied/);

// ── Status walk ─────────────────────────────────────────────────────────────
const step = (slug, status, theater = 'front-row') => svc('frontrow_performance_save', { theater, slug, status });
check('skip ahead: scheduled -> doors', step('noel-friday', 'doors').performance?.status === 'doors');
check('backwards refused', step('noel-friday', 'tickets-out').reason === 'backwards');
check('unknown status refused', step('noel-friday', 'intermission').reason === 'bad-status');
check('green-room', step('noel-friday', 'green-room').ok);
check('curtain', step('noel-friday', 'curtain').ok);
check('after', step('noel-friday', 'after').ok);
check('too late to cancel after the show', step('noel-friday', 'cancelled').reason === 'too-late-to-cancel');
check('cancel before the show', step('open-mic', 'cancelled', 'joe-house').ok);
check('a cancelled night is closed', step('open-mic', 'doors', 'joe-house').reason === 'closed');
check('status_changed_at moves', Date.parse(svc('frontrow_performance_get', { theater: 'front-row', slug: 'noel-friday' }).performance.status_changed_at)
  > Date.parse(seed.performance.status_changed_at));
check('current: of the nights the room is running, the earliest start (no start time last)', svc('frontrow_performance_get', { theater: 'front-row', screen: 'live', current: true }).performance?.slug === 'noel-friday');
check('current: none on an empty screen', svc('frontrow_performance_get', { theater: 'front-row', screen: 'library', current: true }).reason === 'unknown');

// ── Tickets follow their performance ────────────────────────────────────────
const hash = (s) => s.padEnd(64, '0').slice(0, 64);
const issue = (code, performance, role = 'audience') => svc('frontrow_ticket_issue', {
  issued_by: 'test', tickets: [{ code_hash: hash(code), venue_id: 'front-row', room_id: 'live', performance_id: performance, role,
    valid_from: '2026-01-01T00:00:00Z', valid_until: '2026-12-31T00:00:00Z', max_devices: 5, channel: 'sent' }],
});
throws('ticket for a performance that does not exist', () => issue('a1', 'no-such-night'), /no performance/);
check('seeded night at doors: audience ticket works as today', (() => { issue('e1', 'jess-wayne'); return redeemOn('e1'); })());
svc('frontrow_performance_save', { theater: 'front-row', slug: 'late-show', screen: 'live', title: 'Late show', status: 'tickets-out' });
issue('a2', 'late-show');
issue('b2', 'late-show', 'performer');
function redeemOn(code) { return svc('frontrow_ticket_redeem', { code_hash: hash(code), device_hash: 'f'.repeat(64), venue_id: 'front-row', room_id: 'live', purpose: 'enter' }).ok; }
const redeem = (code, purpose = 'enter') => svc('frontrow_ticket_redeem', { code_hash: hash(code), device_hash: 'd'.repeat(64), venue_id: 'front-row', room_id: 'live', purpose });
r = redeem('a2');
check('audience before doors: not-open', r.reason === 'not-open' && r.status === 'tickets-out', r);
check('performer before doors: in (green room, rehearsal)', redeem('b2').ok);
step('late-show', 'doors');
check('audience at doors: in', redeem('a2').ok);
check('check purpose works too', redeem('a2', 'check').ok);
step('late-show', 'after');
check('audience after the show: still in (post-show chat)', redeem('a2').ok);
psql(`UPDATE public.tickets SET revoked_at = now() WHERE code_hash = '${hash('b2')}'`);
check('revoked stays revoked', redeem('b2').reason === 'revoked');
step('late-show', 'library');
check('filed night: over', redeem('a2').reason === 'over');
throws('no new tickets for a filed night', () => issue('a3', 'late-show'), /is library/);
check('ticket with no performance: base rules only', (() => {
  svc('frontrow_ticket_issue', { issued_by: 'test', tickets: [{ code_hash: hash('c1'), venue_id: 'front-row', room_id: 'live', role: 'audience',
    valid_from: '2026-01-01T00:00:00Z', valid_until: '2026-12-31T00:00:00Z', channel: 'door' }] });
  return redeem('c1').ok;
})());
check('wrong room still wrong-room (base)', svc('frontrow_ticket_redeem', { code_hash: hash('c1'), device_hash: 'e'.repeat(64), venue_id: 'front-row', room_id: 'library', purpose: 'enter' }).reason === 'wrong-room');

// Re-running 004 drops the performance check; re-running 006 restores it.
psql(mig('004'));
psql(M006);
check('004 then 006 again: performance check back', redeem('a2').reason === 'over');

// ── Library job ─────────────────────────────────────────────────────────────
const version = () => Number(psql(`SELECT version FROM public.venue_settings WHERE venue_id = 'a0000000-0000-4000-8000-000000000001'`));
const shelf = (key = 'library') => json(`SELECT e->'shelf' FROM public.venue_settings vs, jsonb_array_elements(vs.config->'definition'->'screens') e WHERE vs.venue_id = 'a0000000-0000-4000-8000-000000000001' AND e->>'id' = '${key}'`);
const v0 = version();
const shelf0 = shelf().length;

check('recording without a URL refused', svc('frontrow_performance_save', { theater: 'front-row', slug: 'noel-friday', recording_status: 'ready' }).reason === 'bad-field');
check('non-https recording refused', svc('frontrow_performance_save', { theater: 'front-row', slug: 'noel-friday', recording_url: 'http://x.example/a.mp4' }).reason === 'bad-recording-url');
r = svc('frontrow_performance_save', { theater: 'front-row', slug: 'noel-friday', recording_url: 'https://youtu.be/AbCdEf12345' });
check('a URL makes the recording ready', r.ok && r.performance.recording_status === 'ready', r);
check('cannot mark shelved by hand', svc('frontrow_performance_save', { theater: 'front-row', slug: 'noel-friday', recording_status: 'shelved' }).reason === 'shelve-instead');

r = svc('frontrow_performance_shelve', {});
check('not published: the job leaves it', r.ok && r.shelved.length === 0 && version() === v0, r);
r = svc('frontrow_performance_shelve', { id: svc('frontrow_performance_get', { theater: 'front-row', slug: 'noel-friday' }).performance.id });
check('asked by id: says why not', r.skipped[0]?.reason === 'not-published', r);

svc('frontrow_performance_save', { theater: 'front-row', slug: 'noel-friday', publish_recording: true });
check('publishable recording cannot skip to library by hand', step('noel-friday', 'library').reason === 'shelve-instead');
r = await P.shelveDue(rpc);
check('job shelves it', r.ok && r.shelved.length === 1 && r.shelved[0].shelf === 'library', r);
const item = shelf().at(-1);
check('shelf item: youtubeId from the link', item.youtubeId === 'AbCdEf12345' && item.performanceSlug === 'noel-friday' && !item.videoUrl, item);
check('shelf item: title and artist', item.title === 'Noel on Friday' && item.artist === 'Noel Paul Stookey');
check('shelf item: dated note', /^Recorded November 12, 2026$/.test(item.note), item.note);
check('definition version bumped once', version() === v0 + 1);
check('one more item on the shelf', shelf().length === shelf0 + 1);
check('change log says Library', psql(`SELECT change_note FROM public.theater_changes WHERE venue_id = 'a0000000-0000-4000-8000-000000000001' ORDER BY version DESC LIMIT 1`) === 'Library: Noel on Friday (noel-friday)');
const filed = svc('frontrow_performance_get', { theater: 'front-row', slug: 'noel-friday' }).performance;
check('performance filed', filed.status === 'library' && filed.recording_status === 'shelved' && filed.shelved_at);
check('second run changes nothing', (await P.shelveDue(rpc)).shelved.length === 0 && version() === v0 + 1);
check('a shelved recording cannot be swapped', svc('frontrow_performance_save', { theater: 'front-row', slug: 'noel-friday', recording_url: 'https://youtu.be/ZZZZZZZZZZZ' }).reason === 'closed');
check('anon sees it filed',
  psql(`SET ROLE anon; SELECT recording_status FROM public.performances WHERE slug = 'noel-friday'`) === 'shelved');

// A file recording, to a named shelf, through the module's helpers.
svc('frontrow_performance_save', { theater: 'front-row', slug: 'second-set', screen: 'live', title: 'Second set', shelf_screen_key: 'revolution', publish_recording: true, recording_note: 'Encore included' });
r = await P.setStatus(rpc, { theater: 'front-row', slug: 'second-set', status: 'after' });
check('setStatus after, no recording: nothing to shelve', r.ok && !r.shelve, r);
r = await P.attachRecording(rpc, { theater: 'front-row', slug: 'second-set', url: 'https://media.example.org/frt/second-set.mp4' });
check('attachRecording on an after night shelves at once', r.ok && r.shelve?.shelved?.length === 1, r);
const fileItem = shelf('revolution').at(-1);
check('file recording: videoUrl, named shelf, note kept', fileItem.videoUrl === 'https://media.example.org/frt/second-set.mp4' && !fileItem.youtubeId && fileItem.note === 'Encore included', fileItem);

// Already on the shelf (added by hand in the builder): filed, no duplicate.
svc('frontrow_performance_save', { theater: 'front-row', slug: 'by-hand', screen: 'live', title: 'By hand', publish_recording: true, recording_url: 'https://youtu.be/HandHand123', status: 'after' });
psql(`UPDATE public.venue_settings SET config = jsonb_set(config, '{definition,screens,2,shelf}',
        (config->'definition'->'screens'->2->'shelf') || '[{"title":"By hand","artist":"x","youtubeId":"HandHand123","performanceSlug":"by-hand"}]'::jsonb)
      WHERE venue_id = 'a0000000-0000-4000-8000-000000000001'`);
const n0 = shelf().length;
r = svc('frontrow_performance_shelve', {});
check('already shelved by hand: filed, not duplicated', r.shelved[0]?.existing === true && shelf().length === n0, r);

// No shelf screen at all.
svc('frontrow_performance_save', { theater: 'front-row', slug: 'no-shelf', screen: 'live', title: 'Nowhere', shelf_screen_key: 'live', publish_recording: true, recording_url: 'https://youtu.be/Nowhere1234', status: 'after' });
r = svc('frontrow_performance_shelve', {});
check('named shelf is not a shelf: skipped, says so', r.skipped.some((s) => s.slug === 'no-shelf' && s.reason === 'no-shelf'), r);

// ── followRoom: the per-room runtime's status words ─────────────────────────
svc('frontrow_performance_save', { theater: 'joe-house', slug: 'jam', screen: 'main', title: 'Jam', starts_at: '2026-11-20T00:00:00Z' });
check('followRoom: idle moves nothing', (await P.followRoom(rpc, { venue: 'joe-house', room: 'main' }, 'post-show', 'idle')) === null);
r = await P.followRoom(rpc, { venue: 'joe-house', room: 'main' }, 'idle', 'pre-show');
check('followRoom: pre-show -> doors', r?.performance?.status === 'doors', r);
if (has005) {
  r = await P.followRoom(rpc, { venue: 'joe-house', room: 'main' }, 'pre-show', 'live');
  check('005: no curtain in a screen that is not open', r?.reason === 'screen-not-open', r);
  psql(`UPDATE public.venues SET status = 'open' WHERE screen_key = 'main'`);
}
r = await P.followRoom(rpc, { venue: 'joe-house', room: 'main' }, 'pre-show', 'live');
check('followRoom: live -> curtain', r?.performance?.status === 'curtain', r);
check('followRoom: a repeat moves nothing', (await P.followRoom(rpc, { venue: 'joe-house', room: 'main' }, 'live', 'live')) === null);
r = await P.followRoom(rpc, { venue: 'joe-house', room: 'main' }, 'live', 'post-show');
check('followRoom: post-show -> after', r?.performance?.status === 'after', r);
check('followRoom: no performance, no call', (await P.followRoom(rpc, { venue: 'front-row', room: 'library' }, 'idle', 'live')) === null);

// ── Module bits that need no database ───────────────────────────────────────
check('toShow maps a performance to a Show', (() => {
  const s = P.toShow(seed.performance);
  return s.slug === 'jess-wayne' && s.artist === 'Jess Wayne' && s.stageName === 'JESS WAYNE' && s.seats === 12;
})());
check('guestMayEnter: audience at doors', P.guestMayEnter('doors', 'audience') && !P.guestMayEnter('tickets-out', 'audience') && P.guestMayEnter('scheduled', 'performer') && !P.guestMayEnter('library', 'manager'));

console.log(`\n${passed} passed, ${failed} failed${has005 ? ' (with 005)' : ' (without 005: 006 fallbacks)'}`);
process.exit(failed ? 1 : 0);
