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

    await setShowState('pre-show');

    const response = await page.request.get(`${BACKEND_URL}/health`);
    const data = await response.json();
    expect(['pre-show', 'live']).toContain(data.showStatus);
  });

  test('show state changes to live', async ({ page }) => {
    await page.goto('/theater?test=true&bypass_auth=true&test_name=Performer&test_role=performer');
    await page.waitForSelector('canvas', { timeout: 15000 });

    await setShowState('live', 'test-performer-id');

    const response = await page.request.get(`${BACKEND_URL}/health`);
    const data = await response.json();
    expect(data.showStatus).toBe('live');
  });
});
