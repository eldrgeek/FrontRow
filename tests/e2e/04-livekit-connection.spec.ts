import { test, expect } from '@playwright/test';

test.describe('LiveKit: token endpoint', () => {
  const BASE_URL = process.env.BASE_URL || 'https://frontrowtheater.netlify.app';

  test('token endpoint returns a valid JWT for audience', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/.netlify/functions/get-livekit-token?identity=TestUser&role=audience&room=frontrow-main`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.token).toBeDefined();
    expect(typeof data.token).toBe('string');
    expect(data.token.split('.').length).toBe(3);
  });

  test('token endpoint returns a valid JWT for performer', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/.netlify/functions/get-livekit-token?identity=Performer&role=performer&room=frontrow-main`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.token).toBeDefined();
    expect(data.token.split('.').length).toBe(3);
  });
});
