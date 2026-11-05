#!/usr/bin/env node
// Ticket grants selftest: migrations 002 (+ 003 when present) + 004 on a real, throwaway Postgres
// (with a minimal stand-in for Supabase's auth schema and roles), then every
// rule in server/tickets.mjs through its handlers, with the real LiveKit SDK
// minting and verifying tokens.
//
//   node scripts/tickets-selftest.mjs
//
// Postgres: set TICKETS_PG_URL to an empty scratch database, or have initdb on
// PATH or in /usr/lib/postgresql/*/bin and the script makes its own cluster in
// a temp dir (as the postgres user when run as root), on port 5499 by default.
// Exit 0 = all pass, 1 = a failure, 2 = could not run (no Postgres).

import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'netlify/functions/package.json'));
const { AccessToken, TokenVerifier } = require('livekit-server-sdk');
const T = await import(path.join(ROOT, 'server/tickets.mjs'));

// ── Postgres ────────────────────────────────────────────────────────────────
let PG = process.env.TICKETS_PG_URL;
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
    console.log('SKIP: no Postgres (set TICKETS_PG_URL or install initdb)');
    process.exit(2);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frt-tickets-pg-'));
  const port = process.env.TICKETS_PG_PORT || '5499';
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

// The RPC caller the handlers get: same contract as makeRpc (one jsonb arg p).
const rpc = async (fn, p) => {
  if (!/^frontrow_ticket_[a-z_]+$/.test(fn)) throw new Error(`unexpected rpc ${fn}`);
  return JSON.parse(psql(`SET ROLE service_role; SELECT public.${fn}(:'p'::jsonb);`, { p: JSON.stringify(p) }));
};

// ── Schema: Supabase stand-ins, then the repo's migrations ──────────────────
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
// 003 (theater definitions) comes from its own PR; apply it when present.
const DEF = path.join(ROOT, 'migrations/003_theater_definitions.sql');
if (process.env.TICKETS_DEF_SQL || fs.existsSync(DEF)) {
  psql(fs.readFileSync(process.env.TICKETS_DEF_SQL || DEF, 'utf8'));
  console.log('applied 003_theater_definitions first');
}
const M004 = fs.readFileSync(path.join(ROOT, 'migrations/004_frontrow_tickets.sql'), 'utf8');
psql(M004);
psql(M004); // idempotent: a second run must not fail
psql(`
  UPDATE public.venues SET slug = 'front-row' WHERE id = 'a0000000-0000-4000-8000-000000000001';
  INSERT INTO public.venues (name, room_template_id, theater_manager_id, active, created_by, slug)
    VALUES ('Manager House', (SELECT id FROM public.room_templates WHERE name = 'proscenium'), '${MGR}', true, '${MGR}', 'mgr-house');
  INSERT INTO public.frontrow_admins (user_id, email) VALUES ('${MIKE}', 'mw@mike-wolf.com') ON CONFLICT DO NOTHING;
`);

// ── Deps ────────────────────────────────────────────────────────────────────
const USERS = {
  'Bearer admin-token': { id: MIKE, email: 'mw@mike-wolf.com', token: 'admin-token' },
  'Bearer mgr-token': { id: MGR, email: 'mgr@example.com', token: 'mgr-token' },
  'Bearer joe-token': { id: JOE, email: 'joe@example.com', token: 'joe-token' },
};
const KEY = 'APItestkey';
const SECRET = 'test-secret-that-is-long-enough-for-hs256-0123456789';
const deps = (over = {}) => ({
  rpc,
  getUser: async (h) => USERS[h] || null,
  isAdmin: T.makeIsAdmin(rpc),
  AccessToken, livekitKey: KEY, livekitSecret: SECRET, mode: 'stage',
  ...over,
});
const ADMIN = 'Bearer admin-token';

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''}`); }
}
async function claims(token) {
  return new TokenVerifier(KEY, SECRET).verify(token);
}
const hour = 3600e3;
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const dev = (n) => `device-${String(n).padStart(4, '0')}-abcdefghijkl`;
const token = (q, extra = {}, d = deps()) => T.handleToken({ query: q, ...extra }, d);
const issue = (body, extra = {}, d = deps()) => T.handleIssue({ body, origin: 'https://frontrowtheater.netlify.app', ...extra }, d);
const base = { venue: 'front-row', room: 'live', role: 'audience', channel: 'sent', validFrom: iso(now - 60e3), validUntil: iso(now + hour) };

// ── 1. The mint without a ticket (stage mode) ───────────────────────────────
console.log('token without a ticket');
{
  const r = await token({ identity: 'Ann', role: 'audience' });
  check('ticketless audience still gets a token', r.status === 200 && r.body.role === 'audience', r);
  const c = await claims(r.body.token);
  check('  ...for frontrow-main as Ann', c.video.room === 'frontrow-main' && c.sub === 'Ann', c);
  check('  ...and no longer than 2h', c.exp - c.nbf <= 7200, c);
}
check('role performer without a ticket is refused', (await token({ identity: 'x', role: 'performer' })).status === 403);
check('identity "performer" without a ticket is refused', (await token({ identity: 'performer', role: 'audience' })).status === 403);
check('identity " Performer " is refused too', (await token({ identity: ' Performer ', role: 'audience' })).status === 403);
check('a non-admin sign-in cannot be the performer', (await token({ role: 'performer' }, { authorization: 'Bearer joe-token' })).status === 403);
{
  const r = await token({ identity: 'Jess', role: 'performer' }, { authorization: ADMIN });
  const c = r.status === 200 && (await claims(r.body.token));
  check('a FrontRow admin joins as the performer', c && c.sub === 'performer', r);
}
check('room outside frontrow-* is refused', (await token({ room: 'soma-room-x' })).status === 403);
check('mode all: ticketless audience is refused', (await token({ identity: 'Ann' }, {}, deps({ mode: 'all' }))).status === 401);
check('mode all: an admin still gets in', (await token({ identity: 'Mike' }, { authorization: ADMIN }, deps({ mode: 'all' }))).status === 200);

// ── 2. Issuing: who may ─────────────────────────────────────────────────────
console.log('issuing');
check('nobody signed in: 401', (await issue(base)).status === 401);
check('a signed-in stranger: 403', (await issue(base, { authorization: 'Bearer joe-token' })).status === 403);
const one = await issue(base, { authorization: ADMIN });
check('an admin issues a ticket', one.status === 200 && one.body.tickets.length === 1, one);
const A = one.body.tickets[0];
check('  ...code shape frt_ + 24', /^frt_[A-Za-z0-9_-]{24}$/.test(A.code), A);
check('  ...link carries the code in the fragment', A.link === `https://frontrowtheater.netlify.app/#ticket=${A.code}`, A);
check('  ...the database holds only its sha256',
  psql(`SELECT count(*) FROM public.tickets WHERE code_hash = '${T.sha256 ? T.sha256(A.code) : ''}'`) === '1'
  && psql(`SELECT count(*) FROM public.tickets t WHERE row_to_json(t)::text LIKE '%${A.code}%'`) === '0');
check('the theater manager issues for their own venue',
  (await issue({ ...base, venue: 'mgr-house', room: 'main' }, { authorization: 'Bearer mgr-token' })).status === 200);
check('the theater manager cannot issue for another venue',
  (await issue(base, { authorization: 'Bearer mgr-token' })).status === 403);
check('bad slug is a 400', (await issue({ ...base, venue: 'Front Row' }, { authorization: ADMIN })).status === 400);
check('reversed window is a 400', (await issue({ ...base, validFrom: base.validUntil, validUntil: base.validFrom }, { authorization: ADMIN })).status === 400);
check('closed window is a 400', (await issue({ ...base, validFrom: iso(now - 2 * hour), validUntil: iso(now - hour) }, { authorization: ADMIN })).status === 400);
check('more than 200 at once is a 400', (await issue({ ...base, count: 201 }, { authorization: ADMIN })).status === 400);
check('a seat on a batch is a 400', (await issue({ ...base, count: 2, seat: 'seat-3' }, { authorization: ADMIN })).status === 400);
check('a performance without a room is a 400', (await issue({ ...base, room: null, performance: 'jess-wayne' }, { authorization: ADMIN })).status === 400);
{
  const r = await issue({ ...base, holders: ['Noel', 'Harold', 'George'] }, { authorization: ADMIN });
  check('one ticket per named holder', r.status === 200 && r.body.tickets.map((t) => t.holder).join() === 'Noel,Harold,George', r);
}

// ── 3. Redeeming ────────────────────────────────────────────────────────────
console.log('redeeming');
const withTicket = (code, d, q = {}) => token({ identity: 'Ann', role: 'audience', ...q }, { ticket: code, device: d });
{
  const r = await withTicket(A.code, dev(1), { performance: 'jess-wayne' });
  check('the ticket opens frontrow-main for its first device', r.status === 200 && r.body.ticket.id === A.id, r);
  const c = await claims(r.body.token);
  check('  ...and the token does not outlive the ticket window', c.exp * 1000 <= now + hour + 2000, c);
  check('  ...role and ticket ride in the token metadata', JSON.parse(c.metadata).ticket === A.id, c);
  check('  ...attendance written (ticket, device, show slug)',
    psql(`SELECT count(*) FROM public.audience_attendance WHERE ticket_id = '${A.id}' AND performance_id = 'jess-wayne' AND user_id IS NULL`) === '1');
}
check('the same device comes back (a reload)', (await withTicket(A.code, dev(1), { performance: 'jess-wayne' })).status === 200);
check('  ...without a second attendance row', psql(`SELECT count(*) FROM public.audience_attendance WHERE ticket_id = '${A.id}'`) === '1');
check('  ...or a second claim', psql(`SELECT count(*) FROM public.ticket_claims WHERE ticket_id = '${A.id}'`) === '1');
{
  const r = await withTicket(A.code, dev(2));
  check('a second device is refused (single ticket, forwarded link)', r.status === 403 && r.body.reason === 'used-up', r);
}
{
  const r = await withTicket(A.code, dev(1), { room: 'frontrow-other--live' });
  check('the ticket does not open another venue', r.status === 403 && r.body.reason === 'wrong-room', r);
}
{
  const r = await withTicket(A.code, dev(1), { room: 'frontrow-front-row--library' });
  check('a room ticket does not open another room of its venue', r.status === 403 && r.body.reason === 'wrong-room', r);
}
check('an unknown code is refused', (await withTicket('frt_' + 'x'.repeat(24), dev(1))).status === 403);
check('a malformed code is a 400', (await withTicket('nope', dev(1))).status === 400);
check('a missing device is a 400', (await token({}, { ticket: A.code })).status === 400);
{
  // Signed-in guest: attendance carries their user id.
  const t = (await issue(base, { authorization: ADMIN })).body.tickets[0];
  await token({ identity: 'Joe' }, { ticket: t.code, device: dev(9), authorization: 'Bearer joe-token' });
  check('a signed-in guest is recorded by user id', psql(`SELECT user_id FROM public.audience_attendance WHERE ticket_id = '${t.id}'`) === JOE);
}
{
  const t = (await issue({ ...base, role: 'performer' }, { authorization: ADMIN })).body.tickets[0];
  const r = await withTicket(t.code, dev(3), { identity: 'Jess', role: 'audience' });
  const c = r.status === 200 && (await claims(r.body.token));
  check('a performer ticket joins as "performer", whatever was asked', c && c.sub === 'performer' && r.body.role === 'performer', r);
}
{
  const r = await withTicket((await issue(base, { authorization: ADMIN })).body.tickets[0].code, dev(4), { identity: 'performer' });
  const c = r.status === 200 && (await claims(r.body.token));
  check('an audience ticket cannot take the performer identity', c && c.sub === 'Guest', r);
}
{
  const t = (await issue({ ...base, room: null }, { authorization: ADMIN })).body.tickets[0];
  check('a venue ticket opens any room of the venue', (await withTicket(t.code, dev(5), { room: 'frontrow-front-row--library' })).status === 200);
}
{
  const t = (await issue({ ...base, validFrom: iso(now + hour), validUntil: iso(now + 2 * hour) }, { authorization: ADMIN })).body.tickets[0];
  const r = await withTicket(t.code, dev(6));
  check('before the window: not-open, with the opening time', r.status === 403 && r.body.reason === 'not-open' && !!r.body.validFrom, r);
}
{
  const t = (await issue(base, { authorization: ADMIN })).body.tickets[0];
  psql(`UPDATE public.tickets SET valid_from = now() - interval '2 hours', valid_until = now() - interval '1 second' WHERE id = '${t.id}'`);
  const r = await withTicket(t.code, dev(7));
  check('after the window: closed', r.status === 403 && r.body.reason === 'closed', r);
}

// ── 4. Door passes and the race for the last use ────────────────────────────
console.log('door pass');
{
  const t = (await issue({ ...base, channel: 'door', maxDevices: 3 }, { authorization: ADMIN })).body.tickets[0];
  const results = await Promise.all([10, 11, 12, 13, 14, 15].map((n) => withTicket(t.code, dev(n))));
  const ok = results.filter((r) => r.status === 200).length;
  check('six devices at once on a 3-use pass: exactly three get in', ok === 3, results.map((r) => r.status));
  check('  ...and exactly three claims', psql(`SELECT count(*) FROM public.ticket_claims WHERE ticket_id = '${t.id}'`) === '3');
}
{
  // Deterministic race: session 1 claims the only use and holds its
  // transaction open; session 2 asks for the same ticket from another device
  // meanwhile. The row lock makes session 2 wait and then see the use taken.
  const t = (await issue({ ...base, channel: 'door' }, { authorization: ADMIN })).body.tickets[0];
  const p = (d) => JSON.stringify({ code_hash: T.sha256(t.code), device_hash: T.sha256(d), purpose: 'enter', venue_id: 'front-row', room_id: 'live' });
  const s1 = psqlAsync(`BEGIN; SET ROLE service_role; SELECT (public.frontrow_ticket_redeem(:'p'::jsonb))->>'ok'; SELECT pg_sleep(1.5); COMMIT;`, { p: p(dev(40)) });
  await new Promise((r) => setTimeout(r, 500));
  const s2 = psqlAsync(`SET ROLE service_role; SELECT (public.frontrow_ticket_redeem(:'p'::jsonb))->>'ok';`, { p: p(dev(41)) });
  const [a, b] = await Promise.all([s1, s2]);
  check('two devices racing for the last use: one wins', a.split('\n')[0] === 'true' && b === 'false', [a, b]);
}

// ── 5. Check, list, revoke ──────────────────────────────────────────────────
console.log('check, list, revoke');
{
  const t = (await issue(base, { authorization: ADMIN })).body.tickets[0];
  const r = await T.handleCheck({ ticket: t.code, device: dev(20) }, deps());
  check('check says the ticket would open', r.body.ok === true && r.body.ticket.id === t.id, r);
  check('  ...and claims nothing', psql(`SELECT count(*) FROM public.ticket_claims WHERE ticket_id = '${t.id}'`) === '0');
}
{
  const r = await T.handleList({ query: { venue: 'front-row', room: 'live' }, authorization: ADMIN }, deps());
  const row = r.body.tickets.find((x) => x.id === A.id);
  check('list shows the ticket with its claim count', r.status === 200 && row && Number(row.claimed) === 1, row);
  check('  ...and no code or hash', !JSON.stringify(r.body).includes(A.code) && !JSON.stringify(r.body).includes('code_hash'));
  check('list needs authority', (await T.handleList({ query: { venue: 'front-row' }, authorization: 'Bearer joe-token' }, deps())).status === 403);
}
{
  check('a stranger cannot revoke', (await T.handleRevoke({ body: { id: A.id }, authorization: 'Bearer joe-token' }, deps())).status === 403);
  check('another venue\'s manager cannot revoke', (await T.handleRevoke({ body: { id: A.id }, authorization: 'Bearer mgr-token' }, deps())).status === 403);
  const r = await T.handleRevoke({ body: { id: A.id }, authorization: ADMIN }, deps());
  check('an admin revokes', r.status === 200, r);
  const again = await withTicket(A.code, dev(1));
  check('  ...and the bound device is refused on its next request', again.status === 403 && again.body.reason === 'revoked', again);
}

// ── 6. Delegated manager tickets ────────────────────────────────────────────
console.log('manager tickets');
{
  const m = (await issue({ ...base, room: null, role: 'manager', validUntil: iso(now + 3 * hour) }, { authorization: ADMIN })).body.tickets[0];
  const as = { ticket: m.code, device: dev(30) };
  check('a manager ticket issues audience tickets in its venue', (await issue({ ...base, count: 2 }, as)).status === 200);
  check('  ...but not manager tickets', (await issue({ ...base, role: 'manager' }, as)).status === 403);
  check('  ...nor past its own window', (await issue({ ...base, validUntil: iso(now + 4 * hour) }, as)).status === 403);
  check('  ...nor in another venue', (await issue({ ...base, venue: 'mgr-house' }, as)).status === 403);
  check('  ...and is bound to its device', (await issue(base, { ticket: m.code, device: dev(31) })).status === 401);
  check('an audience ticket cannot issue', (await issue(base, { ticket: (await issue(base, { authorization: ADMIN })).body.tickets[0].code, device: dev(32) })).status === 401);
  const rows = psql(`SELECT count(*) FROM public.tickets WHERE issued_by = 'ticket:${m.id}'`);
  check('  ...issued_by names the manager ticket', rows === '2', rows);
}

// ── 7. The database refuses a browser ───────────────────────────────────────
console.log('grants');
for (const role of ['anon', 'authenticated']) {
  let refused = false;
  try { psql(`SELECT public.frontrow_ticket_redeem('{}'::jsonb);`, {}, { role }); } catch (e) { refused = /permission denied/.test(e.message); }
  check(`${role} cannot call the redeem function`, refused);
  refused = false;
  try { psql('SELECT count(*) FROM public.tickets;', {}, { role }); } catch (e) { refused = /permission denied/.test(e.message); }
  check(`${role} cannot read tickets`, refused);
}

// ── 8. Room names ───────────────────────────────────────────────────────────
console.log('room names');
check('frontrow-main is front-row / live', JSON.stringify(T.parseLivekitRoom('frontrow-main')) === '{"venue":"front-row","room":"live"}');
check('kit rooms split on "--"', JSON.stringify(T.parseLivekitRoom('frontrow-big-house--screen-2')) === '{"venue":"big-house","room":"screen-2"}');
check('and round-trip', T.livekitRoomFor('big-house', 'screen-2') === 'frontrow-big-house--screen-2' && T.livekitRoomFor('front-row', 'live') === 'frontrow-main');
check('a name without "--" is no kit room', T.parseLivekitRoom('frontrow-lobby') === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
