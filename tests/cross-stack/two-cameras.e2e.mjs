#!/usr/bin/env node
// A show with two performer cameras, end to end, on a real LiveKit server.
//
//   LIVEKIT_BIN=livekit-server [CHROMIUM_PATH=…] node tests/cross-stack/two-cameras.e2e.mjs [shots-dir]
//
// What is real: this repo's front-row-vite (built for this test), frontrow-server
// (server/index.js, the house's seats and show state), livekit-server --dev,
// server/tickets.mjs handleToken minting every token, and three Chromium
// pages with fake cameras and mics: the performer's laptop in the green room,
// the performer's phone on /stage-camera, and a guest in a seat.
//
// Stood in: sign-in (a fixed FrontRow admin; /api/am-i-frontrow-admin says
// yes) and ticket redemption (/api/ticket-issue hands back a code, and the
// token stub treats a ticket as that admin, since ticket rules have their own
// selftest). Supabase reads answer empty.
//
// Checks: the guest hears the performer (an unmuted <audio> plays the mic);
// the phone joins beside the laptop without evicting it; the guest gets the
// phone as the stage feed and the laptop as the big screen; "Step onto the
// stage" puts the figure up; the performer looks out from the stage.
//
// Exit 0 = every check passed, 1 = a check failed, 2 = could not run.

import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LK_BIN = process.env.LIVEKIT_BIN || 'livekit-server';
const SHOTS = process.argv[2] || null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const skip = (why) => { console.log(`SKIP: ${why}`); process.exit(2); };
if (spawnSync(LK_BIN, ['--version']).status !== 0) skip(`no LiveKit server (set LIVEKIT_BIN; tried "${LK_BIN}")`);
if (!fs.existsSync(path.join(ROOT, 'server/node_modules'))) skip('server/node_modules missing (npm ci in server/)');

const requireFn = createRequire(path.join(ROOT, 'netlify/functions/package.json'));
const { AccessToken, TrackSource } = requireFn('livekit-server-sdk');
const { chromium } = createRequire(import.meta.url)('playwright');
const T = await import(path.join(ROOT, 'server/tickets.mjs'));

const freePort = () => new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const procs = [];
const servers = [];
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`); };
const done = (code) => { procs.forEach((p) => p.kill('SIGKILL')); servers.forEach((s) => s.close()); process.exit(code); };
const waitFor = async (fn, ms = 20000, step = 250) => { const t = Date.now(); for (;;) { const v = await fn().catch(() => null); if (v) return v; if (Date.now() - t > ms) return null; await new Promise((r) => setTimeout(r, step)); } };

// ── LiveKit ──────────────────────────────────────────────────────────────────
const lkPort = await freePort();
const lk = spawn(LK_BIN, ['--dev', '--bind', '127.0.0.1', '--node-ip', '127.0.0.1', '--port', String(lkPort)], { stdio: 'ignore' });
procs.push(lk);
const LK_URL = `ws://127.0.0.1:${lkPort}`;

// ── frontrow-server ──────────────────────────────────────────────────────────
const apiPort = await freePort();
const api = spawn(process.execPath, ['index.js'], {
  cwd: path.join(ROOT, 'server'),
  env: { ...process.env, PORT: String(apiPort), NODE_ENV: 'development', SUPABASE_SERVICE_ROLE_KEY: 'dummy', LIVEKIT_API_KEY: 'devkey', LIVEKIT_API_SECRET: 'secret' },
  stdio: 'ignore',
});
procs.push(api);
const API = `http://127.0.0.1:${apiPort}`;

// ── The token mint: tickets.mjs handleToken, with a fixed admin ──────────────
const tokPort = await freePort();
const ADMIN = { id: 'a1b2c3d4e5f6a7b8', email: 'mw@mike-wolf.com' };
const minted = [];
servers.push(http.createServer(async (req, res) => {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const u = new URL(req.url, 'http://x');
  // A ticket stands in for the admin here (its redemption has its own selftest).
  const signedIn = req.headers.authorization || req.headers['x-frontrow-ticket'];
  const out = await T.handleToken({ query: Object.fromEntries(u.searchParams), authorization: signedIn ? 'Bearer admin' : null }, {
    AccessToken, TrackSource, livekitKey: 'devkey', livekitSecret: 'secret', mode: 'stage',
    getUser: async () => ADMIN, isAdmin: async () => true,
  });
  const body = out.body;
  if (body?.identity) minted.push(body.identity);
  res.writeHead(out.status || 200, { ...cors, 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}).listen(tokPort, '127.0.0.1'));
const TOKEN_URL = `http://127.0.0.1:${tokPort}/token`;

// ── The site, built for this stack ───────────────────────────────────────────
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-two-cams-'));
try {
  execFileSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir'], {
    cwd: path.join(ROOT, 'front-row-vite'), stdio: 'ignore',
    env: { ...process.env, VITE_BACKEND_URL: API, VITE_LIVEKIT_URL: LK_URL, VITE_TOKEN_URL: TOKEN_URL, VITE_ENABLE_TEST_MODE: 'true' },
  });
} catch (e) { console.log('FAIL build', e.message); done(1); }
const sitePort = await freePort();
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.json': 'application/json', '.wasm': 'application/wasm' };
servers.push(http.createServer((req, res) => {
  let f = path.join(outDir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!f.startsWith(outDir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(outDir, 'index.html');
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(sitePort, '127.0.0.1'));
const SITE = `http://127.0.0.1:${sitePort}`;

if (!(await waitFor(async () => (await fetch(`${API}/health`)).ok))) { console.log('FAIL frontrow-server did not start'); done(1); }
await fetch(`${API}/api/debug-reset-show`, { method: 'POST' }).catch(() => undefined);

// ── Browsers ─────────────────────────────────────────────────────────────────
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? undefined : undefined),
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const STORAGE_KEY = 'sb-omfwcodoimjmbrhssvfl-auth-token';
const fakeJwt = () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: ADMIN.id, email: ADMIN.email, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })}.sig`;
};
async function context({ signedIn }) {
  const ctx = await browser.newContext({ permissions: ['camera', 'microphone'], viewport: { width: 1280, height: 800 } });
  await ctx.route('https://omfwcodoimjmbrhssvfl.supabase.co/**', (r) => {
    const p = new URL(r.request().url()).pathname;
    const h = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: h });
    if (p.startsWith('/auth/v1/')) return r.fulfill({ status: 200, headers: h, contentType: 'application/json', body: JSON.stringify({ id: ADMIN.id, email: ADMIN.email, aud: 'authenticated' }) });
    return r.fulfill({ status: 200, headers: h, contentType: 'application/json', body: '[]' });
  });
  await ctx.route('**/api/am-i-frontrow-admin', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ admin: signedIn }) }));
  await ctx.route('**/api/ticket-issue', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, tickets: [{ id: 't1', code: 'frt_' + 'S'.repeat(24), role: 'performer' }] }) }));
  if (signedIn) {
    await ctx.addInitScript(([key, token, id, email]) => {
      const now = Math.floor(Date.now() / 1000);
      localStorage.setItem(key, JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600,
        user: { id, email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } }));
    }, [STORAGE_KEY, fakeJwt(), ADMIN.id, ADMIN.email]);
  }
  return ctx;
}
const state = (page) => page.evaluate(() => window.__frontrow_state__ || null);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };

try {
  // The guest takes a seat.
  const guestCtx = await context({ signedIn: false });
  const guest = await guestCtx.newPage();
  await guest.goto(`${SITE}/show/jess-wayne`);
  await guest.getByTestId('fr-take-seat').click();
  await guest.getByTestId('fr-name').fill('Ruth');
  await guest.getByTestId('fr-get-ticket').click();
  await guest.getByTestId('fr-enter-lobby').click();
  await guest.getByTestId('fr-door-live').click();
  await guest.getByTestId('fr-hud').waitFor({ timeout: 30000 });
  await waitFor(() => guest.evaluate(() => !!window.__FRONTROW_SCENE__?.clickSeat), 20000);
  await guest.evaluate(() => window.__FRONTROW_SCENE__.clickSeat('seat-3'));
  check('the guest is seated', !!(await waitFor(async () => (await state(guest))?.selectedSeat === 'seat-3')));

  // The performer opens the green room and checks the camera (joins LiveKit).
  const perfCtx = await context({ signedIn: true });
  const perf = await perfCtx.newPage();
  await perf.goto(`${SITE}/show/jess-wayne/green-room`);
  await perf.getByTestId('fr-green-room').waitFor({ timeout: 30000 });
  await perf.getByTestId('fr-green-camera').click();
  check('the performer camera is up', !!(await waitFor(async () => (await state(perf))?.hasPerformerStream, 45000)));

  // The guest hears the performer.
  const audio = await waitFor(() => guest.evaluate(() => {
    const a = document.querySelector('[data-testid="performer-audio"]');
    const t = a?.srcObject?.getAudioTracks?.()[0];
    return a && t && t.readyState === 'live' && !a.muted && !a.paused ? true : null;
  }), 20000);
  check('the guest hears the performer: an unmuted <audio> plays the mic', !!audio);

  // The phone: a code from the green room, opened on another device.
  await perf.getByTestId('fr-stage-camera-make').click();
  const link = await perf.locator('[data-testid="fr-stage-camera-link"] .qr').getAttribute('data-link', { timeout: 10000 });
  check('the green room shows a stage-camera code with the ticket in the fragment', /\/show\/jess-wayne\/stage-camera\?theater=[a-z0-9-]+&screen=[a-z0-9-]+#ticket=frt_/.test(link || ''), link);
  await shot(perf, '1-green-room-code');
  const phoneCtx = await context({ signedIn: false });
  const phone = await phoneCtx.newPage();
  await phone.goto(link.replace(/^https?:\/\/[^/]+/, SITE));
  await phone.getByTestId('fr-stage-camera-start').click();
  check('the phone is on air', !!(await waitFor(async () => /On air/.test(await phone.getByTestId('fr-stage-camera-state').textContent()))));
  await shot(phone, '2-phone');
  check('the phone joined as its own identity, beside the laptop', minted.some((i) => /^performer-[a-z0-9]+-stage$/.test(i)) && minted.some((i) => /^performer-[a-z0-9]+$/.test(i)), minted.join(','));
  check('the green room sees the phone', !!(await waitFor(async () => (await state(perf))?.hasStageStream)));
  check('the laptop was not evicted', !!(await state(perf))?.hasPerformerStream);
  check('the guest gets the phone as the stage feed', !!(await waitFor(async () => (await state(guest))?.hasStageStream)));
  check('the guest still has the main camera with its sound', !!(await waitFor(async () => (await state(guest))?.performerStreamTracks === 2)));

  // Step onto the stage.
  await perf.getByTestId('fr-green-onstage').click();
  check('the guest sees the performer step onto the stage', !!(await waitFor(async () => (await state(guest))?.performerOnStage)));
  await guest.waitForTimeout(4000);
  await shot(guest, '3-guest-on-stage');

  // The performer looks out from the stage.
  const view = await waitFor(async () => {
    const s = await state(perf);
    if (s?.showState !== 'live' || s.currentView !== 'performer') return null;
    await perf.waitForTimeout(4500); // the camera swoop
    return perf.evaluate(() => { const c = window.__FRONTROW_SCENE__?.camera; return c ? { z: c.position.z, y: c.position.y, dz: c.getWorldDirection(new c.position.constructor()).z } : null; });
  }, 30000);
  check('the performer looks out from the stage at the house', !!view && view.z < -8 && view.dz > 0.5, JSON.stringify(view));
  await shot(perf, '4-performer-pov');
} catch (e) {
  console.log('FAIL', e.message);
  fail++;
}
await browser.close();
fs.rmSync(outDir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
done(fail ? 1 : 0);
