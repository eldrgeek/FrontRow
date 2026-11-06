#!/usr/bin/env node
// Box office selftest: migrations 002 (+ 003 when present) + 004 + 007 on a
// real, throwaway Postgres, then every rule in server/box-office.mjs through
// its handlers, and the Mac worker (scripts/ticket-mail-worker.mjs) end to end
// against a local HTTP stand-in for /api/mail-work with the mail command
// stubbed. No real email is sent and no network is used.
//
//   node scripts/box-office-selftest.mjs
//
// Postgres: as scripts/tickets-selftest.mjs (BOX_PG_URL, or initdb; port 5498).
// Exit 0 = all pass, 1 = a failure, 2 = could not run (no Postgres).
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'netlify/functions/package.json'));
const { AccessToken, TokenVerifier, TrackSource } = require('livekit-server-sdk');
const T = await import(path.join(ROOT, 'server/tickets.mjs'));

// ── Postgres ────────────────────────────────────────────────────────────────
let PG = process.env.BOX_PG_URL;
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
    console.log('SKIP: no Postgres (set BOX_PG_URL or install initdb)');
    process.exit(2);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frt-box-pg-'));
  const port = process.env.BOX_PG_PORT || '5498';
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

function psql(sql, vars = {}, { role } = {}) {
  const args = [PG, '-XqtA', '-v', 'ON_ERROR_STOP=1'];
  for (const [k, v] of Object.entries(vars)) args.push('-v', `${k}=${v}`);
  const input = (role ? `SET ROLE ${role};\n` : '') + sql;
  const r = spawnSync(findBin('psql') || 'psql', args, { input, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr.trim());
  return r.stdout.trim();
}

// Async psql, for sessions that must overlap in time.
function psqlAsync(sql, vars = {}) {
  const args = [PG, '-XqtA', '-v', 'ON_ERROR_STOP=1'];
  for (const [k, v] of Object.entries(vars)) args.push('-v', `${k}=${v}`);
  return new Promise((resolve, reject) => {
    const c = spawn(findBin('psql') || 'psql', args);
    let out = '';
    let err = '';
    c.stdout.on('data', (d) => { out += d; });
    c.stderr.on('data', (d) => { err += d; });
    c.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err.trim()))));
    c.stdin.end(sql);
  });
}
const B = await import(path.join(ROOT, 'server/box-office.mjs'));

const rpc = async (fn, p) => {
  if (!/^frontrow_[a-z_]+$/.test(fn)) throw new Error(`unexpected rpc ${fn}`);
  return JSON.parse(psql(`SET ROLE service_role; SELECT public.${fn}(:'p'::jsonb);`, { p: JSON.stringify(p) }));
};
const q1 = (sql) => psql(sql);

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
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$ SELECT NULL::uuid $f$;
  CREATE TABLE IF NOT EXISTS public.profiles (id uuid PRIMARY KEY);
  INSERT INTO auth.users VALUES ('${MIKE}', 'mw@mike-wolf.com'), ('${MGR}', 'mgr@example.com'), ('${JOE}', 'joe@example.com')
    ON CONFLICT DO NOTHING;
`);
psql(fs.readFileSync(path.join(ROOT, 'migrations/002_frontrow_venues_rls_fix_and_seed.sql'), 'utf8'));
for (const f of fs.readdirSync(path.join(ROOT, 'migrations')).sort()) {
  if (!/^00[3-9]_/.test(f)) continue;
  const sql = fs.readFileSync(path.join(ROOT, 'migrations', f), 'utf8');
  psql(sql);
  if (f.startsWith('007_')) psql(sql); // idempotent: a second run must not fail
  console.log(`applied ${f}`);
}
psql(`
  UPDATE public.venues SET slug = 'front-row' WHERE id = 'a0000000-0000-4000-8000-000000000001';
  INSERT INTO public.venues (name, room_template_id, theater_manager_id, active, created_by, slug)
    VALUES ('Manager House', (SELECT id FROM public.room_templates WHERE name = 'proscenium'), '${MGR}', true, '${MGR}', 'mgr-house');
  INSERT INTO public.frontrow_admins (user_id, email) VALUES ('${MIKE}', 'mw@mike-wolf.com') ON CONFLICT DO NOTHING;
  INSERT INTO public.venues (super_venue_id, screen_key, name, room_template_id, theater_manager_id, active, created_by)
    SELECT id, 'main', 'Main', room_template_id, '${MGR}', true, '${MGR}' FROM public.venues WHERE slug = 'mgr-house';
`);
// The nights the box office sells for (006). jess-wayne is 006's own seed.
const NIGHTS = [['front-row', 'live', 'other-show'], ['front-row', 'live', 'late-show'], ['front-row', 'live', 'third-show'],
  ['front-row', 'live', 'fourth-show'], ['front-row', 'live', 'small-show'], ['front-row', 'live', 'gone-show'], ['mgr-house', 'main', 'p1']];
for (const [theater, screen, slug] of NIGHTS) {
  const r = JSON.parse(psql(`SET ROLE service_role; SELECT public.frontrow_performance_save(:'p'::jsonb);`,
    { p: JSON.stringify({ theater, slug, screen, title: slug.replace(/-/g, ' '), artist: 'Test Artist', ...(slug === 'small-show' ? { seats: 2 } : {}) }) }));
  if (!r.ok) throw new Error(`could not schedule ${slug}: ${JSON.stringify(r)}`);
}
psql(`SET ROLE service_role; SELECT public.frontrow_performance_save('{"theater":"front-row","slug":"gone-show","status":"cancelled"}'::jsonb);`);
// Door cards for late-show are used in the test, so its doors are open (audience enter from doors).
psql(`SET ROLE service_role; SELECT public.frontrow_performance_save('{"theater":"front-row","slug":"late-show","status":"doors"}'::jsonb);`);

// ── Deps ────────────────────────────────────────────────────────────────────
const USERS = {
  'Bearer admin-token': { id: MIKE, email: 'mw@mike-wolf.com', token: 'admin-token' },
  'Bearer mgr-token': { id: MGR, email: 'mgr@example.com', token: 'mgr-token' },
  'Bearer joe-token': { id: JOE, email: 'joe@example.com', token: 'joe-token' },
};
const KEYS = B.generateMailKeys();
const WORKER_TOKEN = 'w'.repeat(40);
let SITE = 'https://frontrowtheater.netlify.app';
const deps = (over = {}) => ({
  rpc,
  getUser: async (h) => USERS[h] || null,
  isAdmin: T.makeIsAdmin(rpc),
  AccessToken, TrackSource, livekitKey: 'APItestkey', livekitSecret: 'test-secret-that-is-long-enough-for-hs256-0123456789', mode: 'stage',
  mailPublicKey: KEYS.publicKey, siteOrigin: SITE, workerToken: WORKER_TOKEN, serviceKey: 'service-key',
  seatsFor: async () => 12,
  screensFor: async (v) => (v === 'front-row' ? ['revolution', 'live', 'library'] : null),
  ...over,
});
const ADMIN = 'Bearer admin-token';
const MGR_H = 'Bearer mgr-token';

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail !== undefined ? ' :: ' + JSON.stringify(detail).slice(0, 400) : ''}`); }
}
const hour = 3600e3;
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const count = (where = 'true') => Number(q1(`SELECT count(*) FROM public.tickets WHERE ${where};`));
const base = {
  venue: 'front-row', room: 'live', performance: 'jess-wayne', role: 'audience',
  validFrom: iso(now - 60e3), validUntil: iso(now + 3 * hour),
  theaterTitle: 'Front Row Theater', showTitle: 'Jess Wayne Live', timeZone: 'America/New_York',
};
const preview = (body, auth = ADMIN, d = deps()) => B.handleMailPreview({ authorization: auth, body: { ...base, ...body } }, d);
const send = (body, auth = ADMIN, d = deps()) => B.handleMailSend({ authorization: auth, body: { ...base, ...body } }, d);
const door = (body, auth = ADMIN, d = deps()) => B.handleDoor({ authorization: auth, body: { ...base, ...body } }, d);
const list = (q = {}, auth = ADMIN, d = deps()) => B.handleBoxList({ authorization: auth, query: { venue: 'front-row', room: 'live', performance: 'jess-wayne', ...q } }, d);
const claim = (q, auth = `Bearer ${WORKER_TOKEN}`, d = deps()) => B.handleWorkerClaim({ authorization: auth, query: q }, d);
const report = (body, d = deps()) => B.handleWorkerReport({ authorization: `Bearer ${WORKER_TOKEN}`, body }, d);
const enter = (code, n) => T.handleToken({
  query: { identity: 'Guest', room: 'frontrow-main' }, ticket: code, device: `device-${String(n).padStart(4, '0')}-abcdefghijkl`,
}, deps());

// ── 1. Sealing ──────────────────────────────────────────────────────────────
console.log('sealing');
{
  const code = T.newCode();
  const id = crypto.randomUUID();
  const s = B.sealCode(code, KEYS.publicKey, id, 'ann@example.com');
  check('a sealed code does not hold the code', !s.includes(code) && s.startsWith('v1.'), s);
  check('it opens with the key, for that letter and address', B.unsealCode(s, KEYS.publicKey, KEYS.privateKey, id, 'ann@example.com') === code);
  check('not for another address', B.unsealCode(s, KEYS.publicKey, KEYS.privateKey, id, 'bob@example.com') === null);
  check('not for another letter', B.unsealCode(s, KEYS.publicKey, KEYS.privateKey, crypto.randomUUID(), 'ann@example.com') === null);
  const other = B.generateMailKeys();
  check('not with another key', B.unsealCode(s, other.publicKey, other.privateKey, id, 'ann@example.com') === null);
  const parts = s.split('.');
  const ct = Buffer.from(parts[3], 'base64url'); ct[0] ^= 1; parts[3] = ct.toString('base64url');
  check('not when tampered', B.unsealCode(parts.join('.'), KEYS.publicKey, KEYS.privateKey, id, 'ann@example.com') === null);
  check('garbage is refused, not thrown', B.unsealCode('nope', KEYS.publicKey, KEYS.privateKey, id, 'a@b.co') === null);
}

// ── 2. Guest lists ──────────────────────────────────────────────────────────
console.log('guest lists');
{
  const g = B.parseGuestList('Ann Lee <Ann@Example.com>\nbob@example.com, Bob Ray\n  carol@example.com  \nann@example.com\nnot an address\nclaude@mike-wolf.com\n-x@evil.com');
  check('three people, lower-cased, de-duplicated', JSON.stringify(g.recipients) === JSON.stringify([
    { email: 'ann@example.com', name: 'Ann Lee' }, { email: 'bob@example.com', name: 'Bob Ray' }, { email: 'carol@example.com', name: null }]), g);
  check('bad lines and agent inboxes are refused with a reason', g.refused.length === 3 && g.refused.some((r) => /automated agent/.test(r.reason)), g.refused);
  const h = B.parseGuestList([{ email: 'dee@example.com', name: 'Dee <script>' }]);
  check('names lose angle brackets', h.recipients[0].name === 'Dee script', h);
}

// ── 3. Preview issues nothing ───────────────────────────────────────────────
console.log('preview');
{
  const before = count();
  const r = await preview({ guests: 'Ann Lee <ann@example.com>\nbob@example.com' });
  check('preview answers 200', r.status === 200, r);
  check('it names every recipient', r.body.recipients.map((x) => x.email).join(',') === 'ann@example.com,bob@example.com', r.body);
  check('and the sender', r.body.sender.email === 'claude@mike-wolf.com' && /box office/.test(r.body.sender.display), r.body.sender);
  check('and the letter, with no code in it', /Jess Wayne Live/.test(r.body.sample) && !/frt_/.test(r.body.sample) && /Dear Ann Lee/.test(r.body.sample), r.body.sample);
  check('and issues nothing', count() === before);
  const bad = await preview({ guests: 'x@example.com', room: 'balcony' });
  check('a room that is not a screen of the theater is refused', bad.status === 400 && bad.body.reason === 'no-such-screen', bad);
  const nobody = await preview({ guests: 'x@example.com' }, 'Bearer joe-token');
  check('a guest who manages nothing gets 403', nobody.status === 403, nobody);
  const anon = await preview({ guests: 'x@example.com' }, null);
  check('no sign-in gets 401', anon.status === 401, anon);
  const noTitle = await preview({ guests: 'x@example.com', showTitle: '' });
  check('the letter needs a show title', noTitle.status === 400, noTitle);
  const badTz = await preview({ guests: 'x@example.com', timeZone: 'Mars/Olympus' });
  check('and a real time zone', badTz.status === 400, badTz);
}

// ── 4. Send needs the confirmed list ────────────────────────────────────────
console.log('send');
let letters;
{
  const before = count();
  const guests = 'Ann Lee <ann@example.com>\nbob@example.com';
  const none = await send({ guests });
  check('send without `shown` is refused', none.status === 409 && none.body.reason === 'not-confirmed', none);
  const wrong = await send({ guests, shown: ['ann@example.com'] });
  check('send with a different list is refused', wrong.status === 409, wrong);
  const extra = await send({ guests, shown: ['ann@example.com', 'bob@example.com', 'eve@example.com'] });
  check('send with an extra address is refused', extra.status === 409, extra);
  check('  ...and none of those issued anything', count() === before);
  const nokey = await send({ guests, shown: ['bob@example.com', 'ann@example.com'] }, ADMIN, deps({ mailPublicKey: undefined }));
  check('with no worker key: 503, nothing issued', nokey.status === 503 && count() === before, nokey);
  const ok = await send({ guests, shown: ['bob@example.com', 'ann@example.com'] });
  check('send with the confirmed list (any order) works', ok.status === 200 && ok.body.letters.length === 2, ok);
  check('  ...the response holds no code', !JSON.stringify(ok.body).includes('frt_'));
  letters = ok.body.letters;
  check('  ...two tickets, holder = address, channel sent', count(`channel = 'sent' AND holder IN ('ann@example.com','bob@example.com')`) === 2);
  const rows = q1(`SELECT state || ':' || (sealed IS NOT NULL)::text FROM public.ticket_mail ORDER BY email;`);
  check('  ...two letters queued, each with a sealed code', rows === 'queued:true\nqueued:true', rows);
}

// ── 5. Seats ────────────────────────────────────────────────────────────────
console.log('seats');
{
  const r = await door({ count: 10 });
  check('10 door cards fill the room to 12', r.status === 200 && r.body.cards.length === 10, r);
  const over = await door({ count: 1 });
  check('the 13th seat is refused', over.status === 409 && over.body.reason === 'sold-out' && over.body.seats === 12, over);
  const mail = await send({ guests: 'zed@example.com', shown: ['zed@example.com'] });
  check('a 13th letter is refused too', mail.status === 409, mail);
  const big = await send({ guests: 'yan@example.com', shown: ['yan@example.com'], maxDevices: 5, performance: 'other-show' });
  check('another performance has its own seats', big.status === 200, big);
  const ob = await door({ count: 1, overbook: true });
  check('an admin may overbook', ob.status === 200, ob);
  const two = await door({ count: 3, performance: 'small-show' });
  check('a night with its own seat count (2) is held to it', two.status === 409 && two.body.seats === 2, two);
  const before = count();
  const ghost = await door({ count: 1, performance: 'never-booked' });
  check('a performance that is not scheduled sells nothing', ghost.status === 400 && ghost.body.reason === 'no-performance' && count() === before, ghost);
  const ghostMail = await send({ guests: 'q@example.com', shown: ['q@example.com'], performance: 'never-booked' });
  check('  ...by mail either', ghostMail.status === 400 && count() === before, ghostMail);
  const gone = await door({ count: 1, performance: 'gone-show' });
  check('a cancelled night sells nothing', gone.status === 409 && gone.body.reason === 'performance-closed', gone);
}

// ── 6. Door cards ───────────────────────────────────────────────────────────
console.log('door cards');
let cards;
{
  const r = await door({ count: 2, performance: 'late-show', role: 'performer', maxDevices: 9 });
  cards = r.body.cards;
  check('labeled Door 1 and Door 2 for a new show', r.status === 200 && cards.map((c) => c.label).join(',') === 'Door 1,Door 2', r);
  const r2 = await door({ count: 2, performance: 'late-show' });
  check('the next batch carries on at Door 3', r2.body.cards.map((c) => c.label).join(',') === 'Door 3,Door 4', r2.body);
  const row = q1(`SELECT role || ',' || max_devices || ',' || channel FROM public.tickets WHERE id = '${cards[0].id}';`);
  check('a door card is always audience, one device, channel door', row === 'audience,1,door', row);
  check('the card carries a fragment link', cards[0].link === `${SITE}/#ticket=${cards[0].code}`, cards[0]);
  const e = await enter(cards[0].code, 1);
  check('the code opens the door', e.status === 200 && e.body.role === 'audience', e);
  const e2 = await enter(cards[0].code, 2);
  check('  ...on one device only', e2.status === 403 && e2.body.reason === 'used-up', e2);
  const noRoom = await door({ count: 1, room: undefined, performance: undefined });
  check('door cards name their room', noRoom.status === 400, noRoom);
}

// ── 7. Sold marks and the list ──────────────────────────────────────────────
console.log('sold marks and the list');
{
  const s = await B.handleSold({ authorization: ADMIN, body: { id: cards[1].id, sold: true, note: 'Pat at the door' } }, deps());
  check('a door card can be marked sold with the buyer', s.status === 200, s);
  const sentId = letters[0].ticket;
  const s2 = await B.handleSold({ authorization: ADMIN, body: { id: sentId, sold: true } }, deps());
  check('a sent ticket cannot be marked sold', s2.status === 409, s2);
  const s3 = await B.handleSold({ authorization: 'Bearer joe-token', body: { id: cards[1].id, sold: false } }, deps());
  check('a non-manager cannot touch the mark', s3.status === 403, s3);
  const l = await list({ performance: 'late-show' });
  const c1 = l.body.tickets.find((t) => t.id === cards[1].id);
  check('the list shows the sale', c1 && c1.sold_note === 'Pat at the door' && c1.sold_by === 'mw@mike-wolf.com', c1);
  check('the summary counts door, sold and used', l.body.summary.door === 4 && l.body.summary.doorSold === 1 && l.body.summary.used === 1, l.body.summary);
  check('the list names the screens and holds no codes', JSON.stringify(l.body.screens) === '["revolution","live","library"]' && !JSON.stringify(l.body).includes('frt_'), l.body.screens);
  const u = await B.handleSold({ authorization: ADMIN, body: { id: cards[1].id, sold: false } }, deps());
  check('the mark can be taken back', u.status === 200 && q1(`SELECT sold_at IS NULL FROM public.tickets WHERE id = '${cards[1].id}';`) === 't', u);
  const m = await list();
  check('the list names the night from the schedule', m.body.performance && m.body.performance.slug === 'jess-wayne' && m.body.performance.status === 'doors', m.body.performance);
  check('the main show is 12 promised of 12, plus 1 overbooked', m.body.summary.seats === 12 && m.body.summary.seatsPromised === 13, m.body.summary);
  check('two letters waiting', m.body.summary.waiting === 2, m.body.summary);
  check('no worker has checked in yet', m.body.worker === null, m.body.worker);
}

// ── 8. Managers ─────────────────────────────────────────────────────────────
console.log('managers');
{
  const own = await door({ venue: 'mgr-house', room: 'main', performance: 'p1', count: 1 }, MGR_H);
  check('a theater manager makes door cards for their theater', own.status === 200, own);
  const notMine = await door({ count: 1, performance: 'other-show' }, MGR_H);
  check('but not for another theater', notMine.status === 403, notMine);
  const ob = await door({ venue: 'mgr-house', room: 'main', performance: 'p1', count: 12, overbook: true }, MGR_H);
  check('and a manager may not overbook', ob.status === 409, ob);
}

// ── 9. The worker door ──────────────────────────────────────────────────────
console.log('the worker door');
{
  check('no token configured: 503', (await claim({}, `Bearer ${WORKER_TOKEN}`, deps({ workerToken: undefined }))).status === 503);
  check('a token equal to the service key: 503', (await claim({}, 'Bearer service-key', deps({ workerToken: 'service-key' }))).status === 503);
  check('a short token: 503', (await claim({}, 'Bearer short', deps({ workerToken: 'short' }))).status === 503);
  check('a wrong token: 401', (await claim({}, 'Bearer ' + 'x'.repeat(40))).status === 401);
  check('a sign-in is not the worker: 401', (await claim({}, ADMIN)).status === 401);
  const off = await claim({ armed: '0', limit: '5', host: 'mikes-mac' });
  check('an unarmed worker checks in and takes nothing', off.status === 200 && off.body.jobs.length === 0, off);
  const l = await list();
  check('the box office now sees the Mac, mail off', l.body.worker && l.body.worker.connected && !l.body.worker.armed && l.body.worker.host === 'mikes-mac', l.body.worker);
  check('the letters still wait', q1(`SELECT count(*) FROM public.ticket_mail WHERE state = 'queued';`) === '3', q1('SELECT state FROM public.ticket_mail'));
}

// ── 10. The Mac worker, end to end (HTTP stand-in, mail stubbed) ────────────
console.log('the Mac worker');
{
  const http = await import('node:http');
  const server = http.createServer(async (req, resp) => {
    let raw = '';
    for await (const c of req) raw += c;
    const u = new URL(req.url, 'http://x');
    const r = u.pathname !== '/api/mail-work' ? { status: 404, body: {} }
      : req.method === 'GET' ? await B.handleWorkerClaim({ authorization: req.headers.authorization, query: Object.fromEntries(u.searchParams) }, deps())
        : await B.handleWorkerReport({ authorization: req.headers.authorization, body: JSON.parse(raw || '{}') }, deps());
    resp.writeHead(r.status, { 'content-type': 'application/json' });
    resp.end(JSON.stringify(r.body));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'frt-box-worker-'));
  const outDir = path.join(work, 'out');
  fs.mkdirSync(outDir);
  const stub = path.join(work, 'mail-stub.mjs');
  fs.writeFileSync(stub, `import fs from 'node:fs';
const a = Object.fromEntries(process.argv.slice(2).map((x) => { const i = x.indexOf('='); return [x.slice(2, i), x.slice(i + 1)]; }));
a.body = fs.readFileSync(a['body-file'], 'utf8'); a.seat = process.env.ESTATE_SEAT;
fs.writeFileSync(${JSON.stringify(outDir)} + '/' + a.to + '.json', JSON.stringify(a));
if (a.to === 'bob@example.com' && process.env.STUB_FAIL_BOB) { console.error('smtp said no'); process.exit(1); }
`);
  const envFile = path.join(work, '.env.ticket-mail');
  fs.writeFileSync(envFile, `FRONTROW_MAIL_WORKER_TOKEN=${WORKER_TOKEN}\nFRONTROW_MAIL_PUBKEY=${KEYS.publicKey}\nFRONTROW_MAIL_PRIVKEY=${KEYS.privateKey}\n`, { mode: 0o600 });
  const stateDir = path.join(work, 'state');
  const runWorker = (args, extraEnv = {}) => spawnSync(process.execPath, [path.join(ROOT, 'scripts/ticket-mail-worker.mjs'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, FRONTROW_SITE: `http://127.0.0.1:${port}`, TICKET_MAIL_ENV_FILE: envFile, TICKET_MAIL_STATE_DIR: stateDir, TICKET_MAIL_CMD: `${process.execPath} ${stub}`, ...extraEnv },
  });
  // The letters were queued for the production site; the worker's list holds only the stand-in.
  // spawnSync blocks this process, so the stand-in server cannot answer; run the poll async.
  const runAsync = (args, extraEnv = {}) => new Promise((resolve) => {
    const c = spawn(process.execPath, [path.join(ROOT, 'scripts/ticket-mail-worker.mjs'), ...args], {
      env: { ...process.env, FRONTROW_SITE: `http://127.0.0.1:${port}`, TICKET_MAIL_ENV_FILE: envFile, TICKET_MAIL_STATE_DIR: stateDir, TICKET_MAIL_CMD: `${process.execPath} ${stub}`, ...extraEnv },
    });
    let out = '';
    c.stdout.on('data', (d) => { out += d; });
    c.stderr.on('data', (d) => { out += d; });
    c.on('close', (code) => resolve({ status: code, out }));
  });
  const off = await runAsync(['once']);
  check('unarmed: one poll, nothing sent', off.status === 0 && /"jobs":0/.test(off.out) && fs.readdirSync(outDir).length === 0, off.out);
  runWorker(['arm']);
  const wrongSite = await runAsync(['once']);
  check('armed, but the letters link to a site not on this Mac\'s list: refused, nothing sent', /REFUSED/.test(wrongSite.out) && fs.readdirSync(outDir).length === 0, wrongSite.out);
  const refusedRows = q1(`SELECT count(*) FROM public.ticket_mail WHERE state = 'failed' AND error LIKE '%not on this Mac%';`);
  check('  ...and reported back as not sent, with the reason', refusedRows === '3', q1('SELECT state, error FROM public.ticket_mail'));
  // Put the site on the Mac's list and retry them from the box office.
  fs.writeFileSync(path.join(stateDir, 'config.json'), JSON.stringify({ armed: true, origins: [SITE], maxPerHour: 60 }));
  const ids = q1(`SELECT id FROM public.ticket_mail ORDER BY email;`).split('\n');
  for (const id of ids) {
    const r = await B.handleRetry({ authorization: ADMIN, body: { id } }, deps());
    if (r.status !== 200) check(`retry ${id}`, false, r);
  }
  check('the box office can retry failed letters', q1(`SELECT count(*) FROM public.ticket_mail WHERE state = 'queued';`) === '3');
  const again = await B.handleRetry({ authorization: ADMIN, body: { id: ids[0] } }, deps());
  check('  ...but not one that has not failed', again.status === 409 && again.body.reason === 'not-failed', again);
  const nope = await B.handleRetry({ authorization: 'Bearer joe-token', body: { id: ids[0] } }, deps());
  check('  ...and a non-manager cannot retry', nope.status === 403, nope);

  // Revoke yan's ticket (other-show): its letter must never go.
  const yan = q1(`SELECT ticket_id FROM public.ticket_mail WHERE email = 'yan@example.com';`);
  await T.handleRevoke({ authorization: ADMIN, body: { id: yan } }, deps());
  const sent = await runAsync(['once'], { STUB_FAIL_BOB: '1' });
  const files = fs.readdirSync(outDir).sort();
  check('armed: Ann\'s letter went out; Bob\'s failed at the mail step; Yan\'s (revoked) never left', files.join(',') === 'ann@example.com.json,bob@example.com.json', files.concat(sent.out));
  const ann = JSON.parse(fs.readFileSync(path.join(outDir, 'ann@example.com.json'), 'utf8'));
  const m = /#ticket=(frt_[A-Za-z0-9_-]{24})/.exec(ann.body);
  check('the letter carries Ann\'s own working link', !!m && ann.body.includes(`${SITE}/#ticket=`), ann.body);
  check('  ...is written by the Mac from the template', ann.subject === 'Your ticket: Jess Wayne Live at Front Row Theater' && /Dear Ann Lee/.test(ann.body), ann.subject);
  check('  ...sent as seat mail-courier, from the box office', ann.seat === 'mail-courier' && ann['from-display'] === 'Front Row Theater box office', ann);
  check('  ...and its temp file is gone', !fs.existsSync(ann['body-file']));
  const e = m && (await enter(m[1], 7));
  check('Ann\'s code opens the door', e && e.status === 200, e);
  const states = q1(`SELECT email || ':' || state || ':' || (sealed IS NULL)::text FROM public.ticket_mail ORDER BY email;`);
  check('states: Ann sent (sealed copy wiped), Bob failed (kept for retry), Yan failed (wiped)',
    states === 'ann@example.com:sent:true\nbob@example.com:failed:false\nyan@example.com:failed:true', states);
  const log = fs.readFileSync(path.join(stateDir, 'sent.jsonl'), 'utf8');
  check('the Mac\'s sent log holds no code', !/frt_/.test(log) && /ann@example.com/.test(log), log);
  const l = await list();
  check('the box office shows delivered and not sent', l.body.summary.delivered === 1 && l.body.summary.notSent === 1 && l.body.worker.armed, l.body.summary);
  const yanRetry = await B.handleRetry({ authorization: ADMIN, body: { id: q1(`SELECT id FROM public.ticket_mail WHERE email = 'yan@example.com';`) } }, deps());
  check('a revoked ticket\'s letter cannot be retried', yanRetry.status === 409, yanRetry);

  // A sealed code moved onto another letter will not open.
  const bobId = q1(`SELECT id FROM public.ticket_mail WHERE email = 'bob@example.com';`);
  await B.handleRetry({ authorization: ADMIN, body: { id: bobId } }, deps());
  const send2 = await send({ guests: 'cy@example.com', shown: ['cy@example.com'], performance: 'third-show' });
  check('a third show letter queued', send2.status === 200, send2);
  q1(`UPDATE public.ticket_mail SET sealed = (SELECT sealed FROM public.ticket_mail WHERE id = '${bobId}') WHERE email = 'cy@example.com';`);
  const swapped = await runAsync(['once']);
  check('a code copied onto another guest\'s letter is refused', /REFUSED .*did not open/.test(swapped.out) && !fs.existsSync(path.join(outDir, 'cy@example.com.json')), swapped.out);
  check('  ...while Bob\'s own letter goes', fs.existsSync(path.join(outDir, 'bob@example.com.json')));

  // Rate limit, kept across restarts by the sent log.
  fs.writeFileSync(path.join(stateDir, 'config.json'), JSON.stringify({ armed: true, origins: [SITE], maxPerHour: 2 }));
  const send3 = await send({ guests: 'dot@example.com', shown: ['dot@example.com'], performance: 'third-show' });
  check('another letter queued', send3.status === 200);
  const capped = await runAsync(['once']);
  check('over the hourly cap: refused, not sent', /more than 2 letters this hour/.test(capped.out) && !fs.existsSync(path.join(outDir, 'dot@example.com.json')), capped.out);

  // Dry run reports "not sent".
  fs.writeFileSync(path.join(stateDir, 'config.json'), JSON.stringify({ armed: true, origins: [SITE], maxPerHour: 60 }));
  await B.handleRetry({ authorization: ADMIN, body: { id: q1(`SELECT id FROM public.ticket_mail WHERE email = 'dot@example.com';`) } }, deps());
  const dry = await runAsync(['once'], { TICKET_MAIL_DRY_RUN: '1' });
  check('a dry run sends nothing and says so', /DRY RUN/.test(dry.out) && !fs.existsSync(path.join(outDir, 'dot@example.com.json'))
    && q1(`SELECT error FROM public.ticket_mail WHERE email = 'dot@example.com';`).includes('dry run'), dry.out);

  const st = runWorker(['status']);
  check('status shows the key without the private half', /"hasKey": true/.test(st.stdout) && !st.stdout.includes(KEYS.privateKey), st.stdout);
  const k = runWorker(['keys']);
  check('keys never overwrites a key that is there', /already holds a key/.test(k.stdout) && fs.readFileSync(envFile, 'utf8').includes(KEYS.privateKey), k.stdout);
  const fresh = path.join(work, 'fresh.env');
  const k2 = runWorker(['keys'], { TICKET_MAIL_ENV_FILE: fresh });
  check('keys makes a mode-600 key file', /FRONTROW_MAIL_PUBKEY=/.test(k2.stdout) && (fs.statSync(fresh).mode & 0o777) === 0o600 && !k2.stdout.includes('PRIVKEY'), k2.stdout);
  server.close();
  fs.rmSync(work, { recursive: true, force: true });
}

// ── 11. The queue's clocks ──────────────────────────────────────────────────
console.log('the queue\'s clocks');
{
  const r = await send({ guests: 'eli@example.com', shown: ['eli@example.com'], performance: 'fourth-show' });
  const id = r.body.letters[0].id;
  q1(`UPDATE public.ticket_mail SET queued_at = now() - interval '7 hours' WHERE id = '${id}';`);
  await claim({ armed: '1', limit: '0', host: 'mac' });
  const st = q1(`SELECT state || ':' || error FROM public.ticket_mail WHERE id = '${id}';`);
  check('a letter nobody picked up in 6 hours fails and says so', /^failed:Mike's Mac did not pick it up/.test(st), st);
  await B.handleRetry({ authorization: ADMIN, body: { id } }, deps());
  const got = await claim({ armed: '1', limit: '1', host: 'mac' });
  check('retried, it goes out with its sealed code', got.body.jobs.length === 1 && got.body.jobs[0].id === id && got.body.jobs[0].sealed, got.body);
  q1(`UPDATE public.ticket_mail SET claimed_at = now() - interval '20 minutes' WHERE id = '${id}';`);
  await claim({ armed: '1', limit: '0', host: 'mac' });
  const stale = q1(`SELECT state || ':' || error FROM public.ticket_mail WHERE id = '${id}';`);
  check('a letter the Mac never reported on fails with a warning to check', /^failed:.*never said whether it was sent/.test(stale), stale);
  const late = await report({ id, ok: true });
  check('a report on a letter no longer out with the worker changes nothing', late.body.ok === false && q1(`SELECT state FROM public.ticket_mail WHERE id = '${id}';`) === 'failed', late);
  q1(`UPDATE public.tickets SET valid_until = now() - interval '1 minute', valid_from = now() - interval '2 hours' WHERE id = (SELECT ticket_id FROM public.ticket_mail WHERE id = '${id}');`);
  await claim({ armed: '1', limit: '0', host: 'mac' });
  check('once the window closes the sealed copy is wiped', q1(`SELECT sealed IS NULL FROM public.ticket_mail WHERE id = '${id}';`) === 't');
}

// ── 12. Nothing reaches a browser ───────────────────────────────────────────
console.log('nothing reaches a browser');
for (const role of ['anon', 'authenticated']) {
  for (const fn of ['frontrow_box_office_performance', 'frontrow_box_office_issue', 'frontrow_box_office_list', 'frontrow_mail_claim', 'frontrow_mail_report', 'frontrow_mail_retry', 'frontrow_box_office_sold', 'frontrow_mail_get']) {
    let refused = false;
    try { psql(`SELECT public.${fn}('{}'::jsonb);`, {}, { role }); } catch (e) { refused = /permission denied/.test(e.message); }
    check(`${role} cannot call ${fn}`, refused);
  }
  for (const t of ['ticket_mail', 'ticket_mail_worker']) {
    let refused = false;
    try { psql(`SELECT count(*) FROM public.${t};`, {}, { role }); } catch (e) { refused = /permission denied/.test(e.message); }
    check(`${role} cannot read ${t}`, refused);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
