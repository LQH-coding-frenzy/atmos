import { expect, test } from '@playwright/test';

function dateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftIsoDate(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10);
}

test('shows honest 24-hour/custom analytics for user-recorded history only', async ({
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
  const snapshots = [
    { hours: 1, condition: 'rain', temperature: 20, humidity: 70, wind: 15, pressure: 1012 },
    { hours: 20, condition: 'clear', temperature: 10, humidity: 55, wind: 5, pressure: 1008 },
    { hours: 24 * 6, condition: 'clear', temperature: 15, humidity: 60, wind: 8, pressure: 1010 },
    {
      hours: 24 * 20,
      condition: 'thunderstorm',
      temperature: 5,
      humidity: 82,
      wind: 30,
      pressure: 1000,
    },
    { hours: 24 * 80, condition: 'snow', temperature: -2, humidity: 75, wind: 20, pressure: 1004 },
  ].map((sample, index) => {
    const observedAt = new Date(now - sample.hours * 60 * 60 * 1000).toISOString();
    return {
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      latitude: 52.52,
      longitude: 13.405,
      observed_at: observedAt,
      provider: 'open-meteo',
      payload: {
        location_name: 'Berlin',
        temperature_c: sample.temperature,
        apparent_temperature_c: sample.temperature - 1,
        humidity_percent: sample.humidity,
        wind_speed_kph: sample.wind,
        pressure_hpa: sample.pressure,
        condition: sample.condition,
      },
      created_at: observedAt,
    };
  });
  const historyQueries: number[] = [];
  const accessToken = 'history-e2e-access-token';

  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/auth/v1/token?grant_type=password', async (route) => {
    await route.fulfill({
      json: {
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'history-e2e-refresh-token',
        user,
      },
    });
  });
  await page.route('**/api/v1/locations', async (route) => {
    await route.fulfill({ json: { locations: [], preferencesInitialized: true } });
  });
  await page.route('**/api/v1/weather/history**', async (route) => {
    historyQueries.push(Number(new URL(route.request().url()).searchParams.get('days')));
    const days = Number(new URL(route.request().url()).searchParams.get('days'));
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    await route.fulfill({
      json: {
        snapshots: snapshots.filter((snapshot) => Date.parse(snapshot.observed_at) >= since),
      },
    });
  });

  await page.goto('/');
  const tools = page.getByRole('dialog', { name: 'Weather tools' });
  await page.getByRole('button', { name: 'Open weather tools' }).click();
  const savedPlaces = tools
    .locator('.tool-list > details > summary')
    .filter({ hasText: 'Saved places' });
  await savedPlaces.click();
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill('safe-example-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(user.email, { exact: true })).toBeVisible();

  const historySummary = tools
    .locator('.tool-list > details > summary')
    .filter({ hasText: 'History' });
  await historySummary.click();
  const history = page.getByRole('region', { name: 'Weather history' });
  await expect(history).toBeVisible();
  await expect.poll(() => historyQueries.at(-1)).toBe(30);

  await page
    .getByRole('group', { name: 'History range' })
    .getByRole('button', { name: '24 hours' })
    .click();
  await expect.poll(() => historyQueries.at(-1)).toBe(7);
  const recordedList = page.getByRole('list', { name: 'Recorded observations' });
  await expect(recordedList.locator('li')).toHaveCount(2);
  await expect(recordedList).toContainText('rain');
  await expect(recordedList).toContainText('clear');
  await expect(history.locator('.weather-history-chart circle')).toHaveCount(2);
  await expect(history.locator('.weather-history-chart polyline')).toHaveCount(0);

  await history.getByLabel('History metric').selectOption('humidity');
  await expect(history.locator('.weather-history-summary')).toContainText('55%');
  await expect(history.locator('.weather-history-summary')).toContainText('62.5%');
  await expect(history.locator('.weather-history-summary')).toContainText('70%');
  await expect(history.getByRole('region', { name: 'Recorded condition counts' })).toContainText(
    'Snapshot counts, not event durations.',
  );

  if (!process.env.CI) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await history.screenshot({ path: testInfo.outputPath('weather-history-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await history.screenshot({ path: testInfo.outputPath('weather-history-mobile.png') });
  }

  const today = dateInTimeZone(new Date(), 'Europe/Berlin');
  await page
    .getByRole('group', { name: 'History range' })
    .getByRole('button', { name: 'Custom dates' })
    .click();
  await history.getByLabel('From date').fill(shiftIsoDate(today, -21));
  await history.getByLabel('To date').fill(shiftIsoDate(today, -19));
  await history.getByRole('button', { name: 'Apply dates' }).click();
  await expect.poll(() => historyQueries.at(-1)).toBe(30);
  await expect(recordedList.locator('li')).toHaveCount(1);
  await expect(recordedList).toContainText('thunderstorm');
  await expect(history.locator('.weather-history-condition-counts')).toContainText('thunderstorm');
  await expect(history.locator('.weather-history-condition-counts')).toContainText('1');
  await expect(history.locator('.weather-history-chart circle')).toHaveCount(1);
  await page.setViewportSize({ width: 320, height: 740 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
});
