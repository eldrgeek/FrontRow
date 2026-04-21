import { Page } from '@playwright/test';

export async function bypassAuth(page: Page, role: 'audience' | 'performer' = 'audience', name = 'TestUser') {
  const url = new URL(page.url());
  url.searchParams.set('test', 'true');
  url.searchParams.set('bypass_auth', 'true');
  url.searchParams.set('test_name', name);
  url.searchParams.set('test_role', role);
  await page.goto(url.toString());
}

export async function waitForShowState(page: Page, state: string, timeout = 15000) {
  await page.waitForFunction(
    (expectedState) => {
      const el = document.querySelector('[data-testid="show-state"]');
      return el?.textContent === expectedState;
    },
    state,
    { timeout }
  );
}

export const BACKEND_URL = process.env.VITE_BACKEND_URL || 'https://frontrow-tvu6.onrender.com';

export async function resetServer() {
  const response = await fetch(`${BACKEND_URL}/api/test/reset`, { method: 'POST' });
  return response.json();
}

export async function setShowState(state: string, artistId?: string) {
  const response = await fetch(`${BACKEND_URL}/api/test/show/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: state, artistId }),
  });
  return response.json();
}
