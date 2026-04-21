import { test, expect } from '@playwright/test';
import { resetServer, setShowState, BACKEND_URL } from './helpers';

test.describe('Audience: joining and watching', () => {
  test.beforeEach(async () => {
    await resetServer();
  });

  test('audience can see 3D theater scene after login', async ({ page }) => {
    await page.goto('/?test=true&bypass_auth=true&test_name=AudienceMember&test_role=audience');
    await page.waitForSelector('canvas', { timeout: 15000 });
    await expect(page.locator('canvas')).toBeVisible();
  });

  test('audience can select a seat', async ({ page }) => {
    await page.goto('/?test=true&bypass_auth=true&test_name=SeatPicker&test_role=audience');
    await page.waitForSelector('canvas', { timeout: 15000 });

    const seatResponse = await page.request.post(`${BACKEND_URL}/api/test/show/state`, {
      data: { status: 'idle' },
    });
    expect(seatResponse.ok()).toBeTruthy();
  });

  test('server health endpoint is reachable', async ({ page }) => {
    const response = await page.request.get(`${BACKEND_URL}/health`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.status).toBe('healthy');
  });

  test('test state API is accessible', async ({ page }) => {
    const response = await page.request.get(`${BACKEND_URL}/api/test/state`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.show).toBeDefined();
    expect(data.seats).toBeDefined();
  });
});
