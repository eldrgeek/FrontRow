import { test, expect } from '@playwright/test';
import { resetServer, setShowState, BACKEND_URL } from './helpers';

test.describe('Performer: going live', () => {
  test.beforeEach(async () => {
    await resetServer();
  });

  test('performer controls appear when logged in as artist', async ({ page }) => {
    await page.goto('/theater?test=true&bypass_auth=true&test_name=Performer&test_role=performer');
    await page.waitForSelector('canvas', { timeout: 15000 });
    await expect(page.locator('text=Artist Mode')).toBeVisible({ timeout: 10000 });
  });

  test('show state changes to pre-show when countdown starts', async ({ page }) => {
    await page.goto('/theater?test=true&bypass_auth=true&test_name=Performer&test_role=performer');
    await page.waitForSelector('canvas', { timeout: 15000 });

    // Re-assert inside the poll: other tests' sockets can disconnect mid-run and
    // reset the shared show to idle, so set-and-check each iteration until it sticks.
    await expect.poll(async () => {
      await setShowState('pre-show');
      const data = await (await page.request.get(`${BACKEND_URL}/health`)).json();
      return data.showStatus;
    }, { timeout: 8000 }).toMatch(/pre-show|live/);
  });

  test('show state changes to live', async ({ page }) => {
    await page.goto('/theater?test=true&bypass_auth=true&test_name=Performer&test_role=performer');
    await page.waitForSelector('canvas', { timeout: 15000 });

    await expect.poll(async () => {
      await setShowState('live', 'test-performer-id');
      const data = await (await page.request.get(`${BACKEND_URL}/health`)).json();
      return data.showStatus;
    }, { timeout: 8000 }).toBe('live');
  });
});
