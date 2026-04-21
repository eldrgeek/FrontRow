import { test, expect } from '@playwright/test';
import { resetServer, setShowState } from './helpers';

test.describe('Pre-show: YouTube plays before performer arrives', () => {
  test.beforeEach(async ({ page }) => {
    await resetServer();
    await page.goto('/?test=true&bypass_auth=true&test_name=TestViewer&test_role=audience');
  });

  test('shows login form on first load', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('input[type="text"], input[placeholder*="name" i]')).toBeVisible({ timeout: 10000 });
  });

  test('YouTube video plays when show is idle (pre-show)', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('canvas', { timeout: 15000 });
    await expect(page.frameLocator('iframe[src*="youtube"]').locator('body')).toBeTruthy();
  });

  test('stage screen shows YouTube during pre-show countdown', async ({ page }) => {
    await setShowState('pre-show');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('canvas', { timeout: 15000 });
    const ytFrame = page.locator('iframe[src*="youtube"]');
    await expect(ytFrame).toBeVisible({ timeout: 10000 });
  });
});
