import { test, expect } from '@playwright/test';

const BASE_URL = process.env.FRONTROW_URL || 'https://frontrowtheater.netlify.app';
const BACKEND_URL = 'https://vpsmikewolf.duckdns.org:4001';

test.describe('FrontRow Diagnostics', () => {

  test('backend health check', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/health`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.status).toBe('healthy');
    console.log('Backend health:', JSON.stringify(data));
  });

  test('backend diagnostics endpoint', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/api/diagnostics`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('show');
    expect(data).toHaveProperty('seats');
    expect(data).toHaveProperty('connections');
    console.log('Diagnostics:', JSON.stringify(data, null, 2));
  });

  test('livekit token endpoint - audience', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/api/livekit-token?identity=test-audience&role=audience&room=frontrow-main`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('token');
    expect(typeof data.token).toBe('string');
    expect(data.token.length).toBeGreaterThan(20);
    console.log('Audience token length:', data.token.length);
  });

  test('livekit token endpoint - performer', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/api/livekit-token?identity=test-performer&role=performer&room=frontrow-main`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('token');
    console.log('Performer token length:', data.token.length);
  });

  test('frontend loads without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.goto(`${BASE_URL}?diag=true`);
    await page.waitForTimeout(3000);
    const badErrors = errors.filter(e => !e.includes('favicon') && !e.includes('ResizeObserver'));
    console.log('Console errors:', badErrors);
    expect(badErrors.length).toBe(0);
  });

  test('performer mode fast onboarding', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
      if (msg.text().includes('🎭') || msg.text().includes('LiveKit')) console.log('[BROWSER]', msg.text());
    });
    await page.goto(`${BASE_URL}?mode=performer&diag=true`);
    await page.waitForTimeout(5000);

    const diagPanel = page.locator('text=PERFORMER');
    await expect(diagPanel).toBeVisible({ timeout: 5000 });

    const badErrors = errors.filter(e => !e.includes('favicon') && !e.includes('ResizeObserver') && !e.includes('camera'));
    console.log('Performer mode errors:', badErrors);
  });

  test('watch mode fast onboarding - connects to idle show', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
    await page.goto(`${BASE_URL}?mode=watch&diag=true`);
    await page.waitForTimeout(4000);

    const diagPanel = page.locator('text=AUDIENCE');
    await expect(diagPanel).toBeVisible({ timeout: 5000 });

    const diagRes = await page.request.get(`${BACKEND_URL}/api/diagnostics`);
    const diagData = await diagRes.json();
    console.log('Connections after watch join:', diagData.connections.total);

    const livekitLogs = logs.filter(l => l.includes('LiveKit'));
    console.log('LiveKit logs:', livekitLogs);
  });

  test('seat selection flow', async ({ page }) => {
    const logs: string[] = [];
    page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));

    await page.request.post(`${BACKEND_URL}/api/debug-reset-show`);

    await page.goto(`${BASE_URL}?mode=watch&diag=true`);
    await page.waitForTimeout(3000);

    let diagRes = await page.request.get(`${BACKEND_URL}/api/diagnostics`);
    let diagData = await diagRes.json();
    console.log('Before seat select - seats:', diagData.seats.length);

    const canvas = page.locator('canvas');
    await canvas.click({ position: { x: 400, y: 300 } });
    await page.waitForTimeout(2000);

    diagRes = await page.request.get(`${BACKEND_URL}/api/diagnostics`);
    diagData = await diagRes.json();
    console.log('After seat click - seats:', diagData.seats.length, JSON.stringify(diagData.seats));

    const seatSelectLogs = logs.filter(l => l.includes('seat') || l.includes('Seat'));
    console.log('Seat logs:', seatSelectLogs);
  });

  test('full show flow: performer goes live, audience receives stream', async ({ browser }) => {
    const performerContext = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const audienceContext = await browser.newContext();

    const performerPage = await performerContext.newPage();
    const audiencePage = await audienceContext.newPage();

    const perfLogs: string[] = [];
    const audLogs: string[] = [];
    performerPage.on('console', msg => perfLogs.push(`[${msg.type()}] ${msg.text()}`));
    audiencePage.on('console', msg => audLogs.push(`[${msg.type()}] ${msg.text()}`));

    await performerPage.request.post(`${BACKEND_URL}/api/debug-reset-show`);

    await audiencePage.goto(`${BASE_URL}?mode=watch&diag=true`);
    await audiencePage.waitForTimeout(2000);

    await performerPage.goto(`${BASE_URL}?mode=performer&diag=true`);
    await performerPage.waitForTimeout(3000);

    const goLiveBtn = performerPage.locator('text=GO LIVE NOW');
    if (await goLiveBtn.isVisible()) {
      await goLiveBtn.click();
      await performerPage.waitForTimeout(3000);
    }

    const diagRes = await performerPage.request.get(`${BACKEND_URL}/api/diagnostics`);
    const diagData = await diagRes.json();
    console.log('Show state after GO LIVE:', diagData.show.status);
    console.log('Total connections:', diagData.connections.total);

    const lkPerfLogs = perfLogs.filter(l => l.includes('LiveKit') || l.includes('🎭'));
    const lkAudLogs = audLogs.filter(l => l.includes('LiveKit') || l.includes('🎬'));
    console.log('Performer LiveKit logs:', lkPerfLogs);
    console.log('Audience LiveKit logs:', lkAudLogs);

    const audDiag = audiencePage.locator('text=✅ PerformerStream');
    const hasStream = await audDiag.isVisible().catch(() => false);
    console.log('Audience has performer stream:', hasStream);

    await performerContext.close();
    await audienceContext.close();
  });

});
