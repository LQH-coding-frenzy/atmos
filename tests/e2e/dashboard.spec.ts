import { expect, test } from '@playwright/test';

test('renders the responsive mock-weather dashboard', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Tuesday, 1 September' })).toBeVisible();
  await expect(page.getByText('Berlin', { exact: true })).toBeVisible();
  await expect(page.getByText('Weather data: Open-Meteo.')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
});
