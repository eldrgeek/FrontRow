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

test.describe('The theater record', () => {
  // The theater as a record (src/theater/definition.ts, migrations/003).
  async function ticket(page: import('@playwright/test').Page, name = 'Rec Tester') {
    await page.goto('/show/jess-wayne');
    await page.getByTestId('fr-take-seat').click();
    await page.getByTestId('fr-name').fill(name);
    await page.getByTestId('fr-get-ticket').click();
    await expect(page).toHaveURL(/\/ticket$/);
  }

  test('a shelf screen opens by id, and an unknown one goes back to the lobby', async ({ page }) => {
    await ticket(page);
    await page.goto('/show/jess-wayne/shelf/library');
    await expect(page.getByTestId('fr-shelf-library')).toContainText('Jess Wayne Trio');
    await expect(page.getByTestId('fr-shelf-library')).toContainText('Right door');
    await page.goto('/show/jess-wayne/revolution');
    await expect(page.getByTestId('fr-shelf-revolution')).toContainText('Left door');
    await page.goto('/show/jess-wayne/shelf/no-such-screen');
    await expect(page).toHaveURL(/\/show\/jess-wayne\/lobby$/);
    // The live screen is not a shelf.
    await page.goto('/show/jess-wayne/shelf/live');
    await expect(page).toHaveURL(/\/show\/jess-wayne\/lobby$/);
  });

  test('a stored definition replaces the built-in one; a broken one is ignored', async ({ page }) => {
    let stored: unknown = null;
    await page.route(/\/rest\/v1\/venues\?/, (route) => {
      const url = route.request().url();
      const body = url.includes('super_venue_id=eq.')
        ? [{ id: 'c1', screen_key: 'library' }]
        : { id: 'a0000000-0000-4000-8000-000000000001', slug: 'front-row', screen_key: null, super_venue_id: null };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.route(/\/rest\/v1\/venue_settings\?/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ config: { definition: stored }, version: 4 }) }));

    const base = {
      schema: 1, slug: 'front-row', name: 'Front Row Theater', hostedBy: 'Noel Paul Stookey',
      theme: { palette: { wall: '#2a0812', marquee: '#12050a', marqueeText: '#fff4d2', accent: '#d4af37', seat: '#9b1529' }, curtain: 'velvet-red' },
      screens: [
        { id: 'live', kind: 'live', template: 'proscenium', order: 1, marquee: ['Live'], title: 'Live', blurb: '', seats: { count: 12, arrangement: 'semicircle' } },
        { id: 'library', kind: 'shelf', template: 'cabaret', order: 2, marquee: ['Stacks'], title: 'The Stacks', blurb: 'Renamed in the record.', shelf: [] },
      ],
    };

    stored = base;
    await ticket(page);
    await page.goto('/show/jess-wayne/library');
    await expect(page.getByTestId('fr-shelf-library')).toContainText('The Stacks');

    stored = { ...base, screens: 'not a list' };
    const settingsRead = page.waitForResponse(/\/rest\/v1\/venue_settings\?/);
    await page.goto('/show/jess-wayne/library');
    await settingsRead;
    await page.waitForTimeout(300);
    await expect(page.getByTestId('fr-shelf-library')).toContainText('The Performance Library');
  });
});
