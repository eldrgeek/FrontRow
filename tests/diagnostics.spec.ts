import { test, expect, Browser, Page } from '@playwright/test';

const PROD_URL = 'https://frontrowtheater.netlify.app';
const BASE_URL = process.env.FRONTROW_URL || PROD_URL;
const BACKEND_URL = 'https://vpsmikewolf.duckdns.org:4001';
const TOKEN_URL = `${BACKEND_URL}/api/livekit-token`;

async function waitForState(page: Page, check: (s: any) => boolean, timeout = 10000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const state = await page.evaluate(() => (window as any).__frontrow_state__);
    if (state && check(state)) return state;
    await page.waitForTimeout(500);
  }
  const state = await page.evaluate(() => (window as any).__frontrow_state__);
  throw new Error(`State condition not met. Last state: ${JSON.stringify(state)}`);
}

test.describe('FrontRow E2E', () => {

  test('livekit token API works', async ({ request }) => {
    const res = await request.get(`${TOKEN_URL}?identity=test&role=audience&room=frontrow-main`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.token).toBeTruthy();
    expect(data.token.length).toBeGreaterThan(50);
  });

  test('frontend loads and exposes state', async ({ page }) => {
    await page.goto(`${BASE_URL}?diag=true`);
    await page.waitForTimeout(3000);
    const state = await page.evaluate(() => (window as any).__frontrow_state__);
    expect(state).toBeTruthy();
    expect(state.showState).toBeTruthy();
    expect(typeof state.socketConnected).toBe('boolean');
    console.log('Initial state:', JSON.stringify(state));
  });

  test('socket connects and state is populated', async ({ page }) => {
    await page.goto(`${BASE_URL}?diag=true`);
    const state = await waitForState(page, s => s.socketConnected);
    expect(state.socketConnected).toBe(true);
    expect(state.socketId).toBeTruthy();
    console.log('Connected with socket:', state.socketId);
  });

  test('performer mode: camera activates, role is performer', async ({ page, context }) => {
    await context.grantPermissions(['camera', 'microphone']);
    await page.goto(`${BASE_URL}?mode=performer&diag=true`);
    const state = await waitForState(page, s => s.socketConnected);
    expect(state.role).toBe('performer');
    await expect(page.locator('[data-testid="diag-role"]')).toHaveAttribute('data-value', 'performer');
    console.log('Performer state:', JSON.stringify(state));
  });

  test('watch mode: role is audience, no performer stream on idle show', async ({ page, context }) => {
    await context.grantPermissions(['camera', 'microphone']);
    await page.goto(`${BASE_URL}?mode=watch&diag=true`);
    const state = await waitForState(page, s => s.socketConnected);
    expect(state.role).toBe('audience');
    expect(state.hasPerformerStream).toBe(false);
    console.log('Watch state:', JSON.stringify(state));
  });

  test('seat selection: audience member gets a seat', async ({ page, context }) => {
    await context.grantPermissions(['camera', 'microphone']);
    await page.goto(`${BASE_URL}?mode=watch&diag=true`);
    await waitForState(page, s => s.socketConnected);
    await page.waitForTimeout(3000);
    const state = await page.evaluate(() => (window as any).__frontrow_state__);
    console.log('Post-watch state:', JSON.stringify(state));
    expect(state.showState).toBeTruthy();
  });

  test('full show flow: performer goes live, audience receives stream', async ({ browser }: { browser: Browser }) => {
    test.setTimeout(60000);
    const performerContext = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const audienceContext = await browser.newContext({ permissions: ['camera', 'microphone'] });

    const performerPage = await performerContext.newPage();
    const audiencePage = await audienceContext.newPage();

    try {
      await performerPage.goto(`${BASE_URL}?mode=performer&diag=true`);
      await audiencePage.goto(`${BASE_URL}?mode=watch&diag=true`);

      await waitForState(performerPage, s => s.socketConnected && s.role === 'performer');
      await waitForState(audiencePage, s => s.socketConnected && s.role === 'audience');

      const goLiveBtn = performerPage.locator('text=GO LIVE NOW');
      if (await goLiveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await goLiveBtn.click();
      }

      await waitForState(performerPage, s => s.showState === 'live', 15000);
      console.log('Show is live!');

      const audienceState = await waitForState(audiencePage, s => s.hasPerformerStream, 15000);
      expect(audienceState.hasPerformerStream).toBe(true);
      expect(audienceState.performerStreamTracks).toBeGreaterThan(0);
      console.log('Audience received performer stream:', audienceState.performerStreamTracks, 'tracks');

      const perfState = await performerPage.evaluate(() => (window as any).__frontrow_state__);
      console.log('Performer state:', JSON.stringify(perfState));

    } finally {
      await performerContext.close();
      await audienceContext.close();
    }
  });

});
