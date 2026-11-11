#!/usr/bin/env node
// Video feedback selftest: migration 010 on a real, throwaway Postgres, then
// every rule in server/video-feedback.mjs through its handlers, against the
// real catalog (front-row-vite/src/watch/videos.json). No network.
//
//   node scripts/video-feedback-selftest.mjs
//
// Postgres: VF_PG_URL, or initdb on port 5497. Exit 0 = all pass, 1 = a
// failure, 2 = could not run (no Postgres).
import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const F = await import(path.join(ROOT, 'server/video-feedback.mjs'));
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'front-row-vite/src/watch/videos.json'), 'utf8'));

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

let PG = process.env.VF_PG_URL;
let cleanup = () => {};
const asRoot = process.getuid && process.getuid() === 0;
if (!PG) {
  const initdb = findBin('initdb');
  const pgctl = findBin('pg_ctl');
  if (!initdb || !pgctl) {
    console.log('SKIP: no Postgres (set VF_PG_URL or install initdb)');
    process.exit(2);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frt-vf-pg-'));
  const port = process.env.VF_PG_PORT || '5497';
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

psql(`
  DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
`);
const MIG = fs.readFileSync(path.join(ROOT, 'migrations/010_video_feedback.sql'), 'utf8');
psql(MIG);
psql(MIG); // idempotent: a second run must not fail
console.log('applied 010_video_feedback.sql (twice)');

const rpc = async (fn, p) => {
  if (!/^frontrow_video_feedback_(save|summary)$/.test(fn)) throw new Error(`unexpected rpc ${fn}`);
  return JSON.parse(psql(`SET ROLE service_role; SELECT public.${fn}(:'p'::jsonb);`, { p: JSON.stringify(p) }));
};
const ADMIN = { id: 'a', email: 'mw@mike-wolf.com' };
const JOE = { id: 'j', email: 'joe@example.com' };
const deps = {
  catalog,
  rpc,
  getUser: async (h) => (h === 'Bearer admin' ? ADMIN : h === 'Bearer joe' ? JOE : null),
  isAdmin: async (u) => u === ADMIN,
};

let fails = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`);
  if (!ok) fails++;
}
const save = (body) => F.handleSave({ body }, deps);
const summary = (authorization, video = 'show-night') => F.handleSummary({ authorization, query: { video } }, deps);
const V1 = 'viewer_aaaaaaaaaaaaaaaa';
const V2 = 'viewer_bbbbbbbbbbbbbbbb';

// ── Catalog ─────────────────────────────────────────────────────────────────
for (const v of catalog.videos) {
  const ids = v.scenes.map((s) => s.id);
  check(`${v.slug}: scene ids are unique`, new Set(ids).size === ids.length);
  check(`${v.slug}: scenes are in order and cover the video`,
    v.scenes[0].start === 0 && v.scenes.every((s, i) => s.end > s.start && (i === 0 || Math.abs(s.start - v.scenes[i - 1].end) < 0.05))
      && Math.abs(v.scenes.at(-1).end - v.duration) < 0.05);
  check(`${v.slug}: youtubeId is empty or an 11-character id`, v.youtubeId === '' || /^[A-Za-z0-9_-]{11}$/.test(v.youtubeId));
}

// ── Validation ──────────────────────────────────────────────────────────────
const bad = [
  ['unknown video', { video: 'nope', viewer: V1 }],
  ['short viewer id', { video: 'show-night', viewer: 'abc' }],
  ['viewer id with odd characters', { video: 'show-night', viewer: 'viewer aaaaaaaaaaaaaaaa' }],
  ['scene not in the video', { video: 'show-night', viewer: V1, reactions: { green: 'up' } }],
  ['reaction other than up/down', { video: 'show-night', viewer: V1, reactions: { title: 'meh' } }],
  ['reactions as an array', { video: 'show-night', viewer: V1, reactions: ['up'] }],
  ['note on an unknown scene', { video: 'show-night', viewer: V1, details: { nope: 'x' } }],
  ['scene note too long', { video: 'show-night', viewer: V1, details: { title: 'x'.repeat(F.LIMITS.detail + 1) } }],
  ['comment too long', { video: 'show-night', viewer: V1, comment: 'x'.repeat(F.LIMITS.comment + 1) }],
  ['contact too long', { video: 'show-night', viewer: V1, contact: 'x'.repeat(F.LIMITS.contact + 1) }],
  ['wantsDetail not boolean', { video: 'show-night', viewer: V1, wantsDetail: 'yes' }],
];
for (const [name, body] of bad) {
  const r = await save(body);
  check(`refuses ${name}`, r.status === 400, JSON.stringify(r));
}
check('nothing was written by refused saves', psql('SELECT count(*) FROM public.frontrow_video_feedback') === '0');

// ── Saves ───────────────────────────────────────────────────────────────────
let r = await save({ video: 'show-night', viewer: V1, reactions: { title: 'up', busy: 'down' } });
check('saves a viewer\'s first reactions', r.status === 200 && r.body.ok, JSON.stringify(r));
r = await save({ video: 'show-night', viewer: V1, reactions: { title: 'up', busy: 'down', hold: 'down' }, finished: true, wantsDetail: true,
  details: { busy: '  Not clear who waits.\r\nWhy?\u0007 ', hold: '' }, comment: 'Good overall', contact: 'Pat <pat@example.com>' });
check('a second save replaces the row', r.status === 200);
const row = JSON.parse(psql(`SELECT row_to_json(f) FROM public.frontrow_video_feedback f WHERE viewer = '${V1}'`));
check('one row per viewer', psql('SELECT count(*) FROM public.frontrow_video_feedback') === '1');
check('reactions stored', JSON.stringify(row.reactions) === JSON.stringify({ busy: 'down', hold: 'down', title: 'up' }), JSON.stringify(row.reactions));
check('notes trimmed, control characters dropped, newlines kept, empty notes left out',
  JSON.stringify(row.details) === JSON.stringify({ busy: 'Not clear who waits.\nWhy?' }), JSON.stringify(row.details));
check('finished, wants_detail, comment and contact stored', row.finished === true && row.wants_detail === true && row.comment === 'Good overall' && row.contact === 'Pat <pat@example.com>');
await save({ video: 'show-night', viewer: V1, reactions: { title: 'up' } });
const row2 = JSON.parse(psql(`SELECT row_to_json(f) FROM public.frontrow_video_feedback f WHERE viewer = '${V1}'`));
check('a later save cannot unset finished', row2.finished === true);
check('a later save clears what the viewer took back', row2.comment === null && row2.wants_detail === null && JSON.stringify(row2.reactions) === '{"title":"up"}' && JSON.stringify(row2.details) === '{}', JSON.stringify(row2));
await save({ video: 'show-night', viewer: V1, reactions: { title: 'up', busy: 'down' }, details: { busy: 'Not clear who waits.' }, finished: true, wantsDetail: true });
await save({ video: 'show-night', viewer: V2, reactions: { title: 'down', busy: 'down' }, wantsDetail: false, finished: true });
await save({ video: 'admin-guide', viewer: V2, reactions: { title: 'up' } });

// ── Summary ─────────────────────────────────────────────────────────────────
r = await summary(undefined);
check('summary refuses an anonymous caller', r.status === 401);
r = await summary('Bearer joe');
check('summary refuses a signed-in non-admin', r.status === 403);
r = await summary('Bearer admin', 'nope');
check('summary refuses an unknown video', r.status === 400);
r = await summary('Bearer admin');
const s = r.body;
check('summary counts viewers, finished and said-more', s.viewers === 2 && s.finished === 2 && s.saidMore === 1, JSON.stringify(s));
check('summary counts thumbs per scene', s.scenes.title.up === 1 && s.scenes.title.down === 1 && s.scenes.busy.down === 2 && s.scenes.busy.up === 0, JSON.stringify(s.scenes));
check('summary notes only rows with words', s.notes.length === 1 && s.notes[0].details.busy === 'Not clear who waits.', JSON.stringify(s.notes));
check('summary keeps videos apart', (await summary('Bearer admin', 'admin-guide')).body.viewers === 1);

// ── Database fence ──────────────────────────────────────────────────────────
for (const role of ['anon', 'authenticated']) {
  let refused = false;
  try { psql(`SET ROLE ${role}; SELECT public.frontrow_video_feedback_save('{"video":"show-night","viewer":"${V1}"}'::jsonb);`); } catch { refused = true; }
  check(`${role} cannot call the save function directly`, refused);
  refused = false;
  try { psql(`SET ROLE ${role}; SELECT count(*) FROM public.frontrow_video_feedback;`); } catch { refused = true; }
  check(`${role} cannot read the table`, refused);
}
psql(`INSERT INTO public.frontrow_video_feedback (video, viewer)
  SELECT 'show-night', 'filler_' || lpad(g::text, 12, '0') FROM generate_series(1, 4998) g`);
r = await save({ video: 'show-night', viewer: 'viewer_cccccccccccccccc', reactions: { title: 'up' } });
check('a video takes at most 5000 viewers', r.status === 429 && r.body.reason === 'full', JSON.stringify(r));
r = await save({ video: 'show-night', viewer: V2, reactions: { title: 'up' } });
check('a viewer already counted can still change their answers when full', r.status === 200, JSON.stringify(r));

// ── Not set up ──────────────────────────────────────────────────────────────
r = await F.handleSave({ body: { video: 'show-night', viewer: V1 } }, { catalog, rpc: null });
check('no service key: 503', r.status === 503);
r = await F.handleSave({ body: { video: 'show-night', viewer: V1 } }, { catalog, rpc: async () => { throw new Error('rpc frontrow_video_feedback_save failed: 404 {"code":"PGRST202"}'); } });
check('migration not applied: 503 not-set-up', r.status === 503 && r.body.reason === 'not-set-up', JSON.stringify(r));

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
