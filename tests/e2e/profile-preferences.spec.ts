import { expect, test, type Page } from '@playwright/test';

async function openWeatherTool(page: Page, name: string) {
  const dialog = page.getByRole('dialog', { name: 'Weather tools' });
  if (!(await dialog.isVisible())) {
    await page.getByRole('button', { name: 'Open weather tools' }).click();
  }
  const summary = dialog.locator('.tool-list > details > summary').getByText(name, { exact: true });
  const panel = summary.locator('..');
  if ((await panel.getAttribute('open')) === null) await summary.click();
}

test('loads and saves account profile and display preferences with the caller JWT', async ({
  page,
}) => {
  const accessToken = 'profile-test-access-token';
  const user = {
    id: '00000000-0000-4000-8000-000000000010',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'weather@example.test',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at: '2026-09-27T10:00:00.000Z',
  };
  let account = {
    role: 'user' as 'owner' | 'user',
    profile: {
      id: user.id,
      display_name: 'Atmos user',
      created_at: '2026-09-27T10:00:00.000Z',
      updated_at: '2026-09-27T10:00:00.000Z',
    },
    preferences: {
      units: 'imperial',
      timezone: 'auto',
      theme: 'light',
      updated_at: '2026-09-27T10:00:00.000Z',
    },
  };
  let updateAuthorization = '';
  let updatePayload: Record<string, unknown> | undefined;

  await page.route('**/auth/v1/token?grant_type=password', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'profile-test-refresh-token',
        user,
      }),
    });
  });
  await page.route('**/api/v1/locations', async (route) => {
    await route.fulfill({ json: { locations: [], preferencesInitialized: true } });
  });
  await page.route('**/api/v1/me', async (route) => {
    if (route.request().method() === 'PATCH') {
      updateAuthorization = route.request().headers().authorization ?? '';
      updatePayload = route.request().postDataJSON() as Record<string, unknown>;
      const body = updatePayload;
      account = {
        role: account.role,
        profile: {
          ...account.profile,
          display_name: String(body.display_name),
          updated_at: '2026-09-27T10:05:00.000Z',
        },
        preferences: {
          ...account.preferences,
          units: String(body.units),
          timezone: String(body.timezone),
          theme: String(body.theme),
          updated_at: '2026-09-27T10:05:00.000Z',
        },
      };
    }
    await route.fulfill({ json: account });
  });

  await page.goto('/');
  await openWeatherTool(page, 'Saved places');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill('safe-example-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText(user.email, { exact: true })).toBeVisible();
  await openWeatherTool(page, 'Settings');
  await expect(page.getByLabel('Display name')).toHaveValue('Atmos user');
  await expect(page.getByText('Account role: User')).toBeVisible();
  await expect(
    page.locator('.preferences-panel').getByRole('button', { name: 'Fahrenheit' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.getByLabel('Display name').fill('Weather user');
  await page.getByLabel('Display timezone').fill('Pacific/Pago_Pago');
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.locator('.preferences-panel').getByRole('button', { name: 'Celsius' }).click();
  await page.getByRole('button', { name: 'Save account settings' }).click();

  await expect(
    page.getByRole('status').filter({ hasText: 'Account settings saved.' }),
  ).toBeVisible();
  await expect(page.locator('.dashboard-intro p')).toHaveText('Monday, August 31');
  expect(updateAuthorization).toBe(`Bearer ${accessToken}`);
  expect(updatePayload).toEqual({
    display_name: 'Weather user',
    units: 'metric',
    theme: 'dark',
    timezone: 'Pacific/Pago_Pago',
  });

  await page.reload();
  await openWeatherTool(page, 'Settings');
  await expect(page.getByLabel('Display name')).toHaveValue('Weather user');
  await expect(page.getByLabel('Display timezone')).toHaveValue('Pacific/Pago_Pago');
  await expect(page.locator('.dashboard-intro p')).toHaveText('Monday, August 31');
  await expect(
    page.locator('.preferences-panel').getByRole('button', { name: 'Celsius' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  account.role = 'owner';
  await page.reload();
  await openWeatherTool(page, 'Settings');
  await expect(page.getByText('Account role: Owner')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('Display timezone')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});
