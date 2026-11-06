import { test, expect, Page } from '@playwright/test';

// The theater kit: lobby doors laid out from the theater definition, and the
// house reading its template and seat array. Sample theaters load with
// ?theater=<slug> on dev servers and deploy previews only (theater/blueprints.ts),
// and VITE_THEATER_SAMPLES=true builds, so this runs against FRONTROW_URL = one of
// those, not production.

async function withTicket(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      'frontrow_ticket_jess-wayne',
      JSON.stringify({ id: 'kit-test', name: 'Kit Tester', showSlug: 'jess-wayne', issuedAt: new Date().toISOString() }),
    );
  });
}

const doorIds = (page: Page) =>
  page.locator('[data-testid^="fr-door-"]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.testid!.slice(8)));

test.describe('Theater kit', () => {
  test.beforeEach(async ({ page }) => withTicket(page));

  test('Front Row: three doors in a row, live in the centre', async ({ page }) => {
    await page.goto('/show/jess-wayne/lobby?theater=front-row');
    await expect(page.getByTestId('fr-lobby')).toHaveAttribute('data-layout', 'row');
    expect(await doorIds(page)).toEqual(['revolution', 'live', 'library']);
    await expect(page.getByTestId('fr-placard')).toContainText('Centre door');
    await expect(page.getByTestId('fr-hallway-sign')).toHaveCount(0);
  });

  test('five screens stand on an arc', async ({ page }) => {
    await page.goto('/show/jess-wayne/lobby?theater=five-screens');
    await expect(page.getByTestId('fr-lobby')).toHaveAttribute('data-layout', 'arc');
    expect(await doorIds(page)).toEqual(['revolution', 'open-mic', 'live', 'workshop', 'library']);
    await expect(page.getByTestId('fr-placard')).toContainText('Door 3 of 5');
    // No sideways scroll on a phone.
    await page.setViewportSize({ width: 375, height: 760 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  });

  test('ten screens: five in the lobby, five down the hallway', async ({ page }) => {
    await page.goto('/show/jess-wayne/lobby?theater=ten-screens');
    await expect(page.getByTestId('fr-lobby')).toHaveAttribute('data-layout', 'hallway');
    expect(await doorIds(page)).toHaveLength(5);
    expect(await doorIds(page)).toContain('live');
    await page.getByTestId('fr-hallway-sign').click();
    await expect(page).toHaveURL(/\/show\/jess-wayne\/hallway/);
    expect(await doorIds(page)).toEqual(['kids', 'archive', 'lessons', 'poetry', 'jams']);
    await expect(page.getByTestId('fr-door-kids')).toContainText('Saturdays at 11');
    await page.getByTestId('fr-door-archive').click();
    await expect(page).toHaveURL(/\/show\/jess-wayne\/shelf\/archive$/);
  });

  test('the house reads the live screen\'s seat count', async ({ page }) => {
    await page.goto('/show/jess-wayne/house?theater=ten-screens');
    await expect(page.getByTestId('fr-hud')).toContainText('of 16 seated', { timeout: 20000 });
  });

  test('a palette recolors the lobby', async ({ page }) => {
    await page.goto('/show/jess-wayne/lobby?theater=black-box');
    const wall = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--t-wall').trim());
    expect(wall).toBe('#151515');
  });
});
