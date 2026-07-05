const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const CLIPS_DIR = path.join(__dirname, 'clips');

const beats = [
  { name: 'beat_01', url: 'https://frontrowtheater.netlify.app/?mode=watch', duration: 8 },
  { name: 'beat_02', url: 'https://frontrowtheater.netlify.app/housemanager', duration: 14 },
  { name: 'beat_03', url: 'https://frontrowtheater.netlify.app/?mode=watch', duration: 6 },
  { name: 'beat_04', url: 'https://frontrowtheater.netlify.app/?mode=watch', duration: 10 },
  { name: 'beat_05', url: 'https://frontrowtheater.netlify.app/backstage', duration: 12 },
  { name: 'beat_07', url: 'https://frontrowtheater.netlify.app/backstage', duration: 10 },
  { name: 'beat_08', url: 'https://frontrowtheater.netlify.app/?mode=watch', duration: 12 },
  { name: 'beat_09', url: 'https://frontrowtheater.netlify.app/?mode=watch', duration: 8 },
  { name: 'beat_10', url: 'https://frontrowtheater.netlify.app/?mode=watch', duration: 14 },
  { name: 'beat_12', url: 'https://frontrowtheater.netlify.app/?mode=watch', duration: 8 },
  { name: 'beat_13', url: 'https://frontrowtheater.netlify.app/?mode=watch', duration: 8 },
  { name: 'beat_14', url: 'https://frontrowtheater.netlify.app/', duration: 10 },
];

async function recordBeat(browser, beat) {
  const tempDir = path.join(__dirname, `temp_${beat.name}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const outMp4 = path.join(CLIPS_DIR, `${beat.name}.mp4`);

  console.log(`[${beat.name}] Starting — ${beat.url} for ${beat.duration}s`);

  let context;
  try {
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      recordVideo: {
        dir: tempDir,
        size: { width: 1920, height: 1080 },
      },
      // Grant camera/mic permissions so the app doesn't block on dialogs
      permissions: ['camera', 'microphone'],
      // Use fake media to avoid actual camera prompts
      ignoreHTTPSErrors: true,
    });

    const page = await context.newPage();

    try {
      await page.goto(beat.url, { waitUntil: 'networkidle', timeout: 30000 });
    } catch (e) {
      console.log(`[${beat.name}] Page load timeout/error, capturing whatever rendered: ${e.message}`);
    }

    // Wait for the specified duration to record
    await page.waitForTimeout(beat.duration * 1000);

    // Take a screenshot as fallback
    const screenshotPath = path.join(tempDir, 'screenshot.png');
    await page.screenshot({ path: screenshotPath });

    await page.close();
    await context.close();

    // Find the recorded video
    const files = fs.readdirSync(tempDir);
    const videoFile = files.find(f => f.endsWith('.webm'));

    if (videoFile) {
      const webmPath = path.join(tempDir, videoFile);
      console.log(`[${beat.name}] Converting ${videoFile} to mp4...`);
      try {
        execSync(
          `ffmpeg -y -i "${webmPath}" -c:v libx264 -preset fast -crf 18 ` +
          `-vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black" ` +
          `-c:a aac -b:a 128k -pix_fmt yuv420p "${outMp4}"`,
          { stdio: 'pipe' }
        );
        console.log(`[${beat.name}] OK -> ${outMp4}`);
      } catch (e) {
        console.log(`[${beat.name}] ffmpeg conversion failed: ${e.message}`);
        // Fallback: create from screenshot
        createFromScreenshot(screenshotPath, beat.duration, outMp4, beat.name);
      }
    } else {
      console.log(`[${beat.name}] No video file found, creating from screenshot`);
      createFromScreenshot(screenshotPath, beat.duration, outMp4, beat.name);
    }
  } catch (e) {
    console.log(`[${beat.name}] FAILED: ${e.message}`);
    // Try screenshot fallback if context was created
    const screenshotPath = path.join(tempDir, 'screenshot.png');
    if (fs.existsSync(screenshotPath)) {
      createFromScreenshot(screenshotPath, beat.duration, outMp4, beat.name);
    }
    if (context) {
      try { await context.close(); } catch (_) {}
    }
  }

  // Clean up temp dir
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_) {}
}

function createFromScreenshot(screenshotPath, duration, outMp4, beatName) {
  if (!fs.existsSync(screenshotPath)) {
    console.log(`[${beatName}] No screenshot available for fallback`);
    return;
  }
  try {
    execSync(
      `ffmpeg -y -loop 1 -i "${screenshotPath}" -c:v libx264 -t ${duration} ` +
      `-pix_fmt yuv420p -vf "scale=1920:1080" "${outMp4}"`,
      { stdio: 'pipe' }
    );
    console.log(`[${beatName}] Created from screenshot -> ${outMp4}`);
  } catch (e) {
    console.log(`[${beatName}] Screenshot fallback also failed: ${e.message}`);
  }
}

async function main() {
  fs.mkdirSync(CLIPS_DIR, { recursive: true });

  console.log(`Recording ${beats.length} beats...`);
  console.log(`Output: ${CLIPS_DIR}\n`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });

  for (const beat of beats) {
    await recordBeat(browser, beat);
  }

  await browser.close();

  // Summary
  console.log('\n=== Summary ===');
  for (const beat of beats) {
    const mp4 = path.join(CLIPS_DIR, `${beat.name}.mp4`);
    if (fs.existsSync(mp4)) {
      const stat = fs.statSync(mp4);
      console.log(`  ${beat.name}.mp4  ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
    } else {
      console.log(`  ${beat.name}.mp4  MISSING`);
    }
  }
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
