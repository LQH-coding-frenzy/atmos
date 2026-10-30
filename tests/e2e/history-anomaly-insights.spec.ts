import { expect, test } from '@playwright/test';

function snapshot(id: number, observedAt: string, index: number) {
  return {
    id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    latitude: 52.52,
    longitude: 13.405,
    observed_at: observedAt,
    provider: 'open-meteo',
    payload: {
      location_name: 'Berlin',
      temperature_c: 18 + (index % 3),
      apparent_temperature_c: 17 + (index % 3),
      humidity_percent: 54 + (index % 3),
      wind_speed_kph: 9 + (index % 3),
      pressure_hpa: 1009 + (index % 3),
      condition: index === 0 ? 'rain' : 'clear',
    },
    created_at: observedAt,
  };
}

test('requires baseline coverage and labels deterministic anomalies from recorded observations', async ({
  page,
}, testInfo) => {
  const now = Date.now();
  const user = {
    id: '00000000-0000-4000-8000-000000000010',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'history@example.test',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at: '2026-09-01T00:00:00.000Z',
  };
  const accessToken = 'history-anomaly-e2e-token';
  const hoursAgo = [1, 12, 25, 36, 49, 60, 73, 96, 120, 144, 168, 180];
  const snapshots = hoursAgo.map((hours, index) =>
    snapshot(index + 1, new Date(now - hours * 60 * 60 * 1000).toISOString(), index),
  );
  let useStaleCurrentWeather = false;

  await page.route('**/auth/v1/token?grant_type=password', async (route) => {
    await route.fulfill({
      json: {
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'history-anomaly-refresh-token',
        user,
      },
    });
  });
  await page.route('**/api/v1/locations', async (route) => {
    await route.fulfill({ json: { locations: [], preferencesInitialized: true } });
  });
  await page.route('**/api/public/v1/weather/dashboard', async (route) => {
    await route.fulfill({
      json: {
        location: {
          id: 'berlin-de',
          name: 'Berlin',
          country: 'Germany',
          latitude: 52.52,
          longitude: 13.405,
          timezone: 'Europe/Berlin',
        },
        current: {
          observedAt: new Date(now).toISOString(),
          temperatureC: 32,
          apparentTemperatureC: 31,
          humidityPercent: 90,
          windSpeedKph: 50,
          pressureHpa: 1040,
          condition: 'thunderstorm',
        },
        hourly: [
          {
            time: new Date(now + 60 * 60 * 1000).toISOString(),
            temperatureC: 32,
            precipitationProbability: 80,
            condition: 'thunderstorm',
          },
        ],
        daily: [
          {
            date: '2026-10-18',
            highC: 34,
            lowC: 20,
            precipitationProbability: 80,
            condition: 'thunderstorm',
          },
        ],
        meta: {
          provider: 'open-meteo',
          cached: false,
          stale: useStaleCurrentWeather,
          updatedAt: useStaleCurrentWeather
            ? new Date(now - 4 * 60 * 60 * 1000).toISOString()
            : new Date(now).toISOString(),
        },
      },
    });
  });
  await page.route('**/api/v1/weather/history**', async (route) => {
    const days = Number(new URL(route.request().url()).searchParams.get('days'));
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    await route.fulfill({
      json: { snapshots: snapshots.filter((item) => Date.parse(item.observed_at) >= since) },
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Refresh weather' }).click();
  await expect(page.locator('.location-name')).toHaveText('Berlin');
  await page.getByRole('button', { name: 'Open weather tools' }).click();
  const tools = page.getByRole('dialog', { name: 'Weather tools' });
  const savedSummary = tools
    .locator('.tool-list > details > summary')
    .filter({ hasText: 'Saved places' });
  await savedSummary.click();
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill('safe-example-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(user.email, { exact: true })).toBeVisible();

  const historySummary = tools
    .locator('.tool-list > details > summary')
    .filter({ hasText: 'History' });
  await historySummary.click();
  const anomalyPanel = page.getByRole('region', { name: 'Recorded baseline anomaly insights' });
  await expect(anomalyPanel).toContainText('Baseline: mean of 12 recorded observations');
  await expect(anomalyPanel).toContainText('Temperature');
  await expect(anomalyPanel).toContainText('Pressure');
  await expect(anomalyPanel).toContainText('Wind');
  await expect(anomalyPanel).toContainText('Unusual thunderstorm condition');
  await expect(anomalyPanel).toContainText('0 of 12 recorded condition snapshots');
  await expect(anomalyPanel).toContainText('Rainfall amount, AQI and UV baselines are unavailable');
  if (!process.env.CI) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await anomalyPanel.screenshot({ path: testInfo.outputPath('history-anomalies-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await anomalyPanel.screenshot({ path: testInfo.outputPath('history-anomalies-mobile.png') });
  }
  await page.setViewportSize({ width: 320, height: 740 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);

  useStaleCurrentWeather = true;
  await page.getByRole('button', { name: 'Close weather tools' }).click();
  await page.getByRole('button', { name: 'Refresh weather' }).click();
  await page.getByRole('button', { name: 'Open weather tools' }).click();
  if ((await historySummary.locator('..').getAttribute('open')) === null) {
    await historySummary.click();
  }
  await expect(anomalyPanel).toContainText(
    'Current weather is stale. Anomaly comparisons are paused.',
  );
});
