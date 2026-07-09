import { test, expect } from '@playwright/test';

/**
 * Smoke test for the 3D theater render path.
 * Uses the App auth-bypass (?bypass_auth=true) on the catch-all /theater route,
 * which drops straight into the logged-in 3D scene. Verifies the Canvas actually
 * renders (real WebGL via Chromium/SwiftShader) rather than black-screening.
 */
test('theater renders the 3D scene without crashing', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto('/theater?bypass_auth=true&test_name=Mike&test_role=audience');

  // The scene canvas must appear.
  await page.waitForSelector('canvas', { timeout: 20000 });
  // Give R3F a moment to size + render a few frames.
  await page.waitForTimeout(4000);

  const state = await page.evaluate(() => {
    const c = document.querySelector('canvas') as HTMLCanvasElement | null;
    const rect = c?.getBoundingClientRect();
    const scene = (window as any).__FRONTROW_SCENE__;
    let objectCount = 0;
    let seatCount = 0;
    if (scene?.scene) {
      scene.scene.traverse((o: any) => {
        objectCount++;
        if (o.name && o.name.startsWith('seat-')) seatCount++;
      });
    }
    return {
      hasCanvas: !!c,
      canvasBuffer: c ? `${c.width}x${c.height}` : null,
      canvasDisplay: rect ? `${Math.round(rect.width)}x${Math.round(rect.height)}` : null,
      errorBoundaryShown: /couldn't load/i.test(document.body.innerText),
      sceneExposed: !!scene,
      objectCount,
      seatCount,
    };
  });

  console.log('THEATER STATE:', JSON.stringify(state, null, 2));
  console.log('CONSOLE ERRORS:', JSON.stringify(consoleErrors, null, 2));
  console.log('PAGE ERRORS:', JSON.stringify(pageErrors, null, 2));

  await page.screenshot({ path: 'test-results/theater-smoke.png', fullPage: false });

  // Assertions
  expect(state.hasCanvas, 'canvas should exist').toBe(true);
  expect(state.errorBoundaryShown, 'error boundary should NOT be shown').toBe(false);
  // The data-testid crash produced this exact message; it must be gone.
  const testidErr = [...consoleErrors, ...pageErrors].filter((e) => /testid/i.test(e));
  expect(testidErr, 'no "testid" errors').toEqual([]);
  // Canvas should be sized to the viewport, not stuck at the 300x150 default.
  expect(state.canvasDisplay, 'canvas should fill the viewport').not.toBe('300x150');
  // The scene should have real content (stage, seats, etc.).
  expect(state.objectCount, 'scene should contain objects').toBeGreaterThan(10);
});
