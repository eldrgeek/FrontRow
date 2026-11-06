#!/usr/bin/env node
// Theater kit release: one end-to-end test across the whole stack.
//
//   SOMA_ROOMS_DIR=../soma-rooms LIVEKIT_BIN=livekit-server [CHROMIUM_PATH=…] node tests/cross-stack/kit-release.e2e.mjs [shots-dir]
//
// What is real here:
//   - this repo's front-row-vite, built with VITE_SOMA_ROOMS_URL pointing at the room service below
//   - a SOMA Rooms service (eldrgeek/soma-rooms, with the app-ops change, PR #11), in-process,
//     with `frontrow` registered as an app the way /opt/soma-rooms-v1/apps.json will list it
//   - livekit-server --dev (keys devkey/secret), for both the SOMA room and the ticket's token
//   - Postgres with migrations 002 onward (003 records, 004 tickets, 005 roles…) as they will be applied to Supabase
//   - server/tickets.mjs, the ticket core behind the Netlify function and frontrow-server
//
// What is stood in:
//   - sign-in: a fixed user (Mike, a FrontRow admin). SOMA Rooms gets a stand-in verifier, and the
//     page's Supabase calls are answered by a small PostgREST subset over the real database, with
//     auth.uid() read from the request's JWT `sub`, as Supabase does. RLS and grants are the
//     migrations' own.
//   - the AI: an MCP client on a real AI connector URL, the same tools a Claude or ChatGPT gets.
//
// The path: Mike opens /build/front-row → the builder joins its SOMA room and declares its four
// edit ops → Mike's AI lists them and proposes adding a fourth screen → the card appears in the
// builder → Mike approves → the builder saves version 2 through save_theater_definition (a child
// venue row appears for the new screen) and reports `applied` → the AI reads `applied` back →
// Mike issues a performer ticket for the new screen → the ticket mints a LiveKit token for
// frontrow-front-row--<screen> that the real LiveKit server accepts, and that does not open
// another screen.
//
// Exit 0 = every check passed, 1 = a check failed, 2 = could not run (a dependency is missing).

import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SR = path.resolve(process.env.SOMA_ROOMS_DIR || path.join(ROOT, '..', 'soma-rooms'));
const LK_BIN = process.env.LIVEKIT_BIN || 'livekit-server';
const SHOTS = process.argv[2] || null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const skip = (why) => { console.log(`SKIP: ${why}`); process.exit(2); };
if (!fs.existsSync(path.join(SR, 'server', 'src', 'rooms.js'))) skip(`no soma-rooms checkout at ${SR} (set SOMA_ROOMS_DIR)`);
if (!fs.existsSync(path.join(SR, 'server', 'public', 'soma-room.js'))) skip(`soma-rooms client not built (run "npm run install-all && npm run build" in ${SR})`);
if (!fs.readFileSync(path.join(SR, 'server', 'src', 'rooms.js'), 'utf8').includes('proposal')) skip('this soma-rooms checkout has no app ops (needs soma-rooms PR #11)');
if (spawnSync(LK_BIN, ['--version']).status !== 0) skip(`no LiveKit server (set LIVEKIT_BIN; tried "${LK_BIN}")`);

const requireFn = createRequire(path.join(ROOT, 'netlify/functions/package.json'));
const requireSr = createRequire(path.join(SR, 'server', 'package.json'));
const { AccessToken, TokenVerifier, TrackSource } = requireFn('livekit-server-sdk');
const { chromium } = createRequire(import.meta.url)('playwright');
const T = await import(path.join(ROOT, 'server/tickets.mjs'));
const { createStore } = await import(path.join(SR, 'server/src/store.js'));
const { createLivekit } = await import(path.join(SR, 'server/src/livekit.js'));
const { createRooms } = await import(path.join(SR, 'server/src/rooms.js'));
const { createServer } = await import(path.join(SR, 'server/src/http.js'));
const { normalizeApps } = await import(path.join(SR, 'server/src/config.js'));
const { Client } = requireSr('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = requireSr('@modelcontextprotocol/sdk/client/streamableHttp.js');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${typeof detail === 'string' ? detail : JSON.stringify(detail)})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((resolve) => {
  const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
});
const cleanups = [];
const cleanup = () => { while (cleanups.length) { try { cleanups.pop()(); } catch { /* best effort */ } } };
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));

// ── Postgres with the release's migrations ────────────────────────────────
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
let PG = process.env.KIT_PG_URL;
if (!PG) {
  const initdb = findBin('initdb');
  const pgctl = findBin('pg_ctl');
  if (!initdb || !pgctl) skip('no Postgres (set KIT_PG_URL to an empty scratch database, or install initdb)');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frt-kit-pg-'));
  const port = String(await freePort());
  const asRoot = process.getuid && process.getuid() === 0;
  const run = (bin, args) => {
    if (asRoot) { fs.chmodSync(dir, 0o777); return execFileSync('runuser', ['-u', 'postgres', '--', bin, ...args], { stdio: 'pipe' }); }
    return execFileSync(bin, args, { stdio: 'pipe' });
  };
  run(initdb, ['-D', path.join(dir, 'data'), '-U', 'postgres', '-A', 'trust']);
  run(pgctl, ['-D', path.join(dir, 'data'), '-l', path.join(dir, 'log'), '-o', `-p ${port} -k ${dir} -c listen_addresses=''`, '-w', 'start']);
  PG = `postgresql://postgres@/postgres?host=${dir}&port=${port}`;
  cleanups.push(() => { try { run(pgctl, ['-D', path.join(dir, 'data'), '-m', 'immediate', 'stop']); } catch { /* down */ } fs.rmSync(dir, { recursive: true, force: true }); });
}
const PSQL = findBin('psql') || 'psql';
function psql(sql) {
  const r = spawnSync(PSQL, [PG, '-XqtA', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr.trim());
  return r.stdout.trim();
}
const lit = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

const MIKE = { id: 'e411d3d3-d2fb-4dae-8f26-6d7542f17346', email: 'mw@mike-wolf.com', name: 'Mike' };
psql(`
  DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  CREATE SCHEMA IF NOT EXISTS auth;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text);
  -- As Supabase: the signed-in user is the request JWT's sub.
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $f$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
  CREATE TABLE IF NOT EXISTS public.profiles (id uuid PRIMARY KEY);
  INSERT INTO auth.users VALUES (${lit(MIKE.id)}, ${lit(MIKE.email)}) ON CONFLICT DO NOTHING;
`);
// Every numbered migration from 002 on, in order: the same set the runbook applies to Supabase.
const MIGRATIONS = fs.readdirSync(path.join(ROOT, 'migrations')).filter((f) => /^0(0[2-9]|[1-9]\d)_.*\.sql$/.test(f)).sort();
for (const need of ['003_', '004_']) {
  if (!MIGRATIONS.some((m) => m.startsWith(need))) skip(`no migrations/${need}*.sql: run this on a branch with PRs #4, #5 and #6 merged`);
}
for (const m of MIGRATIONS) psql(fs.readFileSync(path.join(ROOT, 'migrations', m), 'utf8'));
psql(`INSERT INTO public.frontrow_admins (user_id, email) VALUES (${lit(MIKE.id)}, ${lit(MIKE.email)}) ON CONFLICT DO NOTHING;`);
check('the release\'s migrations apply in order on a fresh database', true, MIGRATIONS.map((m) => m.slice(0, 3)).join(' → '));
check('003 seeds Front Row as a theater with a stored definition',
  psql(`SELECT count(*) FROM public.venues v JOIN public.venue_settings s ON s.venue_id = v.id
        WHERE v.slug = 'front-row' AND v.super_venue_id IS NULL AND s.config ? 'definition'`) === '1');

// ── A PostgREST subset for the page's Supabase calls ──────────────────────
const SUPABASE = 'https://omfwcodoimjmbrhssvfl.supabase.co';
const IDENT = /^[a-z_][a-z0-9_]*$/;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const MIKE_JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: MIKE.id, email: MIKE.email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86400 })}.stand-in`;
const unknownRest = [];

function claimsOf(authHeader) {
  const tok = String(authHeader || '').replace(/^Bearer\s+/i, '');
  const parts = tok.split('.');
  if (parts.length !== 3) return null;
  try { return JSON.parse(Buffer.from(parts[1], 'base64url').toString()); } catch { return null; }
}
function asCaller(authHeader, sql) {
  const c = claimsOf(authHeader);
  const role = c && c.sub ? 'authenticated' : 'anon';
  return psql(`BEGIN; SET LOCAL ROLE ${role}; SELECT set_config('request.jwt.claim.sub', ${lit(c && c.sub ? c.sub : '')}, true) \\g /dev/null
${sql};
COMMIT;`);
}
function restSelect(table, params) {
  if (!IDENT.test(table)) throw new Error('bad table');
  const cols = (params.get('select') || '*').split(',').map((s) => s.trim());
  if (!cols.every((c) => c === '*' || IDENT.test(c))) throw new Error('bad select');
  const where = [];
  let order = '';
  let limit = '';
  for (const [k, v] of params) {
    if (k === 'select') continue;
    if (k === 'order') {
      const [col, dir] = v.split('.');
      if (!IDENT.test(col)) throw new Error('bad order');
      order = ` ORDER BY ${col} ${dir === 'desc' ? 'DESC' : 'ASC'}`;
      continue;
    }
    if (k === 'limit') { limit = ` LIMIT ${Number(v) | 0}`; continue; }
    if (!IDENT.test(k)) throw new Error(`bad filter ${k}`);
    const m = v.match(/^(eq|is)\.(.*)$/);
    if (!m) throw new Error(`unsupported filter ${k}=${v}`);
    if (m[1] === 'is') where.push(`${k} IS ${m[2] === 'null' ? 'NULL' : m[2] === 'true' ? 'TRUE' : 'FALSE'}`);
    else where.push(`${k}::text = ${lit(m[2])}`);
  }
  const q = `SELECT ${cols.join(', ')} FROM public.${table}${where.length ? ' WHERE ' + where.join(' AND ') : ''}${order}${limit}`;
  return `SELECT coalesce(json_agg(t), '[]'::json) FROM (${q}) t`;
}
function restRpc(fn, args) {
  if (!IDENT.test(fn)) throw new Error('bad function');
  const sig = psql(`SELECT array_to_json(p.proargnames)::text || '|' || array_to_json(array(SELECT format_type(x, NULL) FROM unnest(p.proargtypes) x))::text
                    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = ${lit(fn)} LIMIT 1`);
  if (!sig) throw new Error(`no function ${fn}`);
  const [names, types] = sig.split('|').map((s) => JSON.parse(s));
  const named = Object.entries(args || {}).map(([k, v]) => {
    const i = names.indexOf(k);
    if (i < 0 || !IDENT.test(k)) throw new Error(`no argument ${k}`);
    const ty = types[i];
    const text = ty === 'jsonb' || ty === 'json' ? JSON.stringify(v) : v;
    return `${k} => ${lit(text)}::${ty}`;
  });
  return `SELECT to_json(public.${fn}(${named.join(', ')}))`;
}
async function answerSupabase(route) {
  const req = route.request();
  const url = new URL(req.url());
  const auth = req.headers()['authorization'];
  const json = (status, body, headers = {}) => route.fulfill({
    status, contentType: 'application/json', body: JSON.stringify(body),
    headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', ...headers },
  });
  if (req.method() === 'OPTIONS') return json(200, {});
  if (url.pathname === '/auth/v1/user') {
    const c = claimsOf(auth);
    return c && c.sub ? json(200, { id: c.sub, email: c.email, aud: 'authenticated', role: 'authenticated' }) : json(401, { message: 'not signed in' });
  }
  try {
    let out;
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_0-9]+)$/);
    const tab = url.pathname.match(/^\/rest\/v1\/([a-z_0-9]+)$/);
    if (rpc && req.method() === 'POST') out = asCaller(auth, restRpc(rpc[1], JSON.parse(req.postData() || '{}')));
    else if (tab && req.method() === 'GET') out = asCaller(auth, restSelect(tab[1], url.searchParams));
    else { unknownRest.push(`${req.method()} ${url.pathname}`); return json(404, { message: 'not in the test stand-in' }); }
    const body = JSON.parse(out || 'null');
    if (tab && /vnd\.pgrst\.object/.test(req.headers()['accept'] || '')) {
      if (!Array.isArray(body) || body.length !== 1) return json(406, { code: 'PGRST116', message: `${Array.isArray(body) ? body.length : 0} rows` });
      return json(200, body[0]);
    }
    return json(200, body);
  } catch (e) {
    const msg = String(e.message || e).split('\n')[0];
    return json(/permission denied/.test(msg) ? 403 : 400, { code: 'P0001', message: msg });
  }
}

// ── LiveKit ───────────────────────────────────────────────────────────────
// LIVEKIT_NODE_IP: the address LiveKit tells browsers to send media to. 127.0.0.1 works on a
// laptop and in GitHub Actions; a sandbox whose browser skips loopback needs its own interface's IP.
const NODE_IP = process.env.LIVEKIT_NODE_IP || '127.0.0.1';
const lk = spawn(LK_BIN, ['--dev', '--bind', NODE_IP === '127.0.0.1' ? '127.0.0.1' : '0.0.0.0', '--node-ip', NODE_IP], { stdio: ['ignore', 'pipe', 'pipe'] });
let lkLog = '';
lk.stdout.on('data', (d) => { lkLog += d; });
lk.stderr.on('data', (d) => { lkLog += d; });
cleanups.push(() => lk.kill('SIGKILL'));
let lkUp = false;
for (let i = 0; i < 75 && !lkUp; i++) {
  try { lkUp = (await fetch('http://127.0.0.1:7880/')).ok; } catch { /* starting */ }
  if (!lkUp) await sleep(200);
}
if (!lkUp) { console.log(lkLog.slice(-2000)); skip('livekit-server did not start on 127.0.0.1:7880'); }

// ── SOMA Rooms, with frontrow registered as an app ────────────────────────
const srPort = await freePort();
const frtPort = await freePort();
const srBase = `http://127.0.0.1:${srPort}`;
const frtBase = `http://127.0.0.1:${frtPort}`;
const ROOM_TOKENS = { 'tok-mike-0000000000000000': MIKE };
// The same shape as the frontrow entry the runbook adds to /opt/soma-rooms-v1/apps.json.
const apps = normalizeApps([{ id: 'frontrow', name: 'Front Row Theater', origins: [frtBase], admins: [MIKE.email] }]);
const store = createStore();
const livekit = createLivekit({ apiKey: 'devkey', apiSecret: 'secret', httpUrl: 'http://127.0.0.1:7880' });
const rooms = createRooms({ store, livekit, apps, publicUrl: srBase });
const srServer = createServer({
  rooms, verify: async (t) => ROOM_TOKENS[t] || null,
  config: { publicUrl: srBase, apps, livekit: { wsPublic: 'ws://127.0.0.1:7880' }, supabase: { url: SUPABASE, publishableKey: 'unused' }, authRelay: '' },
  staticDir: path.join(SR, 'server', 'public'),
});
await new Promise((r) => srServer.listen(srPort, '127.0.0.1', r));
cleanups.push(() => srServer.close());

// ── This repo's front end, built against that room service ───────────────
const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'frt-kit-dist-'));
cleanups.push(() => fs.rmSync(dist, { recursive: true, force: true }));
const built = spawnSync('npx', ['vite', 'build', '--outDir', dist, '--emptyOutDir', '--logLevel', 'error'], {
  cwd: path.join(ROOT, 'front-row-vite'), encoding: 'utf8',
  env: { ...process.env, VITE_SOMA_ROOMS_URL: srBase, VITE_SOMA_ROOMS_APP: 'frontrow', VITE_ENABLE_TEST_MODE: 'true' },
});
if (built.status !== 0) { console.log(built.stdout, built.stderr); check('front-row-vite builds with VITE_SOMA_ROOMS_URL set', false); process.exit(1); }
check('front-row-vite builds with VITE_SOMA_ROOMS_URL set', true);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary' };
const frt = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, frtBase).pathname);
  let file = path.join(dist, p);
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => frt.listen(frtPort, '127.0.0.1', r));
cleanups.push(() => frt.close());

// ── The run ───────────────────────────────────────────────────────────────
const browser = await chromium.launch({
  // CHROMIUM_PATH: a browser other than the one this repo's playwright expects.
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required',
    // Media to a LiveKit on 127.0.0.1: Chromium leaves loopback out of ICE without this.
    '--allow-loopback-in-peer-connection'],
});
cleanups.push(() => browser.close().catch(() => {}));
let ai = null;
let pageRef = null;
try {
  const room = rooms.createRoom(MIKE, 'frontrow', { name: 'Front Row builder' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['camera', 'microphone'] });
  await ctx.route(`${SUPABASE}/**`, answerSupabase);
  await ctx.addInitScript(({ session, roomToken }) => {
    window.somaRoomGetAccessToken = async () => roomToken;
    try { localStorage.setItem('sb-omfwcodoimjmbrhssvfl-auth-token', JSON.stringify(session)); } catch { /* blocked */ }
  }, {
    roomToken: 'tok-mike-0000000000000000',
    session: {
      access_token: MIKE_JWT, refresh_token: 'stand-in', token_type: 'bearer', expires_in: 86400,
      expires_at: Math.floor(Date.now() / 1000) + 86400,
      user: { id: MIKE.id, email: MIKE.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: { full_name: 'Mike' } },
    },
  });
  const page = await ctx.newPage();
  pageRef = page;
  const pageErrors = [];
  page.on('pageerror', (e) => { pageErrors.push(e.message); console.log('[pageerror]', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };

  await page.goto(`${frtBase}/build/front-row?soma-room=${room.id}`);
  await page.getByTestId('bp').waitFor({ timeout: 20000 });
  const storeLabel = await page.getByTestId('bp-store').textContent();
  check('the builder uses the shared theater record (migration 003), not a browser draft', /shared record/.test(storeLabel), storeLabel.trim());
  check('the builder opens on version 1', /Version 1\b/.test(await page.getByTestId('bp-version').textContent()));

  const inRoom = (sel) => page.locator(`soma-room >> ${sel}`);
  await inRoom('button[data-act=join]').waitFor({ timeout: 20000 });
  await inRoom('button[data-act=join]').click();
  // The first media negotiation can time out and retry on a cold LiveKit; give it a minute.
  await inRoom('.bar').waitFor({ timeout: 60000 });
  check('the builder joins a real SOMA room as the frontrow app (Origin check, LiveKit)', true);
  await page.waitForFunction(() => /declared|ready|offer/i.test(document.querySelector('[data-testid=bp-room-status]')?.className + ' ' + document.querySelector('[data-testid=bp-room-status]')?.textContent), null, { timeout: 15000 })
    .catch(() => {});
  const roomStatus = await page.getByTestId('bp-room-status').getAttribute('class');
  check('the builder declares its edit ops to the room', /declared/.test(roomStatus), roomStatus);
  await shot('1-builder-in-room');

  // Mike's AI, through a real AI connector.
  const agent = rooms.createAgent(MIKE, { aiName: 'Opie', platform: 'claude' });
  rooms.grantRoom(MIKE, agent.id, room.id);
  ai = new Client({ name: 'kit-release-e2e', version: '1.0.0' });
  await ai.connect(new StreamableHTTPClientTransport(new URL(agent.url)));
  const call = async (name, args) => {
    const r = await ai.callTool({ name, arguments: args });
    const text = r.content?.[0]?.text || '';
    try { return JSON.parse(text); } catch { return { error: text, isError: r.isError }; }
  };
  const ops = await call('list_app_ops', { room: room.id });
  const opNames = (ops.ops || []).map((o) => o.name).sort();
  check('the AI sees the builder\'s four ops', ['issueTickets', 'setRoom', 'setScreens', 'setTheme'].every((n) => opNames.includes(n)), opNames.join(','));

  const NEW = 'green-room-stage';
  const screens = [
    { id: 'revolution' }, { id: 'live' }, { id: 'library' },
    { id: NEW, kind: 'shelf', title: 'Stories from the green room', signage: 'Backstage' },
  ];
  const proposed = await call('propose_edit', { room: room.id, op: 'setScreens', args: { screens }, rationale: 'A fourth door for backstage stories.' });
  check('the AI proposes setScreens and the room accepts it as pending', proposed.status === 'pending' && proposed.proposal, proposed);

  const card = page.getByTestId('bp-card');
  await card.first().waitFor({ timeout: 15000 }).catch(() => {});
  const cardText = (await card.count()) ? await card.first().textContent() : '';
  check('the proposal appears as a card in the builder, naming the AI', /Opie/.test(cardText), cardText.slice(0, 120));
  await shot('2-proposal-card');

  await page.getByTestId('bp-card-approve').first().click();
  await page.waitForFunction(() => /Version 2\b/.test(document.querySelector('[data-testid=bp-version]')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
  check('approving saves version 2', /Version 2\b/.test(await page.getByTestId('bp-version').textContent()));
  await shot('3-applied');

  const saved = psql(`SELECT s.version || '|' || jsonb_array_length(s.config->'definition'->'screens')
                      FROM public.venue_settings s JOIN public.venues v ON v.id = s.venue_id WHERE v.slug = 'front-row' AND v.super_venue_id IS NULL`);
  check('the database holds version 2 with four screens (save_theater_definition)', saved === '2|4', saved);
  const child = psql(`SELECT count(*) FROM public.venues c JOIN public.venues p ON c.super_venue_id = p.id
                      WHERE p.slug = 'front-row' AND c.screen_key = ${lit(NEW)} AND c.active`);
  check('the new screen got its own child venue row', child === '1', child);
  const change = psql(`SELECT c.change_note || '|' || coalesce(c.changed_by::text, '') FROM public.theater_changes c
                       JOIN public.venues v ON v.id = c.venue_id WHERE v.slug = 'front-row' AND c.version = 2`);
  check('the change history names the AI and the signed-in approver', /Opie/.test(change) && change.endsWith(MIKE.id), change);

  let decided = {};
  for (let i = 0; i < 20 && decided.status !== 'applied'; i++) {
    decided = await call('get_proposal', { room: room.id, proposal: proposed.proposal });
    if (decided.status !== 'applied') await sleep(300);
  }
  check('the AI reads the proposal back as applied', decided.status === 'applied', decided.status);

  // A ticket for the screen the AI added, minted through the shared ticket core.
  const rpc = async (fn, p) => {
    if (!/^frontrow_ticket_[a-z_]+$/.test(fn)) throw new Error(`unexpected rpc ${fn}`);
    return JSON.parse(psql(`SET ROLE service_role; SELECT public.${fn}(${lit(JSON.stringify(p))}::jsonb)`));
  };
  const deps = {
    rpc, getUser: async (h) => (h === `Bearer ${MIKE_JWT}` ? { id: MIKE.id, email: MIKE.email } : null),
    isAdmin: T.makeIsAdmin(rpc), AccessToken, TrackSource, livekitKey: 'devkey', livekitSecret: 'secret', mode: 'stage',
  };
  const now = Date.now();
  const issued = await T.handleIssue({
    authorization: `Bearer ${MIKE_JWT}`, origin: frtBase,
    body: { venue: 'front-row', room: NEW, role: 'performer', channel: 'comp', holder: 'Jess Wayne',
      validFrom: new Date(now - 60e3).toISOString(), validUntil: new Date(now + 3600e3).toISOString() },
  }, deps);
  check('a FrontRow admin issues a performer ticket for the new screen', issued.status === 200 && issued.body.tickets?.length === 1, issued.status);
  const code = issued.body.tickets?.[0]?.code;
  const device = 'device-0001-kit-release-e2e';
  const lkRoom = T.livekitRoomFor('front-row', NEW);
  const minted = await T.handleToken({ query: { identity: 'Jess', role: 'performer', room: lkRoom }, ticket: code, device }, deps);
  check('the ticket mints a LiveKit token for its screen', minted.status === 200 && minted.body.role === 'performer', minted.status);
  const claims = minted.body.token ? await new TokenVerifier('devkey', 'secret').verify(minted.body.token) : {};
  check('  ...for room frontrow-front-row--' + NEW + ' as a performer identity', claims.video?.room === lkRoom && /^performer(-[a-z0-9]+)?$/.test(claims.sub || ''), `${claims.video?.room} ${claims.sub}`);
  const v = await fetch(`http://127.0.0.1:7880/rtc/validate?access_token=${encodeURIComponent(minted.body.token || '')}`);
  check('  ...which the LiveKit server accepts', v.ok, v.status);
  const wrong = await T.handleToken({ query: { identity: 'Jess', role: 'performer', room: T.livekitRoomFor('front-row', 'live') }, ticket: code, device }, deps);
  check('the same ticket does not open the live screen', wrong.status === 403, wrong.body?.reason);
  check('redeeming wrote an attendance row', psql(`SELECT count(*) FROM public.audience_attendance WHERE room_id = ${lit(NEW)}`) === '1');

  check('the page raised no uncaught errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  if (unknownRest.length) console.log('note: Supabase calls the stand-in did not answer:', [...new Set(unknownRest)].join(', '));
} catch (e) {
  console.log(e.stack || e);
  if (process.env.KIT_DEBUG) { fs.writeFileSync(process.env.KIT_DEBUG, lkLog); console.log('livekit log written to', process.env.KIT_DEBUG); }
  if (SHOTS && pageRef) await pageRef.screenshot({ path: path.join(SHOTS, 'failure.png') }).catch(() => {});
  if (pageRef) console.log('room says:', (await pageRef.evaluate(() => document.querySelector('soma-room')?.shadowRoot?.textContent?.replace(/\s+/g, ' ').slice(0, 400)).catch(() => '')));
  check('the run finished without throwing', false, String(e.message || e));
} finally {
  if (ai) await ai.close().catch(() => {});
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
cleanup();
process.exit(failed.length ? 1 : 0);
