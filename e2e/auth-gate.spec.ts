import { expect, test } from '@playwright/test';

test.describe('authentication and data gates', () => {
  test('offers email-or-username login and an optional recovery email at registration', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Welcome back/i })).toBeVisible();
    await expect(page.getByLabel('Email address or username')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await page.getByRole('button', { name: 'Create an account' }).click();
    const optionalEmail = page.getByLabel('Email address (optional)');
    await expect(optionalEmail).toBeVisible();
    await expect(optionalEmail).not.toHaveAttribute('required', '');
    await expect(page.getByText(/Leave blank for a username\/password account/i)).toBeVisible();
    await page.goto('/app');
    await expect(page.getByRole('heading', { name: /Welcome back/i })).toBeVisible();
    await expect(page.getByText('North Texas Scrimmage')).toHaveCount(0);
  });
});
