#!/usr/bin/env node
// Show night, without LiveKit: the set survives a second performer, seats are
// kept between acts, and a dropped performer's stage is held and then freed.
//
//   node tests/cross-stack/show-night.e2e.mjs [shots-dir]      (npm run test:show-night)
//
// Real: frontrow-server (server/index.js), the built page, a guest in a seat.
// Performer A is a raw socket.io client (what a green room page sends).
// Performer B is a real green room page with a stood-in admin sign-in.
// Stood in: Supabase, the admin check, and the token mint (answers 503, so no
// video; tests/cross-stack/two-cameras.e2e.mjs covers LiveKit).
//
// SERVER_DIR=<dir> runs another server build (for example master's) under the
// same page: the two "new server only" checks are then expected to fail.
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SERVER_DIR = process.env.SERVER_DIR || path.join(ROOT, 'server');
const LABEL = process.env.SERVER_DIR ? 'other-server' : 'show-night';
const SHOTS = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'fr-show-night-shots-'));
const DIST = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-show-night-'));
const req = createRequire(path.join(ROOT, 'package.json'));
const { chromium } = req('playwright');
const { io } = createRequire(path.join(ROOT, 'front-row-vite/package.json'))('socket.io-client');
fs.mkdirSync(SHOTS, { recursive: true });
execFileSync('npx', ['vite', 'build', '--outDir', DIST, '--emptyOutDir'], {
  cwd: path.join(ROOT, 'front-row-vite'), stdio: 'ignore',
  env: { ...process.env, VITE_BACKEND_URL: 'http://127.0.0.1:4801', VITE_SOCKET_URL: 'http://127.0.0.1:4801', VITE_LIVEKIT_URL: 'ws://127.0.0.1:4899', VITE_TOKEN_URL: 'http://127.0.0.1:4802/token', VITE_ENABLE_TEST_MODE: 'true' },
});

let pass = 0, fail = 0;
const check = (n, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} [${LABEL}] ${n} ${ok ? '' : extra}`); };
const waitFor = async (fn, ms = 15000) => { const t = Date.now(); for (;;) { const v = await fn().catch(() => null); if (v) return v; if (Date.now() - t > ms) return null; await new Promise((r) => setTimeout(r, 200)); } };

const api = spawn(process.execPath, ['index.js'], { cwd: SERVER_DIR, stdio: 'ignore',
  env: { ...process.env, PORT: '4801', NODE_ENV: 'development', SUPABASE_SERVICE_ROLE_KEY: 'dummy', LIVEKIT_API_KEY: 'devkey', LIVEKIT_API_SECRET: 'secret', FRONTROW_STAGE_HOLD_MS: '6000' } });
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg' };
const site = http.createServer((q, s) => {
  let f = path.join(DIST, decodeURIComponent(new URL(q.url, 'http://x').pathname));
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, 'index.html');
  s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s);
}).listen(4803, '127.0.0.1');
const SITE = 'http://127.0.0.1:4803';
const done = async (b) => { api.kill('SIGKILL'); site.close(); await b?.close(); console.log(`[${LABEL}] ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); };

if (!(await waitFor(async () => (await fetch('http://127.0.0.1:4801/health')).ok))) { console.log('server did not start'); await done(); }

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const STORAGE_KEY = 'sb-omfwcodoimjmbrhssvfl-auth-token';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
async function context(signedIn, name) {
  const ctx = await browser.newContext({ permissions: ['camera', 'microphone'], viewport: { width: 1280, height: 800 } });
  const h = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  await ctx.route('https://omfwcodoimjmbrhssvfl.supabase.co/**', (r) => {
    const p = new URL(r.request().url()).pathname;
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: h });
    if (p.startsWith('/auth/v1/')) return r.fulfill({ status: 200, headers: h, contentType: 'application/json', body: JSON.stringify({ id: 'u-' + name, email: name + '@example.com', aud: 'authenticated', user_metadata: { full_name: name } }) });
    return r.fulfill({ status: 200, headers: h, contentType: 'application/json', body: '[]' });
  });
  await ctx.route('**/api/am-i-frontrow-admin', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ admin: signedIn }) }));
  await ctx.route('http://127.0.0.1:4802/**', (r) => r.fulfill({ status: 503, headers: h, contentType: 'application/json', body: '{"error":"no livekit in this walk"}' }));
  if (signedIn) await ctx.addInitScript(([key, token, n]) => {
    const now = Math.floor(Date.now() / 1000);
    localStorage.setItem(key, JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600,
      user: { id: 'u-' + n, email: n + '@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: { full_name: n }, created_at: '2026-01-01T00:00:00Z' } }));
  }, [STORAGE_KEY, `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u-' + name, email: name + '@example.com', exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })}.sig`, name]);
  return ctx;
}
const state = (page) => page.evaluate(() => window.__frontrow_state__ || null);

try {
  // Guest Ruth sits down.
  const guest = await (await context(false, 'Ruth')).newPage();
  await guest.goto(`${SITE}/show/jess-wayne`);
  await guest.screenshot({ path: `${SHOTS}/${LABEL}-0-invite.png` });
  await guest.getByTestId('fr-take-seat').click();
  await guest.getByTestId('fr-name').fill('Ruth');
  await guest.getByTestId('fr-get-ticket').click();
  await guest.screenshot({ path: `${SHOTS}/${LABEL}-0-ticket.png` });
  await guest.getByTestId('fr-enter-lobby').click();
  await guest.waitForTimeout(1500);
  await guest.screenshot({ path: `${SHOTS}/${LABEL}-0-lobby.png` });
  await guest.getByTestId('fr-door-live').click();
  await guest.getByTestId('fr-hud').waitFor({ timeout: 30000 });
  await waitFor(() => guest.evaluate(() => !!window.__FRONTROW_SCENE__?.clickSeat), 20000);
  await guest.evaluate(() => window.__FRONTROW_SCENE__.clickSeat('seat-3'));
  check('guest is seated', !!(await waitFor(async () => (await state(guest))?.selectedSeat === 'seat-3')));

  // Performer A (a raw socket, as a green room page would be) goes live.
  const A = io('http://127.0.0.1:4801', { query: { venue: 'front-row', room: 'live', stageKey: 'sk-aaaaaaaaaaaa' }, transports: ['websocket'] });
  await new Promise((r) => A.on('connect', r));
  A.emit('artist-go-live', { name: 'Harold' });
  check('guest sees the show go live', !!(await waitFor(async () => (await state(guest))?.showState === 'live')));

  // Chat during the set.
  const chatBtn = guest.getByTestId('fr-chat-open');
  if (await chatBtn.count()) {
    await chatBtn.click();
    await guest.waitForTimeout(500);
    await guest.screenshot({ path: `${SHOTS}/${LABEL}-1-chat.png` });
  } else console.log('note: no chat button');

  // Performer B opens the green room mid-set.
  const perfB = await (await context(true, 'George')).newPage();
  await perfB.goto(`${SITE}/show/jess-wayne/green-room`);
  await perfB.getByTestId('fr-green-room').waitFor({ timeout: 30000 });
  await perfB.waitForTimeout(3000);
  const g = await state(guest);
  check('the set is still live after a second performer opens the green room', g?.showState === 'live', JSON.stringify(g?.showState));
  check('the guest kept the seat', g?.selectedSeat === 'seat-3' && (g?.audienceSeats || []).some((s) => s.seatId === 'seat-3'), JSON.stringify(g?.audienceSeats));
  check('the second performer is told the stage is taken', await perfB.getByTestId('fr-stage-busy').count() === 1);
  check('go-on buttons are disabled for the second performer', await perfB.getByTestId('fr-green-onstage').isDisabled());
  await perfB.screenshot({ path: `${SHOTS}/${LABEL}-2-green-busy.png` });
  // B reloads (a reconnect): still nothing happens to the set.
  await perfB.reload();
  await perfB.getByTestId('fr-green-room').waitFor({ timeout: 30000 });
  await perfB.waitForTimeout(2000);
  check('still live after the second performer reloads', (await state(guest))?.showState === 'live');

  // A ends the set: what happens to the seat?
  A.emit('artist-end-show');
  await guest.waitForTimeout(8000);
  const after = await state(guest);
  console.log(`info [${LABEL}] after the set: showState=${after?.showState} seat=${after?.selectedSeat} seats=${(after?.audienceSeats || []).length}`);
  check('after the set the guest is still seated (new server only)', after?.selectedSeat === 'seat-3' && (after?.audienceSeats || []).length === 1, 'expected to fail on the old server');
  await guest.screenshot({ path: `${SHOTS}/${LABEL}-3-after-set.png` });

  // A goes live again and drops: hold (new server only).
  A.emit('artist-go-live', { name: 'Harold' });
  await waitFor(async () => (await state(guest))?.showState === 'live');
  A.disconnect();
  await guest.waitForTimeout(1500);
  const held = await guest.getByTestId('fr-stage-hold').count();
  console.log(`info [${LABEL}] hold notice shown to guest: ${held}`);
  await guest.screenshot({ path: `${SHOTS}/${LABEL}-4-hold.png` });
  await guest.waitForTimeout(12000);
  const end = await state(guest);
  console.log(`info [${LABEL}] 13 s after the performer dropped: showState=${end?.showState} seat=${end?.selectedSeat}`);
  check('a dropped performer does not leave the stage live forever (new server only)', end?.showState !== 'live', 'expected to fail on the old server');
  await done(browser);
} catch (e) { console.log('ERROR', e.message); fail++; await done(browser); }
