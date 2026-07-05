#!/usr/bin/env node
/**
 * run-demo-show.js — Self-running FrontRow show orchestrator
 *
 * Boots local dev servers, opens 4 Playwright browser windows
 * (House Manager, Performer, Audience×2), and drives a full show timeline.
 *
 * Usage:
 *   node run-demo-show.js --live     # Watch the show, no recording
 *   node run-demo-show.js --record   # Record audience perspective + cutaways
 */

const { chromium } = require('playwright');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

// ── Config ──────────────────────────────────────────────────────────
const FRONTEND_PORT = 5176;
const BACKEND_PORT = 3001;
const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, '..'); // ~/Projects/frontrow or FrontRow
const FRONTROW_ROOT = '/Users/mikewolf/Projects/FrontRow';
const OUTPUT_DIR = path.resolve(__dirname, '..', 'video-production', 'output', 'v2', 'raw');
const VIEWPORT = { width: 1920, height: 1080 };

const args = process.argv.slice(2);
const MODE = args.includes('--record') ? 'record' : 'live';
const HEADLESS = false; // Always headed for WebGL

// ── Helpers ─────────────────────────────────────────────────────────
function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, res => {
          res.resume();
          resolve(res.statusCode);
        });
        req.on('error', reject);
        req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      return true;
    } catch {
      await sleep(500);
    }
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
}

async function testApi(endpoint, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BACKEND_URL);
    const data = JSON.stringify(body);
    const req = http.request(url, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
    }, res => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        try { resolve(JSON.parse(chunks)); }
        catch { resolve(chunks); }
      });
    });
    req.on('error', reject);
    if (body) req.write(data);
    req.end();
  });
}

async function waitForState(page, predicate, label, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const state = await page.evaluate(() => window.__frontrow_state__);
      if (state && predicate(state)) return state;
    } catch { /* page not ready */ }
    await sleep(300);
  }
  throw new Error(`Timeout waiting for: ${label}`);
}

// ── Server management ───────────────────────────────────────────────
let backendProcess = null;
let frontendProcess = null;

async function ensureServers() {
  // Check if frontend is already running on our port
  let frontendUp = false;
  try {
    await waitForServer(FRONTEND_URL, 2000);
    frontendUp = true;
    log(`Frontend already running on :${FRONTEND_PORT}`);
  } catch { /* need to start */ }

  // Check if backend is already running
  let backendUp = false;
  try {
    await waitForServer(`${BACKEND_URL}/health`, 2000);
    backendUp = true;
    log('Backend already running on :3001');
  } catch { /* need to start */ }

  if (!backendUp) {
    log('Starting backend with test endpoints...');
    backendProcess = spawn('node', ['index.js'], {
      cwd: path.join(FRONTROW_ROOT, 'server'),
      env: {
        ...process.env,
        NODE_ENV: 'development',
        ENABLE_TEST_ENDPOINTS: 'true',
        PORT: String(BACKEND_PORT),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    backendProcess.stdout.on('data', d => {
      const line = d.toString().trim();
      if (line) log(`[backend] ${line}`);
    });
    backendProcess.stderr.on('data', d => {
      const line = d.toString().trim();
      if (line) log(`[backend:err] ${line}`);
    });
    await waitForServer(`${BACKEND_URL}/health`, 15000);
    log('Backend started');
  }

  if (!frontendUp) {
    log('Starting frontend on :' + FRONTEND_PORT + '...');
    frontendProcess = spawn('npx', ['vite', '--port', String(FRONTEND_PORT)], {
      cwd: path.join(FRONTROW_ROOT, 'front-row-vite'),
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    frontendProcess.stdout.on('data', d => {
      const line = d.toString().trim();
      if (line) log(`[frontend] ${line}`);
    });
    frontendProcess.stderr.on('data', d => {
      const line = d.toString().trim();
      if (line) log(`[frontend:err] ${line}`);
    });
    await waitForServer(FRONTEND_URL, 20000);
    log('Frontend started');
  }

  // Reset server state
  await testApi('/api/test/reset', {});
  log('Server state reset');
}

function cleanupServers() {
  if (backendProcess) { backendProcess.kill(); log('Backend stopped'); }
  if (frontendProcess) { frontendProcess.kill(); log('Frontend stopped'); }
}

// ── Main orchestrator ───────────────────────────────────────────────
async function run() {
  log(`=== FrontRow Demo Show — mode: ${MODE} ===`);

  await ensureServers();

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: [
      '--use-gl=angle',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
  });

  // Create 4 isolated browser contexts
  const videoOpts = MODE === 'record' ? {
    recordVideo: { dir: OUTPUT_DIR, size: VIEWPORT },
  } : {};

  const hmContext = await browser.newContext({
    viewport: VIEWPORT,
    permissions: ['camera', 'microphone'],
    ...videoOpts,
  });
  const performerContext = await browser.newContext({
    viewport: VIEWPORT,
    permissions: ['camera', 'microphone'],
    ...videoOpts,
  });
  const aud1Context = await browser.newContext({
    viewport: VIEWPORT,
    permissions: ['camera', 'microphone'],
    ...videoOpts,
  });
  const aud2Context = await browser.newContext({
    viewport: VIEWPORT,
    permissions: ['camera', 'microphone'],
    ...videoOpts,
  });

  const hmPage = await hmContext.newPage();
  const performerPage = await performerContext.newPage();
  const aud1Page = await aud1Context.newPage();
  const aud2Page = await aud2Context.newPage();

  // Label pages for log clarity
  const pages = {
    hm: { page: hmPage, label: 'HouseManager' },
    performer: { page: performerPage, label: 'Performer' },
    aud1: { page: aud1Page, label: 'Audience-1' },
    aud2: { page: aud2Page, label: 'Audience-2' },
  };

  // Add console listeners (filter noise)
  for (const [key, { page, label }] of Object.entries(pages)) {
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      if (type === 'error' && !text.includes('Failed to load resource') && !text.includes('net::ERR') && !text.includes('LiveKit') && !text.includes('THREE.Color')) {
        log(`[${label}:error] ${text.slice(0, 200)}`);
      }
    });
    page.on('pageerror', err => {
      if (!err.message.includes('testid')) log(`[${label}:crash] ${err.message.slice(0, 200)}`);
    });
  }

  try {
    // ═══════════════════════════════════════════════════════════════
    // T=0  House Manager arrives, configures venue
    // ═══════════════════════════════════════════════════════════════
    log('T=0: House Manager arriving...');
    await hmPage.goto(`${FRONTEND_URL}/housemanager`, { waitUntil: 'domcontentloaded' });
    log('HM page loaded, waiting for panel...');
    await hmPage.waitForSelector('[data-testid="hm-panel"]', { timeout: 15000 });
    await sleep(1500);

    // Set seat count to 12
    log('T=2: HM setting seat count to 12...');
    await hmPage.evaluate(() => {
      const slider = document.querySelector('[data-testid="seat-count-slider"]');
      if (slider) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        nativeInputValueSetter.call(slider, '12');
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await sleep(500);

    // Set arrangement to semicircle
    log('T=3: HM setting arrangement to semicircle...');
    await hmPage.selectOption('[data-testid="arrangement-select"]', 'semicircle');
    await sleep(500);

    // Set show title
    log('T=4: HM typing show title...');
    const titleInput = hmPage.locator('[data-testid="show-title-input"]');
    await titleInput.click();
    await titleInput.fill('FrontRow Live Demo');
    await sleep(500);

    // Lock config
    log('T=5: HM locking configuration...');
    await hmPage.click('[data-testid="lock-config-btn"]');
    await sleep(1000);
    log('T=6: Venue configured and locked');

    // ═══════════════════════════════════════════════════════════════
    // T=10  Audiences arrive, take seats
    // ═══════════════════════════════════════════════════════════════
    log('T=10: Audiences arriving...');

    // Audience 1 — with name "Alex"
    await aud1Page.goto(`${FRONTEND_URL}/?mode=watch&name=Alex`);
    await sleep(2000);

    // Wait for socket connection
    await waitForState(aud1Page, s => s.socketConnected, 'Aud1 socket connected');
    log('T=12: Audience 1 (Alex) connected');

    // Audience 2 — with name "Jordan"
    await aud2Page.goto(`${FRONTEND_URL}/?mode=watch&name=Jordan`);
    await sleep(2000);
    await waitForState(aud2Page, s => s.socketConnected, 'Aud2 socket connected');
    log('T=14: Audience 2 (Jordan) connected');

    // Assign seats via test API
    const aud1SocketId = await aud1Page.evaluate(() => window.__frontrow_state__?.socketId);
    const aud2SocketId = await aud2Page.evaluate(() => window.__frontrow_state__?.socketId);

    // Generate proper test images for seat assignment
    const makeTestImage = async (page, name, color) => {
      return page.evaluate(([n, c]) => {
        const canvas = document.createElement('canvas');
        canvas.width = 100; canvas.height = 100;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = c;
        ctx.fillRect(0, 0, 100, 100);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(n[0], 50, 68);
        return canvas.toDataURL('image/png');
      }, [name, color]);
    };

    const aud1Image = await makeTestImage(aud1Page, 'Alex', '#4CAF50');
    const aud2Image = await makeTestImage(aud2Page, 'Jordan', '#2196F3');

    if (aud1SocketId) {
      await testApi('/api/test/seats/seat-3/assign', {
        socketId: aud1SocketId,
        userName: 'Alex',
        userImage: aud1Image,
        captureMode: 'photo',
      });
      log('T=15: Alex seated at seat-3');
    }

    await sleep(1500);

    if (aud2SocketId) {
      await testApi('/api/test/seats/seat-7/assign', {
        socketId: aud2SocketId,
        userName: 'Jordan',
        userImage: aud2Image,
        captureMode: 'photo',
      });
      log('T=16: Jordan seated at seat-7');
    }

    await sleep(2000);
    log('T=18: Audience seated, viewing closed curtain');

    // ═══════════════════════════════════════════════════════════════
    // T=20  Performer goes to backstage, prepares, goes live
    // ═══════════════════════════════════════════════════════════════
    log('T=20: Performer arriving at backstage...');
    await performerPage.goto(`${FRONTEND_URL}/backstage`);
    await performerPage.waitForSelector('[data-testid="go-live-btn"]', { timeout: 10000 });
    await sleep(1500);

    // Type performer name
    log('T=22: Performer entering name...');
    const nameInput = performerPage.locator('[data-testid="performer-name-input"]');
    await nameInput.click();
    await nameInput.type('Sam Rivera', { delay: 60 });
    await sleep(1000);

    // Start camera (for visual effect even if fake)
    log('T=23: Performer starting camera...');
    await performerPage.click('[data-testid="backstage-camera-btn"]');
    await sleep(2000);

    // Go Live
    log('T=25: Performer clicking Go Live...');
    await performerPage.click('[data-testid="go-live-btn"]');
    await sleep(1500);

    // Performer page navigates to /?mode=performer — wait for it
    await performerPage.waitForURL(/mode=performer/, { timeout: 10000 });
    log('T=27: Performer navigated to stage view');
    await sleep(2000);

    // The performer navigation triggers a show reset. Re-set the show to live.
    await testApi('/api/test/show/state', { status: 'live' });
    log('T=28: Show state set to live');
    await sleep(2000);

    // ═══════════════════════════════════════════════════════════════
    // T=30  HM opens curtain
    // ═══════════════════════════════════════════════════════════════
    log('T=30: HM opening curtains...');
    await hmPage.click('[data-testid="curtain-open-btn"]');
    await sleep(3000);
    log('T=33: Curtains open — audience can see the stage');

    // ═══════════════════════════════════════════════════════════════
    // T=35  Performer enters stage (server-side signal)
    // ═══════════════════════════════════════════════════════════════
    log('T=35: Performer entering stage...');
    await testApi('/api/test/simulate', {
      event: 'broadcast-message',
      data: {
        eventName: 'performer:onStage',
        payload: { onStage: true },
      },
    });
    await sleep(1000);

    // Set performer position to move from wings to center
    await testApi('/api/test/simulate', {
      event: 'broadcast-message',
      data: {
        eventName: 'performer:position',
        payload: { x: 0, z: -8 },
      },
    });
    await sleep(4000);
    log('T=39: Performer on stage at center');

    // ═══════════════════════════════════════════════════════════════
    // T=40  Audience #1 fires Applause reaction
    // ═══════════════════════════════════════════════════════════════
    log('T=40: Audience 1 (Alex) sending applause...');
    // Fire reaction via socket evaluate on aud1 page
    await aud1Page.evaluate(() => {
      // Find the socket in the page context and emit reaction
      const socket = window.__frontrow_state__?.socketId;
      if (socket) {
        // Use the broadcast-message test endpoint approach instead
        // Reactions should render on the stage via stage:reactionLevel
      }
    });
    // Use test API to broadcast reaction level
    await testApi('/api/test/simulate', {
      event: 'broadcast-message',
      data: {
        eventName: 'audience:reaction',
        payload: { type: 'clap', seatId: 'seat-3' },
      },
    });
    await testApi('/api/test/simulate', {
      event: 'broadcast-message',
      data: {
        eventName: 'stage:reactionLevel',
        payload: { level: 60 },
      },
    });
    await sleep(3000);
    log('T=43: Applause reaction rendered on stage');

    // ═══════════════════════════════════════════════════════════════
    // T=45  Audience #2 fires Cheer reaction
    // ═══════════════════════════════════════════════════════════════
    log('T=45: Audience 2 (Jordan) sending cheer...');
    await testApi('/api/test/simulate', {
      event: 'broadcast-message',
      data: {
        eventName: 'audience:reaction',
        payload: { type: 'wow', seatId: 'seat-7' },
      },
    });
    await testApi('/api/test/simulate', {
      event: 'broadcast-message',
      data: {
        eventName: 'stage:reactionLevel',
        payload: { level: 85 },
      },
    });
    await sleep(4000);
    log('T=49: Cheer reaction rendered, stage glowing');

    // ═══════════════════════════════════════════════════════════════
    // T=50  Performer takes a bow (spotlight toggle)
    // ═══════════════════════════════════════════════════════════════
    log('T=50: Performer taking a bow — spotlight on...');
    await testApi('/api/test/simulate', {
      event: 'broadcast-message',
      data: {
        eventName: 'performer:spotlight',
        payload: { active: true },
      },
    });
    await sleep(4000);

    // ═══════════════════════════════════════════════════════════════
    // T=55  HM closes curtain
    // ═══════════════════════════════════════════════════════════════
    log('T=55: HM closing curtains...');
    await hmPage.click('[data-testid="curtain-close-btn"]');
    await sleep(3000);
    log('T=58: Curtains closed');

    // ═══════════════════════════════════════════════════════════════
    // T=60  Show ends
    // ═══════════════════════════════════════════════════════════════
    log('T=60: Show ending...');
    await testApi('/api/test/show/state', { status: 'post-show' });
    await sleep(3000);
    log('T=63: Show complete!');

    // Hold for a beat so recordings capture the final state
    await sleep(2000);

  } finally {
    // Save recordings
    if (MODE === 'record') {
      log('Saving recordings...');

      const saveVideo = async (ctx, name) => {
        const pages = ctx.pages();
        if (pages.length > 0) {
          await pages[0].close();
          const videoPath = await pages[0].video()?.path();
          if (videoPath) {
            const dest = path.join(OUTPUT_DIR, `${name}.webm`);
            const mp4Dest = path.join(OUTPUT_DIR, `${name}.mp4`);
            // The video is saved when page closes
            await sleep(1000);
            if (fs.existsSync(videoPath)) {
              fs.copyFileSync(videoPath, dest);
              // Convert to MP4
              try {
                execSync(`ffmpeg -y -i "${dest}" -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p "${mp4Dest}"`, { stdio: 'pipe' });
                log(`Saved ${name}.mp4`);
                fs.unlinkSync(dest); // Remove webm
              } catch (e) {
                log(`Warning: ffmpeg conversion failed for ${name}: ${e.message}`);
              }
            }
          }
        }
      };

      // Close pages and save videos
      await saveVideo(aud1Context, 'audience-perspective');
      await saveVideo(aud2Context, 'audience-2');
      await saveVideo(hmContext, 'house-manager');
      await saveVideo(performerContext, 'performer');
    }

    // Close browser
    await browser.close();
    cleanupServers();
  }
}

run().then(() => {
  log('=== Show complete ===');
  process.exit(0);
}).catch(err => {
  console.error('Show failed:', err);
  cleanupServers();
  process.exit(1);
});
