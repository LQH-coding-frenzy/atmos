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

test('shows selected-day hourly, sun, AQI, planner, and caller-scoped rule context', async ({
  page,
}) => {
  const accessToken = 'calendar-test-access-token';
  const user = {
    id: '00000000-0000-4000-8000-000000000071',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'calendar@example.test',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at: '2026-09-27T10:00:00.000Z',
  };
  let alertAuthorization = '';
  let aqiRequestCount = 0;
  const rule = {
    id: '00000000-0000-4000-8000-000000000072',
    location_id: 'berlin-de',
    latitude: 52.52,
    longitude: 13.405,
    conditions: [{ metric: 'temperature', comparison: 'above', value: 18 }],
    schedule: {
      weekdays: ['tuesday'],
      startsAt: '2026-08-31T00:00:00.000Z',
      endsAt: '2026-09-03T00:00:00.000Z',
      cooldownMinutes: 60,
    },
    notification_channels: ['in-app'],
    enabled: true,
    created_at: '2026-09-27T10:00:00.000Z',
    updated_at: '2026-09-27T10:00:00.000Z',
  };

  await page.route('**/auth/v1/token?grant_type=password', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'calendar-test-refresh-token',
        user,
      }),
    });
  });
  await page.route('**/api/v1/locations', async (route) => {
    await route.fulfill({ json: { locations: [], preferencesInitialized: true } });
  });
  await page.route('**/api/v1/me', async (route) => {
    await route.fulfill({
      json: {
        role: 'user',
        profile: {
          id: user.id,
          display_name: 'Calendar user',
          created_at: '2026-09-27T10:00:00.000Z',
          updated_at: '2026-09-27T10:00:00.000Z',
        },
        preferences: {
          units: 'metric',
          timezone: 'auto',
          theme: 'system',
          updated_at: '2026-09-27T10:00:00.000Z',
        },
      },
    });
  });
  await page.route('**/api/v1/alerts?**', async (route) => {
    alertAuthorization = route.request().headers().authorization ?? '';
    await route.fulfill({ json: { rules: [rule] } });
  });
  await page.route('**/api/public/v1/weather/air-quality', async (route) => {
    aqiRequestCount += 1;
    await route.fulfill({
      json: {
        observedAt: '2026-09-01T10:00:00.000Z',
        usAqi: 42,
        europeanAqi: 18,
        pollutants: {
          pm25: 7,
          pm10: 11,
          carbonMonoxide: 120,
          nitrogenDioxide: 4,
          sulphurDioxide: 1,
          ozone: 62,
        },
        timeline: {
          kind: 'model',
          requestedPastDays: 7,
          requestedForecastDays: 5,
          hours: [
            {
              time: '2026-09-01T12:00:00.000Z',
              usAqi: 55,
              europeanAqi: 20,
              pollutants: {
                pm25: 8,
                pm10: 11,
                carbonMonoxide: 120,
                nitrogenDioxide: 4,
                sulphurDioxide: 1,
                ozone: 62,
              },
            },
            {
              time: '2026-09-01T13:00:00.000Z',
              usAqi: 72,
              europeanAqi: 28,
              pollutants: {
                pm25: 12,
                pm10: 15,
                carbonMonoxide: 120,
                nitrogenDioxide: 5,
                sulphurDioxide: 1,
                ozone: 65,
              },
            },
          ],
        },
        meta: {
          provider: 'open-meteo',
          cached: false,
          stale: false,
          updatedAt: '2026-09-01T10:00:00.000Z',
        },
      },
    });
  });

  await page.goto('/');
  await openWeatherTool(page, 'Saved places');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill('safe-example-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(user.email, { exact: true })).toBeVisible();

  await openWeatherTool(page, 'Calendar');
  await expect(page.locator('.weather-calendar-days > button')).toHaveCount(16);
  await expect(page.locator('.weather-calendar-day')).toContainText('Tue, Sep 1');
  await expect(page.locator('.weather-calendar-day')).toContainText('Sunrise');
  await expect(page.locator('.weather-calendar-day')).toContainText('Sunset');
  await expect(page.locator('.weather-calendar-day')).toContainText('Hourly details');
  await expect(page.locator('.weather-calendar-day')).toContainText('Maximum U.S. AQI: 72');
  await expect(page.locator('.weather-calendar-day')).toContainText('Activity outlook');
  await expect(page.locator('.weather-calendar-day')).toContainText(/temperature above 18/i);
  expect(aqiRequestCount).toBe(1);
  expect(alertAuthorization).toBe(`Bearer ${accessToken}`);

  await page.locator('.weather-calendar-days > button').nth(1).click();
  await expect(page.locator('.weather-calendar-day')).toContainText('Wed, Sep 2');
  await expect(page.locator('.weather-calendar-day')).toContainText(
    'AQI model has no values for this date',
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.weather-calendar-panel')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});
