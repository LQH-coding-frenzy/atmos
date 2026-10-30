import { expect, test } from '@playwright/test';

function dashboard(latitude: number, longitude: number, name: string, country: string) {
  return {
    location: {
      id: `${latitude}:${longitude}`,
      name,
      country,
      latitude,
      longitude,
      timezone: 'UTC',
    },
    current: {
      observedAt: '2026-10-01T12:00:00.000Z',
      temperatureC: 20,
      apparentTemperatureC: 19,
      humidityPercent: 60,
      windSpeedKph: 10,
      pressureHpa: 1012,
      condition: 'clear',
    },
    hourly: [
      {
        time: '2026-10-01T13:00:00.000Z',
        temperatureC: 21,
        precipitationProbability: 5,
        condition: 'clear',
      },
    ],
    daily: [
      { date: '2026-10-01', highC: 23, lowC: 15, precipitationProbability: 10, condition: 'clear' },
    ],
    meta: { provider: 'test', cached: false, stale: false, updatedAt: '2026-10-01T12:00:00.000Z' },
  };
}

test('uses recent selections locally, excludes device GPS, and supports direct coordinates', async ({
  context,
  page,
}) => {
  await context.grantPermissions(['geolocation'], { origin: 'http://127.0.0.1:3000' });
  await context.setGeolocation({ latitude: 1.2345, longitude: 2.3456 });
  const oslo = {
    id: 'oslo-no',
    name: 'Oslo',
    country: 'Norway',
    latitude: 59.9139,
    longitude: 10.7522,
    timezone: 'Europe/Oslo',
  };
  let geocodingRequests = 0;
  const dashboardRequests: Array<{ latitude: number; longitude: number }> = [];
  await page.route('**/api/v1/locations/search?**', async (route) => {
    geocodingRequests++;
    await route.fulfill({ json: { results: [oslo] } });
  });
  await page.route('**/api/public/v1/weather/dashboard', async (route) => {
    const request = route.request();
    const headers = request.headers();
    expect(headers['content-type']).toBe('application/json');
    expect(headers.origin).toBe(new URL(request.url()).origin);
    const input = request.postDataJSON();
    const latitude = Number(input.latitude),
      longitude = Number(input.longitude);
    dashboardRequests.push({ latitude, longitude });
    const location =
      latitude > 59 ? oslo : { latitude, longitude, name: 'Coordinates', country: 'Coordinates' };
    await route.fulfill({ json: dashboard(latitude, longitude, location.name, location.country) });
  });
  await page.goto('/');

  const input = page.getByRole('combobox', { name: 'Search for a city' });
  await input.fill('Oslo');
  await page.getByRole('button', { name: 'Search locations' }).click();
  await page.getByRole('option', { name: /Oslo/ }).click();
  await expect(page.locator('.location-name')).toHaveText('Oslo');
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('atmos.recent-searches.v1') ?? '[]').length,
      ),
    )
    .toBe(1);

  await input.fill('');
  await input.focus();
  const recents = page.getByRole('region', { name: 'Recent places' });
  await expect(recents.getByRole('button', { name: /Oslo/ })).toBeVisible();
  await recents.getByRole('button', { name: /Oslo/ }).click();
  await expect(page.locator('.location-name')).toHaveText('Oslo');
  expect(geocodingRequests).toBe(1);
  await input.fill('');
  await input.focus();
  await recents.getByRole('button', { name: 'Clear' }).click();
  await expect(page.getByRole('region', { name: 'Recent places' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Use my current location' }).click();
  await expect(page.locator('.location-name')).toHaveText('Your location');
  expect(await page.evaluate(() => localStorage.getItem('atmos.recent-searches.v1'))).toBeNull();

  await page.locator('.coordinate-search > summary').click();
  const requestsBeforeInvalidCoordinates = dashboardRequests.length;
  await page.getByLabel('Latitude').fill('91');
  await page.getByLabel('Longitude').fill('0');
  await page.getByRole('button', { name: 'Show weather' }).click();
  expect(
    await page
      .getByLabel('Latitude')
      .evaluate((element) => (element as HTMLInputElement).validity.rangeOverflow),
  ).toBe(true);
  expect(dashboardRequests).toHaveLength(requestsBeforeInvalidCoordinates);
  await page.getByLabel('Latitude').fill('40.7128');
  await page.getByLabel('Longitude').fill('-74.006');
  await page.getByRole('button', { name: 'Show weather' }).click();
  await expect(page.locator('.location-name')).toContainText('40.71');
  expect(dashboardRequests.at(-1)).toEqual({ latitude: 40.7128, longitude: -74.006 });
  expect(geocodingRequests).toBe(1);
  await page.getByRole('combobox', { name: 'Search for a city' }).fill('');
  await page.getByRole('combobox', { name: 'Search for a city' }).focus();
  await expect(
    page.getByRole('region', { name: 'Recent places' }).getByRole('button', { name: /40.71/ }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
