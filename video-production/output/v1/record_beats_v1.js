#!/usr/bin/env node
/**
 * record_beats_v1.js — Playwright screen recorder for FrontRow beats
 *
 * Captures 12 beats as video clips from the local dev server,
 * converts .webm → .mp4 via ffmpeg, and writes a RECORDING_NOTES.md.
 *
 * Usage:  node record_beats_v1.js
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const BASE_URL = 'http://localhost:5176';
const CLIPS_DIR = path.join(__dirname, 'clips');
const TMP_DIR = path.join(__dirname, '.tmp-video');
const VIEWPORT = { width: 1920, height: 1080 };

// ── Beat definitions ────────────────────────────────────────────────
const beats = [
  {
    id: 'beat_01', label: 'Cold Open: Empty Stage', durationMs: 8000,
    url: `${BASE_URL}/?mode=watch`,
    async interact(page, log) {
      await waitForRender(page);
      log('Showing 3D venue (empty stage)');
    },
  },
  {
    id: 'beat_02', label: 'House Manager', durationMs: 14000,
    url: `${BASE_URL}/housemanager`,
    async interact(page, log) {
      await page.waitForTimeout(2000);
      // Try typing into any visible input
      const input = await page.$('input[type="text"], input:not([type="hidden"])');
      if (input) {
        await input.click();
        await input.type('FrontRow Live', { delay: 80 });
        log('Typed "FrontRow Live" into input field');
      } else {
        log('No text input found — static capture');
      }
      // Try clicking a button
      const btn = await page.$('button');
      if (btn) {
        const btnText = await btn.textContent().catch(() => '(unknown)');
        await btn.click().catch(() => {});
        log(`Clicked button: "${btnText}"`);
      }
    },
  },
  {
    id: 'beat_03', label: 'Curtains / Audience View', durationMs: 6000,
    url: `${BASE_URL}/?mode=watch`,
    async interact(page, log) {
      await page.waitForTimeout(2000);
      log('Audience view captured');
    },
  },
  {
    id: 'beat_04', label: 'Audience Seats', durationMs: 10000,
    url: `${BASE_URL}/?mode=watch`,
    async interact(page, log) {
      await page.waitForTimeout(2000);
      log('Audience seats captured');
    },
  },
  {
    id: 'beat_05', label: 'Performer Backstage', durationMs: 12000,
    url: `${BASE_URL}/backstage`,
    async interact(page, log) {
      await page.waitForTimeout(2000);
      // Look for Go Live button
      const goLive = await page.$('button:has-text("Go Live"), button:has-text("go live"), button:has-text("Live")');
      if (goLive) {
        await goLive.click().catch(() => {});
        log('Clicked "Go Live" button');
      }
      // Look for toggle switches
      const toggle = await page.$('input[type="checkbox"], [role="switch"], .toggle');
      if (toggle) {
        await toggle.click().catch(() => {});
        log('Clicked toggle switch');
      }
      // Look for input fields
      const input = await page.$('input[type="text"]');
      if (input) {
        await input.click();
        await input.type('Test Performer', { delay: 60 });
        log('Typed into input field');
      }
      if (!goLive && !toggle && !input) {
        log('No interactive elements found — static capture');
      }
    },
  },
  {
    id: 'beat_07', label: 'Background Removal', durationMs: 10000,
    url: `${BASE_URL}/backstage`,
    async interact(page, log) {
      await page.waitForTimeout(2000);
      // Look for bg removal toggle
      const bgToggle = await page.$('[class*="background"], [class*="bg-remove"], button:has-text("Background"), input[type="checkbox"]');
      if (bgToggle) {
        await bgToggle.click().catch(() => {});
        log('Clicked background removal toggle');
      } else {
        log('No background removal toggle found — static capture');
      }
    },
  },
  {
    id: 'beat_08', label: 'Stage Entrance / Go Live', durationMs: 12000,
    url: `${BASE_URL}/?mode=watch`,
    async interact(page, log) {
      await page.waitForTimeout(3000);
      log('3D venue rendered — stage entrance captured');
    },
  },
  {
    id: 'beat_09', label: 'Spotlight', durationMs: 8000,
    url: `${BASE_URL}/?mode=watch`,
    async interact(page, log) {
      await waitForRender(page);
      log('Spotlight view captured');
    },
  },
  {
    id: 'beat_10', label: 'Audience Reactions', durationMs: 14000,
    url: `${BASE_URL}/?mode=watch`,
    async interact(page, log) {
      await page.waitForTimeout(2000);
      // Look for reaction buttons
      const reactionBtns = await page.$$('button.reaction, button[class*="reaction"], button[aria-label*="react"], button:has-text("👏"), button:has-text("❤️"), button:has-text("🔥"), button:has-text("😂")');
      if (reactionBtns.length > 0) {
        for (let i = 0; i < Math.min(reactionBtns.length, 4); i++) {
          await reactionBtns[i].click().catch(() => {});
          log(`Clicked reaction button ${i + 1}`);
          await page.waitForTimeout(1000);
        }
      } else {
        // Try any button that looks like a reaction
        const anyBtn = await page.$$('button');
        let clicked = 0;
        for (const btn of anyBtn) {
          const text = await btn.textContent().catch(() => '');
          if (/[👏❤️🔥😂🎉💯]/.test(text) || /react/i.test(text)) {
            await btn.click().catch(() => {});
            log(`Clicked reaction: "${text.trim()}"`);
            clicked++;
            await page.waitForTimeout(1000);
            if (clicked >= 4) break;
          }
        }
        if (clicked === 0) log('No reaction buttons found — static capture');
      }
    },
  },
  {
    id: 'beat_12', label: 'Walk Offstage', durationMs: 8000,
    url: `${BASE_URL}/?mode=watch`,
    async interact(page, log) {
      await waitForRender(page);
      log('Walk offstage captured');
    },
  },
  {
    id: 'beat_13', label: 'Curtains Close', durationMs: 8000,
    url: `${BASE_URL}/?mode=watch`,
    async interact(page, log) {
      await waitForRender(page);
      log('Curtains close captured');
    },
  },
  {
    id: 'beat_14', label: 'Call to Action / Landing', durationMs: 10000,
    url: `${BASE_URL}/`,
    async interact(page, log) {
      await waitForRender(page);
      log('Landing page captured');
    },
  },
];

// ── Helpers ──────────────────────────────────────────────────────────

/** Wait for whichever renders first: canvas, .venue-container, or body */
async function waitForRender(page) {
  try {
    await Promise.race([
      page.waitForSelector('canvas', { timeout: 8000 }),
      page.waitForSelector('.venue-container', { timeout: 8000 }),
      page.waitForSelector('body', { timeout: 3000 }),
    ]);
  } catch {
    // body is always there; swallow timeout
  }
  await page.waitForTimeout(2000);
}

/** Convert .webm to .mp4 with ffmpeg */
function convertToMp4(webmPath, mp4Path) {
  // Try with audio stream first; fall back to silent audio if no audio track
  const baseArgs = `-c:v libx264 -preset fast -crf 18 -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black" -c:a aac -b:a 128k -pix_fmt yuv420p`;

  try {
    // Probe for audio
    const probe = execSync(`ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${webmPath}" 2>&1`, { encoding: 'utf8' }).trim();
    if (probe.includes('audio')) {
      execSync(`ffmpeg -y -i "${webmPath}" ${baseArgs} "${mp4Path}"`, { stdio: 'pipe' });
    } else {
      throw new Error('no audio');
    }
  } catch {
    // No audio track — inject silent audio
    execSync(
      `ffmpeg -y -i "${webmPath}" -f lavfi -i "anullsrc=r=44100:cl=stereo" ${baseArgs} -shortest "${mp4Path}"`,
      { stdio: 'pipe' }
    );
  }
}

// ── Main ─────────────────────────────────────────────────────────────

(async () => {
  // Prepare dirs
  fs.mkdirSync(CLIPS_DIR, { recursive: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });

  const notes = [];        // lines for RECORDING_NOTES.md
  const results = [];      // summary objects

  console.log(`\n🎬  FrontRow Beat Recorder — ${beats.length} beats\n`);

  const browser = await chromium.launch({ headless: true });

  for (const beat of beats) {
    const beatLog = [];
    const log = (msg) => { beatLog.push(msg); console.log(`  [${beat.id}] ${msg}`); };

    console.log(`\n▶ ${beat.id} — ${beat.label} (${beat.durationMs / 1000}s)`);

    // Fresh context per beat with video recording
    const beatTmpDir = path.join(TMP_DIR, beat.id);
    fs.mkdirSync(beatTmpDir, { recursive: true });

    const context = await browser.newContext({
      viewport: VIEWPORT,
      recordVideo: { dir: beatTmpDir, size: VIEWPORT },
      // Grant camera/mic so backstage pages don't block on permissions
      permissions: ['camera', 'microphone'],
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    let success = false;
    try {
      // Navigate
      await page.goto(beat.url, { timeout: 15000, waitUntil: 'domcontentloaded' });
      log(`Loaded ${beat.url}`);

      // Run beat-specific interactions
      await beat.interact(page, log);

      // Record for remaining duration
      await page.waitForTimeout(beat.durationMs);
      success = true;
    } catch (err) {
      log(`ERROR: ${err.message}`);
      // Take screenshot as fallback
      const ssPath = path.join(CLIPS_DIR, `${beat.id}_fallback.png`);
      await page.screenshot({ path: ssPath }).catch(() => {});
      log(`Saved fallback screenshot`);
    }

    // Close context to flush video
    await page.close();
    await context.close();

    // Find the recorded .webm
    const webmFiles = fs.readdirSync(beatTmpDir).filter(f => f.endsWith('.webm'));
    const mp4Path = path.join(CLIPS_DIR, `${beat.id}.mp4`);

    if (webmFiles.length > 0) {
      const webmPath = path.join(beatTmpDir, webmFiles[0]);
      try {
        convertToMp4(webmPath, mp4Path);
        const stat = fs.statSync(mp4Path);
        log(`✓ ${beat.id}.mp4 (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
      } catch (err) {
        log(`ffmpeg conversion failed: ${err.message}`);
        success = false;
      }
    } else {
      log('No .webm file produced');
      success = false;

      // If we have a fallback screenshot, make a still-image clip
      const ssPath = path.join(CLIPS_DIR, `${beat.id}_fallback.png`);
      if (fs.existsSync(ssPath)) {
        try {
          const dur = beat.durationMs / 1000;
          execSync(
            `ffmpeg -y -loop 1 -i "${ssPath}" -f lavfi -i "anullsrc=r=44100:cl=stereo" -c:v libx264 -preset fast -crf 18 -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black" -c:a aac -b:a 128k -pix_fmt yuv420p -t ${dur} "${mp4Path}"`,
            { stdio: 'pipe' }
          );
          log(`Created still-image clip from screenshot (${dur}s)`);
        } catch (e) {
          log(`Still-image clip creation failed: ${e.message}`);
        }
      }
    }

    results.push({ id: beat.id, label: beat.label, success, interactions: beatLog });
    notes.push(`### ${beat.id} — ${beat.label}`, ...beatLog.map(l => `- ${l}`), '');
  }

  await browser.close();

  // Clean up tmp dir
  fs.rmSync(TMP_DIR, { recursive: true, force: true });

  // Write RECORDING_NOTES.md
  const notesContent = [
    '# FrontRow Beat Recording Notes',
    `_Generated: ${new Date().toISOString()}_`,
    '',
    `## Summary`,
    `- Total beats: ${results.length}`,
    `- Successful: ${results.filter(r => r.success).length}`,
    `- Failed/fallback: ${results.filter(r => !r.success).length}`,
    '',
    '## Beat Details',
    '',
    ...notes,
  ].join('\n');

  fs.writeFileSync(path.join(CLIPS_DIR, 'RECORDING_NOTES.md'), notesContent);

  // Final summary
  console.log('\n\n═══ RECORDING COMPLETE ═══');
  console.log(`Clips dir: ${CLIPS_DIR}`);
  for (const r of results) {
    const icon = r.success ? '✓' : '✗';
    console.log(`  ${icon} ${r.id} — ${r.label}`);
  }
  console.log(`\nNotes written to ${path.join(CLIPS_DIR, 'RECORDING_NOTES.md')}`);
})();
