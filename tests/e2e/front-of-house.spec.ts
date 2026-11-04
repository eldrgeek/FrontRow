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

  test('an unknown show says so', async ({ page }) => {
    await page.goto('/show/no-such-show');
    await expect(page.getByText("That show isn't on the bill")).toBeVisible();
  });
});
