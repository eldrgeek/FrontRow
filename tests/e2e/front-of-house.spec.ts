import { test, expect } from '@playwright/test';

// The guest's path from the vision film: invitation → named ticket (no
// account) → lobby with three doors → a side door → the curtain into the house.
// Runs against FRONTROW_URL (a deploy preview or `vite preview`).

test.describe('Front of house', () => {
  test('invite, ticket with no account, lobby, doors, house', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('fr-invite')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Jess Wayne' })).toBeVisible();

    await page.getByTestId('fr-take-seat').click();
    await expect(page.getByTestId('fr-get-ticket')).toBeDisabled();
    await page.getByTestId('fr-name').fill('  Noel <b> ');
    await page.getByTestId('fr-get-ticket').click();

    await expect(page).toHaveURL(/\/show\/jess-wayne\/ticket$/);
    await expect(page.getByTestId('fr-ticket-name')).toHaveText('Noel b');

    await page.getByTestId('fr-enter-lobby').click();
    await expect(page.getByTestId('fr-lobby')).toBeVisible();
    for (const door of ['revolution', 'live', 'library']) {
      await expect(page.getByTestId(`fr-door-${door}`)).toBeVisible();
    }

    await page.getByTestId('fr-door-revolution').hover();
    await expect(page.getByTestId('fr-placard')).toContainText('Songs of the Revolution');

    await page.getByTestId('fr-door-library').click();
    await expect(page.getByTestId('fr-shelf-library')).toContainText('Jess Wayne Trio');
    await page.goBack();

    await page.getByTestId('fr-door-live').click();
    await expect(page).toHaveURL(/\/show\/jess-wayne\/house$/);
    await expect(page.getByTestId('fr-curtain-entry')).toBeAttached();
    // The house knows the ticket: no name form, a playbill with 12 seats.
    await expect(page.getByTestId('fr-hud')).toContainText('of 12 seated', { timeout: 20000 });
    await expect(page.getByTestId('fr-hud')).toContainText('Noel b');
    await expect(page.locator('.user-input-form')).toHaveCount(0);
  });

  test('the ticket survives a reload, and the house needs one', async ({ page }) => {
    await page.goto('/show/jess-wayne/house');
    await expect(page).toHaveURL(/\/show\/jess-wayne$/);

    await page.getByTestId('fr-take-seat').click();
    await page.getByTestId('fr-name').fill('Harold');
    await page.getByTestId('fr-get-ticket').click();
    await page.reload();
    await expect(page.getByTestId('fr-ticket-name')).toHaveText('Harold');

    await page.goto('/');
    await expect(page.getByTestId('fr-take-seat')).toHaveText('Welcome back, Harold');
  });

  test('the green room sends a guest with no sign-in to the sign-in page, and back', async ({ page }) => {
    await page.goto('/show/jess-wayne/green-room');
    await expect(page).toHaveURL(/\/login\?next=%2Fshow%2Fjess-wayne%2Fgreen-room$/);
  });

  test('an unknown show says so', async ({ page }) => {
    await page.goto('/show/no-such-show');
    await expect(page.getByText("That show isn't on the bill")).toBeVisible();
  });
});

// Needs a frontrow-server you may drive (its /api/artist-simulate-* routes):
// FRONTROW_API=http://localhost:3011 with a build pointed at it.
test.describe('The show', () => {
  const api = process.env.FRONTROW_API;
  test.skip(!api, 'set FRONTROW_API to a test frontrow-server');

  test('curtain up at Live, then the lights come up and the house can talk', async ({ page, request }) => {
    await request.post(`${api}/api/debug-reset-show`);
    await page.goto('/');
    await page.getByTestId('fr-take-seat').click();
    await page.getByTestId('fr-name').fill('Ruth');
    await page.getByTestId('fr-get-ticket').click();
    await page.getByTestId('fr-enter-lobby').click();
    await page.getByTestId('fr-door-live').click();
    await expect(page.getByTestId('fr-hud')).toContainText('of 12 seated', { timeout: 20000 });

    await request.post(`${api}/api/artist-simulate-live`);
    await expect(page.locator('iframe[title="YouTube Performance"]')).toHaveCount(1);
    await request.post(`${api}/api/artist-simulate-end`);

    await expect(page.getByTestId('fr-postshow')).toBeVisible();
    await page.getByTestId('fr-chat-input').fill('What a night <3');
    await page.getByTestId('fr-chat-send').click();
    await expect(page.getByTestId('fr-chat-lines')).toContainText('Ruth');
    await expect(page.getByTestId('fr-chat-lines')).toContainText('What a night <3');
  });
});
