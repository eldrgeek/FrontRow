import { test, expect, Page } from '@playwright/test';

// The schedule (migrations/006): a stored performance replaces the compiled
// show of the same slug, a night that exists only in the database still opens,
// a cancelled or filed night says so, and a recording that is a file (not a
// YouTube video) plays on the shelf. Supabase is stubbed with page.route.
// Runs against FRONTROW_URL (a deploy preview or `vite preview`).

type Row = Record<string, unknown> | null;

async function stubPerformance(page: Page, rows: Record<string, Row>) {
  await page.route(/\/rest\/v1\/performances\?/, (route) => {
    const m = /[?&]slug=eq\.([a-z0-9-]+)/.exec(route.request().url());
    const row = m ? rows[m[1]] ?? null : null;
    return row
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(row) })
      : route.fulfill({ status: 406, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST116', message: 'no rows' }) });
  });
}

const row = (over: Record<string, unknown>) => ({
  slug: 'jess-wayne', title: 'Jess Wayne', artist: 'Jess Wayne', billing: {}, status: 'doors',
  starts_at: null, doors_at: null, seats: null, screen: { screen_key: 'live' }, theater: { slug: 'front-row' }, ...over,
});

test.describe('The schedule', () => {
  test('a stored performance replaces the compiled show of the same slug', async ({ page }) => {
    await stubPerformance(page, { 'jess-wayne': row({ artist: 'Jess Wayne and Friends', billing: { tagline: 'one night only' } }) });
    await page.goto('/show/jess-wayne');
    await expect(page.getByRole('heading', { name: 'Jess Wayne and Friends' })).toBeVisible();
    await expect(page.getByTestId('fr-invite')).toContainText('one night only');
    // Words the row leaves out still come from the compiled show.
    await expect(page.getByTestId('fr-invite')).toContainText('Twenty-minute set');
  });

  test('a night only in the database opens, and takes a ticket', async ({ page }) => {
    await stubPerformance(page, {
      'noel-friday': row({ slug: 'noel-friday', title: 'Noel on Friday', artist: 'Noel Paul Stookey', status: 'tickets-out',
        billing: { when: 'Friday · 8:00 pm', setLength: 'An hour of songs', invitedBy: 'Mike' } }),
    });
    await page.goto('/show/noel-friday');
    await expect(page.getByRole('heading', { name: 'Noel Paul Stookey' })).toBeVisible();
    await page.getByTestId('fr-take-seat').click();
    await page.getByTestId('fr-name').fill('Harold');
    await page.getByTestId('fr-get-ticket').click();
    await expect(page).toHaveURL(/\/show\/noel-friday\/ticket$/);
  });

  test('a cancelled night and a filed night say so and sell no seat', async ({ page }) => {
    await stubPerformance(page, {
      'jess-wayne': row({ status: 'cancelled' }),
      'last-week': row({ slug: 'last-week', title: 'Last week', artist: 'Jess Wayne', status: 'library' }),
    });
    await page.goto('/show/jess-wayne');
    await expect(page.getByTestId('fr-show-closed')).toContainText('cancelled');
    await expect(page.getByTestId('fr-take-seat')).toHaveCount(0);
    await page.goto('/show/last-week');
    await expect(page.getByTestId('fr-show-closed')).toContainText('Performance Library');
  });

  test('a show in neither place is not on the bill', async ({ page }) => {
    await stubPerformance(page, {});
    await page.goto('/show/nobody-tonight');
    await expect(page.getByText("That show isn't on the bill")).toBeVisible();
  });

  test('a recording that is a file plays on the shelf', async ({ page }) => {
    await stubPerformance(page, {});
    const def = {
      schema: 1, slug: 'front-row', name: 'Front Row Theater', hostedBy: 'Noel Paul Stookey',
      theme: { palette: { wall: '#2a0812', marquee: '#12050a', marqueeText: '#fff4d2', accent: '#d4af37', seat: '#9b1529' }, curtain: 'velvet-red' },
      screens: [
        { id: 'live', kind: 'live', template: 'proscenium', order: 1, marquee: ['Live'], title: 'Live', blurb: '', seats: { count: 12, arrangement: 'semicircle' } },
        { id: 'library', kind: 'shelf', template: 'cabaret', order: 2, marquee: ['Performance', 'Library'], title: 'The Performance Library', blurb: '',
          shelf: [{ title: 'Second set', artist: 'Jess Wayne', videoUrl: 'https://media.example.org/frt/second-set.mp4', performanceSlug: 'jess-wayne', note: 'Recorded November 6, 2026' }] },
      ],
    };
    await page.route(/\/rest\/v1\/venues\?/, (route) => {
      const url = route.request().url();
      const body = url.includes('super_venue_id=eq.')
        ? [{ id: 'c1', screen_key: 'library' }]
        : { id: 'a0000000-0000-4000-8000-000000000001', slug: 'front-row', screen_key: null, super_venue_id: null };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.route(/\/rest\/v1\/venue_settings\?/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ config: { definition: def }, version: 5 }) }));
    await page.route('https://media.example.org/**', (route) => route.fulfill({ status: 204 }));

    await page.goto('/show/jess-wayne');
    await page.getByTestId('fr-take-seat').click();
    await page.getByTestId('fr-name').fill('Neale');
    await page.getByTestId('fr-get-ticket').click();
    await page.goto('/show/jess-wayne/library');
    const shelf = page.getByTestId('fr-shelf-library');
    await expect(shelf).toContainText('Second set');
    await expect(shelf).toContainText('Recorded November 6, 2026');
    await page.getByRole('button', { name: 'Play Second set' }).click();
    await expect(shelf.locator('video')).toHaveAttribute('src', 'https://media.example.org/frt/second-set.mp4');
  });
});
