import { test, expect } from '@playwright/test';
import { resetServer, setShowState } from './helpers';

test.describe('Pre-show: YouTube plays before performer arrives', () => {
  test.beforeEach(async ({ page }) => {
    await resetServer();
    await page.goto('/theater?test=true&bypass_auth=true&test_name=TestViewer&test_role=audience');
  });

  test('shows SOMA login when unauthenticated', async ({ page }) => {
    await page.goto('/');
    // After the SOMA-auth migration, an unauthenticated visit to '/' redirects
    // to the SOMA login page (email + Google), not the old theater name form.
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10000 });
  });

  test('YouTube video plays when show is idle (pre-show)', async ({ page }) => {
    await page.waitForSelector('canvas', { timeout: 15000 });
    const ytFrame = page.locator('iframe[src*="youtube"]');
    await expect(ytFrame).toBeVisible({ timeout: 10000 });
  });

  test('stage screen shows YouTube during pre-show countdown', async ({ page }) => {
    await setShowState('pre-show');
    await page.waitForSelector('canvas', { timeout: 15000 });
    const ytFrame = page.locator('iframe[src*="youtube"]');
    await expect(ytFrame).toBeVisible({ timeout: 10000 });
  });
});
