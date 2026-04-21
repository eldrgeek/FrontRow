# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: diagnostics.spec.ts >> FrontRow Diagnostics >> livekit token endpoint - audience
- Location: tests/diagnostics.spec.ts:26:7

# Error details

```
Error: expect(received).toBeTruthy()

Received: false
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | const BASE_URL = process.env.FRONTROW_URL || 'https://frontrowtheater.netlify.app';
  4   | const BACKEND_URL = 'https://vpsmikewolf.duckdns.org:4001';
  5   | 
  6   | test.describe('FrontRow Diagnostics', () => {
  7   | 
  8   |   test('backend health check', async ({ request }) => {
  9   |     const res = await request.get(`${BACKEND_URL}/health`);
  10  |     expect(res.ok()).toBeTruthy();
  11  |     const data = await res.json();
  12  |     expect(data.status).toBe('healthy');
  13  |     console.log('Backend health:', JSON.stringify(data));
  14  |   });
  15  | 
  16  |   test('backend diagnostics endpoint', async ({ request }) => {
  17  |     const res = await request.get(`${BACKEND_URL}/api/diagnostics`);
  18  |     expect(res.ok()).toBeTruthy();
  19  |     const data = await res.json();
  20  |     expect(data).toHaveProperty('show');
  21  |     expect(data).toHaveProperty('seats');
  22  |     expect(data).toHaveProperty('connections');
  23  |     console.log('Diagnostics:', JSON.stringify(data, null, 2));
  24  |   });
  25  | 
  26  |   test('livekit token endpoint - audience', async ({ request }) => {
  27  |     const res = await request.get(`${BACKEND_URL}/api/livekit-token?identity=test-audience&role=audience&room=frontrow-main`);
> 28  |     expect(res.ok()).toBeTruthy();
      |                      ^ Error: expect(received).toBeTruthy()
  29  |     const data = await res.json();
  30  |     expect(data).toHaveProperty('token');
  31  |     expect(typeof data.token).toBe('string');
  32  |     expect(data.token.length).toBeGreaterThan(20);
  33  |     console.log('Audience token length:', data.token.length);
  34  |   });
  35  | 
  36  |   test('livekit token endpoint - performer', async ({ request }) => {
  37  |     const res = await request.get(`${BACKEND_URL}/api/livekit-token?identity=test-performer&role=performer&room=frontrow-main`);
  38  |     expect(res.ok()).toBeTruthy();
  39  |     const data = await res.json();
  40  |     expect(data).toHaveProperty('token');
  41  |     console.log('Performer token length:', data.token.length);
  42  |   });
  43  | 
  44  |   test('frontend loads without errors', async ({ page }) => {
  45  |     const errors: string[] = [];
  46  |     page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  47  |     await page.goto(`${BASE_URL}?diag=true`);
  48  |     await page.waitForTimeout(3000);
  49  |     const badErrors = errors.filter(e => !e.includes('favicon') && !e.includes('ResizeObserver'));
  50  |     console.log('Console errors:', badErrors);
  51  |     expect(badErrors.length).toBe(0);
  52  |   });
  53  | 
  54  |   test('performer mode fast onboarding', async ({ page }) => {
  55  |     const errors: string[] = [];
  56  |     page.on('console', msg => {
  57  |       if (msg.type() === 'error') errors.push(msg.text());
  58  |       if (msg.text().includes('🎭') || msg.text().includes('LiveKit')) console.log('[BROWSER]', msg.text());
  59  |     });
  60  |     await page.goto(`${BASE_URL}?mode=performer&diag=true`);
  61  |     await page.waitForTimeout(5000);
  62  | 
  63  |     const diagPanel = page.locator('text=PERFORMER');
  64  |     await expect(diagPanel).toBeVisible({ timeout: 5000 });
  65  | 
  66  |     const badErrors = errors.filter(e => !e.includes('favicon') && !e.includes('ResizeObserver') && !e.includes('camera'));
  67  |     console.log('Performer mode errors:', badErrors);
  68  |   });
  69  | 
  70  |   test('watch mode fast onboarding - connects to idle show', async ({ page }) => {
  71  |     const logs: string[] = [];
  72  |     page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  73  |     await page.goto(`${BASE_URL}?mode=watch&diag=true`);
  74  |     await page.waitForTimeout(4000);
  75  | 
  76  |     const diagPanel = page.locator('text=AUDIENCE');
  77  |     await expect(diagPanel).toBeVisible({ timeout: 5000 });
  78  | 
  79  |     const diagRes = await page.request.get(`${BACKEND_URL}/api/diagnostics`);
  80  |     const diagData = await diagRes.json();
  81  |     console.log('Connections after watch join:', diagData.connections.total);
  82  | 
  83  |     const livekitLogs = logs.filter(l => l.includes('LiveKit'));
  84  |     console.log('LiveKit logs:', livekitLogs);
  85  |   });
  86  | 
  87  |   test('seat selection flow', async ({ page }) => {
  88  |     const logs: string[] = [];
  89  |     page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  90  | 
  91  |     await page.request.post(`${BACKEND_URL}/api/debug-reset-show`);
  92  | 
  93  |     await page.goto(`${BASE_URL}?mode=watch&diag=true`);
  94  |     await page.waitForTimeout(3000);
  95  | 
  96  |     let diagRes = await page.request.get(`${BACKEND_URL}/api/diagnostics`);
  97  |     let diagData = await diagRes.json();
  98  |     console.log('Before seat select - seats:', diagData.seats.length);
  99  | 
  100 |     const canvas = page.locator('canvas');
  101 |     await canvas.click({ position: { x: 400, y: 300 } });
  102 |     await page.waitForTimeout(2000);
  103 | 
  104 |     diagRes = await page.request.get(`${BACKEND_URL}/api/diagnostics`);
  105 |     diagData = await diagRes.json();
  106 |     console.log('After seat click - seats:', diagData.seats.length, JSON.stringify(diagData.seats));
  107 | 
  108 |     const seatSelectLogs = logs.filter(l => l.includes('seat') || l.includes('Seat'));
  109 |     console.log('Seat logs:', seatSelectLogs);
  110 |   });
  111 | 
  112 |   test('full show flow: performer goes live, audience receives stream', async ({ browser }) => {
  113 |     const performerContext = await browser.newContext({ permissions: ['camera', 'microphone'] });
  114 |     const audienceContext = await browser.newContext();
  115 | 
  116 |     const performerPage = await performerContext.newPage();
  117 |     const audiencePage = await audienceContext.newPage();
  118 | 
  119 |     const perfLogs: string[] = [];
  120 |     const audLogs: string[] = [];
  121 |     performerPage.on('console', msg => perfLogs.push(`[${msg.type()}] ${msg.text()}`));
  122 |     audiencePage.on('console', msg => audLogs.push(`[${msg.type()}] ${msg.text()}`));
  123 | 
  124 |     await performerPage.request.post(`${BACKEND_URL}/api/debug-reset-show`);
  125 | 
  126 |     await audiencePage.goto(`${BASE_URL}?mode=watch&diag=true`);
  127 |     await audiencePage.waitForTimeout(2000);
  128 | 
```