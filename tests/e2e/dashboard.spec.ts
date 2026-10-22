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

test('renders the responsive live-weather dashboard', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.location-name')).toHaveText('Berlin');
  await expect(page.getByText('Live weather data: Open-Meteo.')).toBeVisible();

  await page.getByRole('button', { name: 'Fahrenheit' }).click();
  await expect(page.getByRole('button', { name: 'Fahrenheit' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  const hero = await page.locator('.hero-temperature').boundingBox();
  expect(hero!.y + hero!.height).toBeLessThan(844);
  await page.getByRole('button', { name: 'Open weather tools' }).click();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.preferences-panel > summary')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close weather tools' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open weather tools' })).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});

test('keeps secondary current-condition metrics behind an accessible disclosure', async ({
  page,
}) => {
  await page.goto('/');
  const details = page.locator('.weather-extra-details');
  const summary = details.locator('summary');
  await expect(summary).toHaveText('More conditions');
  await expect(details).not.toHaveAttribute('open', '');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(details).toHaveAttribute('open', '');
  await expect(details).toContainText('Feels like');
  await expect(details).toContainText('Pressure');
});

test('shows expanded model measurements and a compatible extended outlook without refetching', async ({
  page,
}) => {
  let requests = 0;
  const extendedDaily = Array.from({ length: 16 }, (_, index) => ({
    date: `2026-09-${String(index + 1).padStart(2, '0')}`,
    highC: 23,
    lowC: 14,
    precipitationProbability: index < 10 ? 15 : null,
    condition: 'partly-cloudy',
    sunrise: `2026-09-${String(index + 1).padStart(2, '0')}T05:00:00.000Z`,
    sunset: `2026-09-${String(index + 1).padStart(2, '0')}T18:00:00.000Z`,
    daylightSeconds: 46800,
    precipitationMm: 25.4,
    rainMm: 25.4,
    snowfallCm: 0,
    uvIndexMax: 5,
    windSpeedMaxKph: 30,
    windGustMaxKph: 40,
  }));
  const response = {
    location: {
      id: 'berlin-de',
      name: 'Berlin',
      country: 'Germany',
      latitude: 52.52,
      longitude: 13.405,
      timezone: 'Europe/Berlin',
    },
    current: {
      observedAt: '2026-09-01T10:15:00.000Z',
      temperatureC: 20,
      apparentTemperatureC: 19,
      humidityPercent: 64,
      windSpeedKph: 13,
      pressureHpa: 1017,
      condition: 'partly-cloudy',
      windDirectionDegrees: 225,
      windGustKph: 32,
      cloudCoverPercent: 45,
      precipitationMm: 25.4,
      rainMm: 25.4,
      snowfallCm: 2.54,
      hourlyEstimates: { time: '2026-09-01T10:00:00.000Z', visibilityM: 1609.344, uvIndex: 3 },
    },
    hourly: [
      {
        time: '2026-09-01T11:00:00.000Z',
        temperatureC: 21,
        precipitationProbability: 15,
        condition: 'partly-cloudy',
        apparentTemperatureC: 20,
        humidityPercent: 60,
        windSpeedKph: 15,
        windGustKph: 30,
        windDirectionDegrees: 225,
        pressureHpa: 1017,
        cloudCoverPercent: 45,
        precipitationMm: 25.4,
        rainMm: 20,
        snowfallCm: 2.54,
        visibilityM: 10000,
        uvIndex: 4,
      },
    ],
    daily: extendedDaily.slice(0, 7),
    extendedDaily,
    meta: {
      provider: 'open-meteo',
      cached: false,
      stale: false,
      updatedAt: '2026-09-01T10:15:00.000Z',
    },
  };
  await page.route('**/api/v1/weather/dashboard?**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'x-atmos-version-key, cloudflare-workers-version-key',
        },
      });
      return;
    }
    await route.fulfill({ json: response, headers: { 'Access-Control-Allow-Origin': '*' } });
    requests++;
  });
  await page.addInitScript((snapshot) => {
    window.localStorage.setItem('atmos.offline.last-dashboard', JSON.stringify(snapshot));
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
  }, response);
  await page.goto('/');
  await page.getByRole('button', { name: 'Refresh weather' }).click();
  await expect(page.locator('.hero-temperature')).toContainText('20');
  const details = page.locator('.weather-extra-details');
  await details.locator('summary').click();
  await expect(details).toContainText('SW · 225°');
  await expect(details).toContainText('32 km/h');
  await expect(details).toContainText('13h 00m');
  await expect(details).toContainText('7:00 AM');
  await expect(details).toContainText('hourly model estimates for 12:00 PM');
  await page.getByRole('button', { name: 'Fahrenheit' }).click();
  await expect(details).toContainText('1 in');
  await expect(details).toContainText('1 mi');
  await expect(details).toContainText('66°F');
  await expect(page.locator('.forecast-row')).toHaveCount(7);
  const horizon = page.getByRole('group', { name: 'Forecast horizon' });
  await horizon.getByRole('button', { name: 'Up to 16 days' }).click();
  await expect(page.locator('.forecast-row')).toHaveCount(16);
  const lastDay = page.locator('.forecast-row').last();
  await expect(lastDay.getByLabel('Rain probability unavailable')).toBeVisible();
  await lastDay.click();
  const dailyDetails = page.getByRole('region', { name: /Daily forecast details/ });
  await expect(dailyDetails).toContainText('Unavailable');
  await expect(dailyDetails).toContainText('Total precipitation');
  await expect(dailyDetails).toContainText('1 in');
  await page.setViewportSize({ width: 320, height: 740 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
  await horizon.getByRole('button', { name: '7 days', exact: true }).click();
  await expect(page.locator('.forecast-row')).toHaveCount(7);
  expect(requests).toBe(1);
});

test('keeps older weather responses readable without inventing missing observations', async ({
  page,
}) => {
  await page.route('**/api/v1/weather/dashboard?**', async (route) =>
    route.fulfill({
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
          observedAt: '2026-09-01T10:00:00.000Z',
          temperatureC: 20,
          apparentTemperatureC: 19,
          humidityPercent: 64,
          windSpeedKph: 13,
          pressureHpa: 1017,
          condition: 'clear',
        },
        hourly: [
          {
            time: '2026-09-01T11:00:00.000Z',
            temperatureC: 21,
            precipitationProbability: 15,
            condition: 'clear',
          },
        ],
        daily: [
          {
            date: '2026-09-01',
            highC: 23,
            lowC: 14,
            precipitationProbability: 15,
            condition: 'clear',
          },
        ],
        meta: {
          provider: 'open-meteo',
          cached: false,
          stale: false,
          updatedAt: '2026-09-01T10:00:00.000Z',
        },
      },
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Refresh weather' }).click();
  await expect(page.locator('.hero-temperature')).toContainText('20');
  await page.locator('.weather-extra-details > summary').click();
  const visibility = page.locator('.weather-extra-details dt').filter({ hasText: /^Visibility$/ });
  await expect(visibility.locator('..')).toContainText('Unavailable');
  await expect(
    page
      .getByRole('group', { name: 'Forecast horizon' })
      .getByRole('button', { name: 'Up to 16 days' }),
  ).toBeDisabled();
});

test('expands hourly and daily forecast metadata with keyboard controls', async ({ page }) => {
  await page.goto('/');

  const firstHour = page.locator('.hourly-item').first();
  await firstHour.focus();
  await page.keyboard.press('Enter');
  await expect(firstHour).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('region', { name: /Hourly forecast details/ })).toContainText(
    'Precipitation chance',
  );

  const firstDay = page.locator('.forecast-row').first();
  await firstDay.focus();
  await page.keyboard.press('Space');
  await expect(firstDay).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('region', { name: /Daily forecast details/ })).toContainText(
    'High / low',
  );
  await expect(page.getByRole('region', { name: /Daily forecast details/ })).toContainText(
    'Precipitation chance',
  );
});

test('explains ranked activity windows with local start and end times', async ({ page }) => {
  await page.goto('/');
  const activityPicker = page.getByRole('combobox', { name: 'Activity profile' });
  await activityPicker.selectOption('cycling');

  const windows = page.getByRole('list', { name: 'Ranked cycling weather windows' });
  const firstWindow = windows.locator('li').first();
  await expect(firstWindow).toContainText('Best');
  await expect(firstWindow.locator('.planner-window-time')).toContainText('–');
  const details = firstWindow.locator('details');
  await details.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(details).toHaveAttribute('open', '');
  await expect(details.locator('.planner-factor').first()).toBeVisible();
});

test('explains empty search results and keeps the current city when a selection fails', async ({
  page,
}) => {
  const searchedLocation = {
    id: 'london-gb',
    name: 'London',
    country: 'United Kingdom',
    latitude: 51.5072,
    longitude: -0.1276,
    timezone: 'Europe/London',
  };
  let weatherRequests = 0;
  await page.route('**/api/v1/locations/search?**', async (route) => {
    const query = new URL(route.request().url()).searchParams.get('q');
    await route.fulfill({
      json: { results: query === 'Nowhere' ? [] : [searchedLocation] },
    });
  });
  await page.route('**/api/v1/weather/dashboard?**', async (route) => {
    weatherRequests += 1;
    await route.fulfill({ status: 503, json: { error: 'unavailable' } });
  });
  await page.goto('/');

  const search = page.getByRole('search');
  const query = search.getByLabel('Search for a city');
  await query.fill('Nowhere');
  await search.getByRole('button', { name: 'Search locations' }).click();
  await expect(page.locator('.location-search').getByRole('status')).toContainText(
    'No matching places',
  );

  await query.fill('London');
  await search.getByRole('button', { name: 'Search locations' }).click();
  await page
    .locator('.location-search')
    .getByRole('option', { name: /London/ })
    .click();
  await expect(page.locator('.location-search').getByRole('status')).toContainText(
    'Weather for London could not be loaded',
  );
  await expect(page.locator('.location-name')).toHaveText('Berlin');
  expect(weatherRequests).toBe(1);
});

test('debounces and caches keyboard-accessible city suggestions', async ({ page }) => {
  const london = {
    id: 'london-gb',
    name: 'London',
    country: 'United Kingdom',
    latitude: 51.5072,
    longitude: -0.1276,
    timezone: 'Europe/London',
  };
  let searchRequests = 0;
  let weatherRequests = 0;
  await page.route('**/api/v1/locations/search?**', async (route) => {
    searchRequests += 1;
    await route.fulfill({ json: { results: [london] } });
  });
  await page.route('**/api/v1/weather/dashboard?**', async (route) => {
    weatherRequests += 1;
    await route.fulfill({
      json: {
        location: london,
        current: {
          observedAt: '2026-09-01T10:00:00.000Z',
          temperatureC: 18,
          apparentTemperatureC: 17,
          humidityPercent: 70,
          windSpeedKph: 10,
          pressureHpa: 1012,
          condition: 'cloudy',
        },
        hourly: [
          {
            time: '2026-09-01T11:00:00.000Z',
            temperatureC: 18,
            precipitationProbability: 20,
            condition: 'cloudy',
          },
        ],
        daily: [
          {
            date: '2026-09-01',
            highC: 20,
            lowC: 14,
            precipitationProbability: 20,
            condition: 'cloudy',
          },
        ],
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
  const search = page.locator('.location-search');
  const input = search.getByRole('combobox', { name: 'Search for a city' });
  await input.fill('Lon');
  const listbox = search.getByRole('listbox', { name: 'Location search results' });
  await expect(listbox.getByRole('option', { name: /London/ })).toBeVisible();
  expect(searchRequests).toBe(1);
  await expect(input).toHaveAttribute('aria-expanded', 'true');

  await page.keyboard.press('Escape');
  await expect(listbox).toHaveCount(0);
  await input.fill('');
  await input.fill('Lon');
  await expect(listbox.getByRole('option', { name: /London/ })).toBeVisible();
  expect(searchRequests).toBe(1);

  await input.focus();
  await page.keyboard.press('ArrowDown');
  await expect(listbox.getByRole('option', { name: /London/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('Enter');
  await expect(page.locator('.location-name')).toHaveText('London');
  expect(weatherRequests).toBe(1);
});

test('persists unit and theme preferences on this device', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Fahrenheit' }).click();
  await openWeatherTool(page, 'Settings');
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await page.reload();

  await expect(page.getByRole('button', { name: 'Fahrenheit' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.goto('/user');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.goto('/privacy');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('keeps tools exclusive, traps focus, and dismisses the shared drawer accessibly', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open weather tools' }).click();
  const savedPlaces = page.locator('.saved-locations-panel');
  const history = page.locator('.weather-history-panel');
  const savedSummary = savedPlaces.locator('summary');
  const historySummary = history.locator('summary');

  await savedSummary.click();
  await expect(savedPlaces).toHaveAttribute('open', '');
  await historySummary.click();
  await expect(history).toHaveAttribute('open', '');
  await expect(savedPlaces).not.toHaveAttribute('open', '');

  await page.keyboard.press('Escape');
  await expect(history).not.toHaveAttribute('open', '');
  await expect(historySummary).toBeFocused();

  const settings = page.locator('.preferences-panel');
  await settings.locator('summary').click();
  await expect(settings).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(settings).not.toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Weather tools' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Open weather tools' })).toBeFocused();
  await page.getByRole('button', { name: 'Open weather tools' }).click();
  await page.mouse.click(5, 5);
  await expect(page.getByRole('dialog', { name: 'Weather tools' })).not.toBeVisible();
});

test('refreshes the selected city without changing its share URL and preserves it on failure', async ({
  page,
}) => {
  let weatherRequests = 0;
  await page.route('**/api/v1/weather/dashboard?**', async (route) => {
    weatherRequests += 1;
    if (weatherRequests > 1) {
      await route.fulfill({ status: 503, json: { error: 'unavailable' } });
      return;
    }
    await route.fulfill({
      json: {
        location: {
          id: 'paris',
          name: 'Paris',
          country: 'France',
          latitude: 48.8534,
          longitude: 2.3488,
          timezone: 'Europe/Paris',
        },
        current: {
          observedAt: '2026-09-01T10:00:00.000Z',
          temperatureC: 20,
          apparentTemperatureC: 19,
          humidityPercent: 64,
          windSpeedKph: 13,
          pressureHpa: 1017,
          condition: 'partly-cloudy',
        },
        hourly: [
          {
            time: '2026-09-01T10:00:00.000Z',
            temperatureC: 20,
            precipitationProbability: 5,
            condition: 'partly-cloudy',
          },
        ],
        daily: [
          {
            date: '2026-09-01',
            highC: 22,
            lowC: 15,
            precipitationProbability: 10,
            condition: 'partly-cloudy',
          },
        ],
        meta: {
          provider: 'open-meteo',
          cached: false,
          stale: false,
          updatedAt: '2026-09-01T10:00:00.000Z',
        },
      },
    });
  });
  await page.goto('/?lat=48.8534&lon=2.3488&timezone=Europe%2FParis&name=Paris&country=France');
  const selectedUrl = page.url();

  await page.getByRole('button', { name: 'Refresh weather' }).click();
  await expect(page.locator('.location-name')).toHaveText('Paris');
  await expect(page).toHaveURL(selectedUrl);

  await page.getByRole('button', { name: 'Refresh weather' }).click();
  await expect(page.locator('.location-status')).toContainText('Weather could not be refreshed');
  await expect(page.locator('.location-name')).toHaveText('Paris');
  await expect(page).toHaveURL(selectedUrl);
  expect(weatherRequests).toBe(2);
});

test('restores searched cities from browser Back and Forward history', async ({ page }) => {
  const paris = {
    id: 'paris-fr',
    name: 'Paris',
    country: 'France',
    latitude: 48.8534,
    longitude: 2.3488,
    timezone: 'Europe/Paris',
  };
  const potsdam = {
    id: 'potsdam-de',
    name: 'Potsdam',
    country: 'Germany',
    latitude: 52.401,
    longitude: 13.0593,
    timezone: 'Europe/Berlin',
  };
  let weatherRequests = 0;
  await page.route('**/api/v1/locations/search?**', async (route) => {
    const query = new URL(route.request().url()).searchParams.get('q');
    await route.fulfill({ json: { results: query === 'Paris' ? [paris] : [potsdam] } });
  });
  await page.route('**/api/v1/weather/dashboard?**', async (route) => {
    weatherRequests += 1;
    const query = new URL(route.request().url()).searchParams;
    const location = Number(query.get('lat')) < 50 ? paris : potsdam;
    await route.fulfill({
      json: {
        location,
        current: {
          observedAt: '2026-09-01T10:00:00.000Z',
          temperatureC: location === paris ? 20 : 16,
          apparentTemperatureC: 19,
          humidityPercent: 64,
          windSpeedKph: 13,
          pressureHpa: 1017,
          condition: 'partly-cloudy',
        },
        hourly: [
          {
            time: '2026-09-01T11:00:00.000Z',
            temperatureC: 20,
            precipitationProbability: 5,
            condition: 'partly-cloudy',
          },
        ],
        daily: [
          {
            date: '2026-09-01',
            highC: 22,
            lowC: 15,
            precipitationProbability: 10,
            condition: 'partly-cloudy',
          },
        ],
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
  const initialUrl = page.url();
  const search = page.locator('.location-search');
  const input = search.getByLabel('Search for a city');

  await input.fill('Paris');
  await search.getByRole('button', { name: 'Search locations' }).click();
  await page.locator('.location-search').getByRole('option', { name: /Paris/ }).click();
  await expect(page.locator('.location-name')).toHaveText('Paris');

  await input.fill('Potsdam');
  await search.getByRole('button', { name: 'Search locations' }).click();
  await page
    .locator('.location-search')
    .getByRole('option', { name: /Potsdam/ })
    .click();
  await expect(page.locator('.location-name')).toHaveText('Potsdam');

  await page.goBack();
  await expect(page).toHaveURL(/name=Paris/);
  await expect(page.locator('.location-name')).toHaveText('Paris');
  await page.goBack();
  await expect(page.locator('.location-name')).toHaveText('Berlin');
  await expect(page).toHaveURL(initialUrl);
  await page.goForward();
  await expect(page.locator('.location-name')).toHaveText('Paris');
  expect(weatherRequests).toBeGreaterThanOrEqual(5);
});

test('supports full map view, city previews, and the user management page', async ({ page }) => {
  let previewWeatherRequests = 0;
  const newestRadarFrame = Math.floor(Date.now() / 1000);
  const previousRadarFrame = newestRadarFrame - 600;
  const newestRadarPath = '/v2/radar/2160626c1c69';
  const previousRadarPath = '/v2/radar/9d080488b7e9';
  await page.route('**/styles/liberty', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        version: 8,
        sources: {},
        layers: [
          {
            id: 'test-background',
            type: 'background',
            paint: { 'background-color': '#dce9e8' },
          },
        ],
      },
    });
  });
  await page.route('**/api/v1/weather/radar/frames*', async (route) => {
    await route.fulfill({
      json: {
        generatedAt: newestRadarFrame,
        tileHost: 'https://tilecache.rainviewer.com',
        frames: [
          { timestamp: previousRadarFrame, path: previousRadarPath },
          { timestamp: newestRadarFrame, path: newestRadarPath },
        ],
      },
    });
  });
  await page.route('**/api/v1/weather/map/layers', async (route) => {
    await route.fulfill({ json: { openWeatherAvailable: true } });
  });
  await page.route('**/api/v1/weather/maps/openweather/**', async (route) => {
    await route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pL8AAAAASUVORK5CYII=',
        'base64',
      ),
    });
  });
  await page.route('https://tilecache.rainviewer.com/**', async (route) => {
    await route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pL8AAAAASUVORK5CYII=',
        'base64',
      ),
    });
  });
  await page.route('**/api/v1/weather/dashboard?**', async (route) => {
    previewWeatherRequests += 1;
    await route.continue();
  });
  await page.goto('/');

  const mapCard = page.locator('#map');
  const viewport = page.viewportSize();
  const requestsBeforeViewSwitch = previewWeatherRequests;
  await page.getByRole('link', { name: 'Open full map view' }).click();
  await expect(page).toHaveURL(/#map$/);
  await expect(mapCard).toHaveCSS('position', 'fixed');
  const fullMapBounds = await mapCard.boundingBox();
  expect(fullMapBounds?.width).toBeGreaterThanOrEqual((viewport?.width ?? 0) - 2);
  expect(fullMapBounds?.height).toBeGreaterThanOrEqual((viewport?.height ?? 0) - 2);
  await expect(page.locator('.map-inspector')).toBeVisible();
  await page.getByRole('button', { name: 'Trends', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Temperature, 7d weather chart' })).toBeVisible();
  await expect(page.locator('.current-card')).not.toBeVisible();
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await page.getByRole('combobox', { name: 'Activity profile' }).selectOption('cycling');
  await expect(page.getByRole('list', { name: 'Ranked cycling weather windows' })).toBeVisible();
  await page.getByRole('link', { name: 'Close full map view' }).click();
  await expect(page).toHaveURL(/#dashboard$/);
  await expect(mapCard).toHaveCSS('position', 'relative');
  expect(previewWeatherRequests).toBe(requestsBeforeViewSwitch);
  const mapWorkerAsset = await page
    .context()
    .request.get(new URL('/maplibre/maplibre-gl-worker.mjs', page.url()).toString());
  expect(mapWorkerAsset.ok()).toBe(true);

  const radarSlider = page.getByRole('slider', { name: 'Radar frame time' });
  await expect(radarSlider).toBeVisible();
  await page.getByRole('button', { name: 'Play radar animation' }).click();
  await expect(page.getByRole('button', { name: 'Pause radar animation' })).toBeVisible();
  const previousFrameTileRequest = page.waitForRequest((request) =>
    request.url().includes(`${previousRadarPath}/`),
  );
  await page.getByRole('button', { name: 'Next radar frame' }).click();
  await previousFrameTileRequest;
  const openWeatherTileRequest = page.waitForRequest((request) =>
    request.url().includes('/api/v1/weather/maps/openweather/precipitation_new/'),
  );
  await page.getByRole('combobox', { name: 'Weather map layer' }).selectOption('precipitation_new');
  await expect(page.getByText('OpenWeather · Precipitation · current snapshot')).toBeVisible();
  await openWeatherTileRequest;
  const weatherMapScale = page.getByRole('list', { name: 'Map color scale thresholds' });
  await expect(weatherMapScale).toContainText('0 mm');
  await expect(weatherMapScale).toContainText('0.1 mm');
  await expect(weatherMapScale).toContainText('140 mm');
  await page.getByRole('combobox', { name: 'Weather map layer' }).selectOption('cities');
  await expect(radarSlider).toBeHidden();

  const cityPicker = page.getByRole('combobox', { name: 'Browse cities visible on the map' });
  await expect(cityPicker).toBeVisible();
  await expect(cityPicker).toContainText('Berlin');
  const previewRequestsBeforeSelection = previewWeatherRequests;
  const berlinOption = cityPicker.locator('option').filter({ hasText: 'Berlin' });
  const berlinOptionValue = await berlinOption.getAttribute('value');
  expect(berlinOptionValue).not.toBeNull();
  await cityPicker.selectOption(berlinOptionValue!);

  await expect(page.getByRole('region', { name: 'Weather preview for Berlin' })).toBeVisible();
  await expect(page.locator('.location-name')).toHaveText('Berlin');
  expect(previewWeatherRequests).toBe(previewRequestsBeforeSelection);
  expect(mapWorkerAsset.ok()).toBe(true);
  await page.getByRole('button', { name: 'Open Berlin' }).click();
  await expect(page).toHaveURL(/lat=52.52/);
  await page.getByRole('link', { name: 'User management' }).click();
  await expect(page).toHaveURL(/\/user$/);
  await expect(page.getByRole('heading', { name: 'User management', level: 1 })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
});

test('publishes Google OAuth privacy and terms pages linked from the homepage', async ({
  page,
}) => {
  await page.goto('/');

  const homepageLegalLinks = page.getByRole('navigation', { name: 'Legal information' });
  await expect(homepageLegalLinks.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
    'href',
    '/privacy',
  );
  await expect(homepageLegalLinks.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
    'href',
    '/terms',
  );

  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy Policy', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Google sign-in' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'jach96443@gmail.com' })).toHaveAttribute(
    'href',
    'mailto:jach96443@gmail.com',
  );

  await page.goto('/terms');
  await expect(page.getByRole('heading', { name: 'Terms of Service', level: 1 })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Weather information is not safety advice' }),
  ).toBeVisible();
});

test('opens mobile Observatory directly with a viewport-anchored dock and a collapsible inspector', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#map');
  await expect(page.locator('.weather-app')).toHaveClass(/is-map-view/);
  await expect(page.getByRole('heading', { level: 1, name: 'Atmos Observatory' })).toHaveCount(1);
  const inspector = page.getByRole('button', { name: /Berlin.*Weather at a glance/ });
  await expect(inspector).toHaveAttribute('aria-expanded', 'false');
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  const dock = await navigation.boundingBox();
  expect(dock!.y).toBeGreaterThan(740);
  expect(dock!.y + dock!.height).toBeLessThanOrEqual(844);
  const zoom = page.getByRole('button', { name: 'Zoom in', exact: true });
  await expect(zoom).toBeVisible();
  const zoomBounds = await zoom.boundingBox();
  const radarBounds = await page
    .getByRole('region', { name: 'RainViewer radar playback' })
    .boundingBox();
  expect(zoomBounds!.y + zoomBounds!.height).toBeLessThan(radarBounds!.y);

  await inspector.click();
  await expect(page.locator('.current-card')).toBeVisible();
  await page
    .getByRole('group', { name: 'Map weather panel' })
    .getByRole('button', { name: '7 days', exact: true })
    .click();
  await expect(page.locator('.forecast-card')).toBeVisible();
  await expect(page.locator('.current-card')).not.toBeVisible();
  await openWeatherTool(page, 'Settings');
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.getByRole('button', { name: 'Close weather tools' }).click();
  await expect(page).toHaveURL('/#map');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.setViewportSize({ width: 320, height: 740 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL('/#dashboard');
  await expect(navigation.getByRole('link', { name: 'Map', exact: true })).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
  await page.setViewportSize({ width: 768, height: 1024 });
  await navigation.getByRole('link', { name: 'Map', exact: true }).click();
  await expect(page).toHaveURL('/#map');
  await navigation.getByRole('link', { name: 'Weather', exact: true }).click();
  await expect(page).toHaveURL('/#dashboard');
  await expect(page.locator('.hero-temperature')).toBeVisible();
});

test('compares a searched live city without switching until explicitly requested', async ({
  page,
}) => {
  const potsdam = {
    id: 'potsdam-de',
    name: 'Potsdam',
    country: 'Germany',
    latitude: 52.401,
    longitude: 13.0593,
    timezone: 'Europe/Berlin',
  };
  let weatherRequests = 0;
  await page.route('**/api/v1/locations/search?**', async (route) => {
    await route.fulfill({ json: { results: [potsdam] } });
  });
  await page.route('**/api/v1/weather/dashboard?**', async (route) => {
    weatherRequests += 1;
    const url = new URL(route.request().url());
    const latitude = Number(url.searchParams.get('lat'));
    const longitude = Number(url.searchParams.get('lon'));
    await route.fulfill({
      json: {
        location: { ...potsdam, latitude, longitude },
        current: {
          observedAt: '2026-09-01T10:00:00.000Z',
          temperatureC: 16,
          apparentTemperatureC: 15,
          humidityPercent: 58,
          windSpeedKph: 8,
          pressureHpa: 1015,
          condition: 'partly-cloudy',
        },
        hourly: [
          {
            time: '2026-09-01T11:00:00.000Z',
            temperatureC: 16,
            precipitationProbability: 12,
            condition: 'partly-cloudy',
          },
        ],
        daily: [
          {
            date: '2026-09-01',
            highC: 18,
            lowC: 11,
            precipitationProbability: 12,
            condition: 'partly-cloudy',
          },
        ],
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
  const dashboardUrl = page.url();

  await openWeatherTool(page, 'Compare cities');
  await page.getByLabel('Search for a city to compare').fill('Potsdam');
  await page.getByRole('button', { name: 'Search comparison cities' }).click();
  await page
    .getByRole('list', { name: 'Comparison city results' })
    .getByRole('button', { name: /Potsdam/ })
    .click();

  await expect(page.locator('.weather-comparison-city')).toHaveCount(2);
  await expect(page.locator('.weather-comparison-delta')).toHaveText(
    /Potsdam (is .+ than Berlin|and Berlin have the same temperature)\./,
  );
  await expect(page.locator('.location-name')).toHaveText('Berlin');
  await expect(page).toHaveURL(dashboardUrl);
  expect(weatherRequests).toBe(1);

  await page.getByRole('button', { name: 'Make Potsdam current' }).click();
  await expect(page.locator('.location-name')).toHaveText('Potsdam');
  await expect(page).toHaveURL(/lat=52.401/);
  await expect(page.locator('.weather-comparison-city')).toHaveCount(0);
  expect(weatherRequests).toBe(2);
});

test('loads attributed AQI estimates only after the user expands the panel', async ({ page }) => {
  let calls = 0;
  let requestedUrl = '';
  await page.route('**/api/v1/weather/air-quality?**', async (route) => {
    calls += 1;
    requestedUrl = route.request().url();
    await route.fulfill({
      json: {
        observedAt: '2026-09-27T10:00:00.000Z',
        usAqi: 42,
        europeanAqi: 18,
        pollutants: {
          pm25: 7.2,
          pm10: 12.4,
          carbonMonoxide: 120,
          nitrogenDioxide: 4.3,
          sulphurDioxide: 1.1,
          ozone: 65,
        },
        meta: {
          provider: 'open-meteo',
          cached: false,
          stale: false,
          updatedAt: '2026-09-27T10:02:00.000Z',
        },
      },
    });
  });
  await page.goto('/');

  expect(calls).toBe(0);
  await openWeatherTool(page, 'Air quality');

  await expect(page.locator('.aqi-index').nth(0)).toContainText('42');
  await expect(page.locator('.aqi-index').nth(0)).toContainText('Good');
  await expect(page.locator('.aqi-index').nth(1)).toContainText('18');
  await expect(page.getByText('7.2 µg/m³', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open-Meteo Air Quality API' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'CAMS ENSEMBLE' })).toBeVisible();
  expect(new URL(requestedUrl).searchParams.get('lat')).toBe('52.52');
  expect(new URL(requestedUrl).searchParams.get('lon')).toBe('13.405');
  expect(calls).toBe(1);
  await page.getByRole('button', { name: 'Close weather tools' }).click();
  await expect(page.locator('.air-quality-panel')).not.toHaveAttribute('open', '');
  await page.getByRole('button', { name: 'Open weather tools' }).click();
  await expect(page.locator('.air-quality-panel')).not.toHaveAttribute('open', '');
  expect(calls).toBe(1);
});

test('requests geolocation only after the user activates it and explains denied permission', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let calls = 0;
    Object.defineProperty(window, '__geolocationCalls', {
      get: () => calls,
    });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (
          _success: unknown,
          error: (value: { code: number; PERMISSION_DENIED: number }) => void,
        ) => {
          calls += 1;
          error({ code: 1, PERMISSION_DENIED: 1 });
        },
      },
    });
  });
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Use my current location' })).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as Window & { __geolocationCalls: number }).__geolocationCalls,
    ),
  ).toBe(0);
  await page.getByRole('button', { name: 'Use my current location' }).click();

  await expect(page.locator('.location-status')).toContainText('Location permission was denied');
  expect(
    await page.evaluate(
      () => (window as Window & { __geolocationCalls: number }).__geolocationCalls,
    ),
  ).toBe(1);
  await expect(page).toHaveURL('/');
});

test('loads weather from device coordinates without adding them to the page URL', async ({
  context,
  page,
}) => {
  await context.grantPermissions(['geolocation'], { origin: 'http://127.0.0.1:3000' });
  await context.setGeolocation({ latitude: 48.8534, longitude: 2.3488 });
  let weatherRequest = '';
  let weatherRequestCount = 0;
  await page.route('**/api/v1/weather/dashboard?**', async (route) => {
    weatherRequestCount += 1;
    weatherRequest = route.request().url();
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        location: {
          id: 'test',
          name: 'Test',
          country: 'Test',
          latitude: 0,
          longitude: 0,
          timezone: 'UTC',
        },
        current: {
          observedAt: '2026-09-01T10:00:00.000Z',
          temperatureC: 20,
          apparentTemperatureC: 19,
          humidityPercent: 64,
          windSpeedKph: 13,
          pressureHpa: 1017,
          condition: 'partly-cloudy',
        },
        hourly: [
          {
            time: '2026-09-01T10:00:00.000Z',
            temperatureC: 20,
            precipitationProbability: 5,
            condition: 'partly-cloudy',
          },
        ],
        daily: [
          {
            date: '2026-09-01',
            highC: 22,
            lowC: 15,
            precipitationProbability: 10,
            condition: 'partly-cloudy',
          },
        ],
        meta: {
          provider: 'test',
          cached: false,
          stale: false,
          updatedAt: '2026-09-01T10:00:00.000Z',
        },
      }),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Use my current location' }).click();

  await expect(page.locator('.location-name')).toHaveText('Your location');
  await expect(page.locator('.location-status')).toContainText(
    'Showing weather for your current location',
  );
  expect(new URL(weatherRequest).searchParams.get('lat')).toBe('48.8534');
  expect(new URL(weatherRequest).searchParams.get('lon')).toBe('2.3488');
  await expect(page).toHaveURL('/');
  const requestsBeforeViews = weatherRequestCount;
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Map', exact: true })
    .click();
  await expect(page).toHaveURL('/#map');
  await expect(page.locator('.location-name')).toHaveText('Your location');
  await page.goBack();
  await expect(page).toHaveURL('/');
  await expect(page.locator('.location-name')).toHaveText('Your location');
  await page.goForward();
  await expect(page).toHaveURL('/#map');
  await page.getByRole('button', { name: 'Use my current location' }).click();
  await expect.poll(() => weatherRequestCount).toBe(requestsBeforeViews + 1);
  await expect(page).toHaveURL('/#map');
});

test('authenticates, saves the current place, and switches to an API-returned saved place', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const paris = {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Paris',
    latitude: 48.8534,
    longitude: 2.3488,
    created_at: '2026-09-27T10:00:00.000Z',
    updated_at: '2026-09-27T10:00:00.000Z',
    is_favorite: false,
    category: null as 'home' | 'work' | 'university' | 'travel' | null,
    sort_order: 0,
    is_default: false,
  };
  const user = {
    id: '00000000-0000-4000-8000-000000000010',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'weather@example.test',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at: '2026-09-27T10:00:00.000Z',
  };
  const accessToken = 'test-access-token';
  let savedBerlin: typeof paris | undefined;
  let forwardedAuthorization = '';
  let savedLocationDeleteAuthorization = '';
  let deletedSavedLocationId = '';
  let savedLocationPatchAuthorization = '';
  let patchedSavedLocationName = '';
  let preferenceAuthorization = '';
  let preferencePayload:
    | {
        locations: Array<{ id: string; is_favorite: boolean; category: string | null }>;
        defaultLocationId: string | null;
      }
    | undefined;
  let serverPreferencesInitialized = false;
  const browserWeatherQueries: string[] = [];
  const removedSavedLocationIds = new Set<string>();
  let postedLocation: { name: string; latitude: number; longitude: number } | undefined;
  let savedObservation:
    | {
        id: string;
        latitude: number;
        longitude: number;
        observed_at: string;
        provider: string;
        payload: {
          location_name: string;
          temperature_c: number;
          apparent_temperature_c: number;
          humidity_percent: number;
          wind_speed_kph: number;
          pressure_hpa: number;
          condition: string;
        };
        created_at: string;
      }
    | undefined;
  let historyAuthorization = '';
  let deleteAuthorization = '';
  let deletedSnapshotId = '';
  let savedAlertRule: Record<string, unknown> | undefined;
  let alertAuthorization = '';
  let airQualityRequestCount = 0;
  let warningRequestCount = 0;
  let postedObservation: Record<string, unknown> | undefined;

  await page.route('**/auth/v1/token?grant_type=password', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'test-refresh-token',
        user,
      }),
    });
  });
  await page.route('**/api/v1/locations', async (route) => {
    forwardedAuthorization = route.request().headers().authorization ?? '';
    if (route.request().method() === 'POST') {
      postedLocation = route.request().postDataJSON();
      savedBerlin = {
        id: '00000000-0000-4000-8000-000000000002',
        ...postedLocation,
        created_at: '2026-09-27T10:01:00.000Z',
        updated_at: '2026-09-27T10:01:00.000Z',
        is_favorite: false,
        category: null,
        sort_order: 1,
        is_default: false,
      };
      await route.fulfill({ status: 201, json: { location: savedBerlin } });
      return;
    }
    await route.fulfill({
      json: {
        locations: [paris, ...(savedBerlin ? [savedBerlin] : [])].filter(
          (location) => !removedSavedLocationIds.has(location.id),
        ),
        preferencesInitialized: serverPreferencesInitialized,
      },
    });
  });
  await page.route('**/api/v1/locations/*', async (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-1) ?? '';
    if (id === 'preferences' && route.request().method() === 'PATCH') {
      preferenceAuthorization = route.request().headers().authorization ?? '';
      preferencePayload = route.request().postDataJSON() as typeof preferencePayload;
      serverPreferencesInitialized = true;
      if (savedBerlin && preferencePayload) {
        const index = preferencePayload.locations.findIndex((item) => item.id === savedBerlin!.id);
        if (index >= 0) {
          const pref = preferencePayload.locations[index]!;
          savedBerlin = {
            ...savedBerlin,
            is_favorite: pref.is_favorite,
            category: pref.category,
            sort_order: index,
            is_default: preferencePayload.defaultLocationId === savedBerlin.id,
          };
        }
      }
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    if (route.request().method() === 'PATCH') {
      savedLocationPatchAuthorization = route.request().headers().authorization ?? '';
      const body = route.request().postDataJSON() as { name: string };
      patchedSavedLocationName = body.name;
      if (savedBerlin?.id === id) savedBerlin = { ...savedBerlin, name: body.name };
      const location = id === paris.id ? { ...paris, name: body.name } : savedBerlin;
      await route.fulfill({ json: { location } });
      return;
    }
    savedLocationDeleteAuthorization = route.request().headers().authorization ?? '';
    deletedSavedLocationId = id;
    removedSavedLocationIds.add(deletedSavedLocationId);
    await route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/api/v1/weather/dashboard?**', async (route) => {
    const query = new URL(route.request().url()).searchParams;
    browserWeatherQueries.push(`${query.get('lat')},${query.get('lon')}`);
    await route.fulfill({
      json: {
        location: {
          id: 'weather-location',
          name: 'Weather location',
          country: 'Test',
          latitude: 0,
          longitude: 0,
          timezone: 'UTC',
        },
        current: {
          observedAt: '2026-09-01T10:00:00.000Z',
          temperatureC: 20,
          apparentTemperatureC: 19,
          humidityPercent: 64,
          windSpeedKph: 13,
          pressureHpa: 1017,
          condition: 'partly-cloudy',
        },
        hourly: [
          {
            time: '2026-09-01T10:00:00.000Z',
            temperatureC: 20,
            precipitationProbability: 5,
            condition: 'partly-cloudy',
          },
        ],
        daily: [
          {
            date: '2026-09-01',
            highC: 22,
            lowC: 15,
            precipitationProbability: 10,
            condition: 'partly-cloudy',
          },
        ],
        meta: {
          provider: 'open-meteo',
          cached: false,
          stale: false,
          updatedAt: '2026-09-01T10:00:00.000Z',
        },
      },
    });
  });
  await page.route('**/api/v1/weather/history**', async (route) => {
    historyAuthorization = route.request().headers().authorization ?? '';
    if (route.request().method() === 'DELETE') {
      deleteAuthorization = route.request().headers().authorization ?? '';
      deletedSnapshotId = new URL(route.request().url()).pathname.split('/').at(-1) ?? '';
      savedObservation = undefined;
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    if (route.request().method() === 'POST') {
      postedObservation = route.request().postDataJSON();
      const observation = postedObservation;
      savedObservation = {
        id: '00000000-0000-4000-8000-000000000030',
        latitude: Number(observation.latitude),
        longitude: Number(observation.longitude),
        observed_at: String(observation.observed_at),
        provider: 'open-meteo',
        payload: {
          location_name: String(observation.location_name),
          temperature_c: Number(observation.temperatureC),
          apparent_temperature_c: Number(observation.apparentTemperatureC),
          humidity_percent: Number(observation.humidityPercent),
          wind_speed_kph: Number(observation.windSpeedKph),
          pressure_hpa: Number(observation.pressureHpa),
          condition: String(observation.condition),
        },
        created_at: '2026-09-27T10:02:00.000Z',
      };
      await route.fulfill({ status: 201, json: { snapshot: savedObservation } });
      return;
    }
    await route.fulfill({ json: { snapshots: savedObservation ? [savedObservation] : [] } });
  });
  await page.route('**/api/v1/weather/air-quality?**', async (route) => {
    airQualityRequestCount += 1;
    const observedAt = new Date().toISOString();
    await route.fulfill({
      json: {
        observedAt,
        usAqi: 42,
        europeanAqi: 18,
        pollutants: {
          pm25: 5,
          pm10: 10,
          carbonMonoxide: 100,
          nitrogenDioxide: 3,
          sulphurDioxide: 1,
          ozone: 60,
        },
        timeline: {
          kind: 'model',
          requestedPastDays: 7,
          requestedForecastDays: 5,
          hours: [
            {
              time: new Date(Date.now() + 60 * 60_000).toISOString(),
              usAqi: 85,
              europeanAqi: 40,
              pollutants: {
                pm25: 14,
                pm10: 20,
                carbonMonoxide: 110,
                nitrogenDioxide: 4,
                sulphurDioxide: 1,
                ozone: 70,
              },
            },
          ],
        },
        meta: { provider: 'open-meteo', cached: false, stale: false, updatedAt: observedAt },
      },
    });
  });
  await page.route('**/api/v1/weather/warnings', async (route) => {
    warningRequestCount += 1;
    await route.fulfill({
      json: {
        coverage: 'supported',
        source: 'nws',
        alerts: [
          {
            id: 'nws:test-alert',
            event: 'Flood Warning',
            headline: null,
            severity: null,
            urgency: null,
            certainty: null,
            area: 'Paris test area',
            publishedAt: null,
            effectiveAt: null,
            onsetAt: null,
            expiresAt: null,
            endsAt: null,
            description: null,
            instruction: null,
            sourceUrl: 'https://api.weather.gov/alerts/test-alert',
          },
        ],
        meta: {
          checkedAt: new Date().toISOString(),
          cached: false,
          stale: false,
          truncated: false,
        },
      },
    });
  });
  await page.route('**/api/v1/alerts**', async (route) => {
    alertAuthorization = route.request().headers().authorization ?? '';
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      savedAlertRule = {
        id: '00000000-0000-4000-8000-000000000040',
        location_id: String(body.location_id),
        latitude: Number(body.latitude),
        longitude: Number(body.longitude),
        conditions: [body.condition],
        schedule: body.schedule,
        notification_channels: ['in-app'],
        enabled: true,
        created_at: '2026-09-27T10:03:00.000Z',
        updated_at: '2026-09-27T10:03:00.000Z',
      };
      await route.fulfill({ status: 201, json: { rule: savedAlertRule } });
      return;
    }
    if (route.request().method() === 'PATCH' && savedAlertRule) {
      savedAlertRule = { ...savedAlertRule, ...route.request().postDataJSON() };
      await route.fulfill({ json: { rule: savedAlertRule } });
      return;
    }
    if (route.request().method() === 'DELETE') {
      savedAlertRule = undefined;
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({ json: { rules: savedAlertRule ? [savedAlertRule] : [] } });
  });

  await page.goto('/');
  await page.evaluate(
    ({ userId, placeId }) =>
      window.localStorage.setItem(
        `atmos.saved-places.${userId}`,
        JSON.stringify({ orderedLocationIds: [placeId] }),
      ),
    { userId: user.id, placeId: paris.id },
  );
  await openWeatherTool(page, 'Saved places');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill('safe-example-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText(user.email, { exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Your saved places' })).toContainText('Paris');
  expect(forwardedAuthorization).toBe(`Bearer ${accessToken}`);
  expect(serverPreferencesInitialized).toBe(true);
  expect(preferencePayload?.locations.map((location) => location.id)).toEqual([paris.id]);

  await page.getByRole('button', { name: 'Save Berlin' }).click();
  await expect(page.locator('.saved-location-status')).toContainText('Berlin saved to your places');
  expect(postedLocation).toEqual({ name: 'Berlin', latitude: 52.52, longitude: 13.405 });
  expect(forwardedAuthorization).toBe(`Bearer ${accessToken}`);

  await page.getByRole('button', { name: 'Rename Berlin' }).click();
  const renameInput = page.getByRole('textbox', { name: 'New name for Berlin' });
  await renameInput.fill('Berlin Home');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.locator('.saved-location-status')).toContainText('Berlin Home renamed.');
  expect(savedLocationPatchAuthorization).toBe(`Bearer ${accessToken}`);
  expect(patchedSavedLocationName).toBe('Berlin Home');
  await expect(page.getByRole('list', { name: 'Your saved places' })).toContainText('Berlin Home');
  await page.getByRole('button', { name: 'Add Berlin Home to favorites' }).click();
  await expect.poll(() => savedBerlin?.is_favorite).toBe(true);
  expect(preferenceAuthorization).toBe(`Bearer ${accessToken}`);
  await page.getByLabel('Category for Berlin Home').selectOption('work');
  await expect.poll(() => savedBerlin?.category).toBe('work');
  await page.getByRole('button', { name: 'Move Berlin Home up' }).click();
  const savedPlaceList = page.getByRole('list', { name: 'Your saved places' });
  await expect(savedPlaceList.locator('li').first()).toContainText('Berlin Home');
  await page.getByRole('button', { name: 'Set Berlin Home as default place' }).click();
  await expect(page.locator('.saved-location-status')).toContainText(
    'Berlin Home is your default place for your account.',
  );
  expect(savedBerlin?.is_default).toBe(true);
  expect(preferencePayload?.defaultLocationId).toBe(savedBerlin?.id);
  const placePreferences = await page.evaluate((userId) => {
    const value = window.localStorage.getItem(`atmos.saved-places.${userId}`);
    return value ? JSON.parse(value) : undefined;
  }, user.id);
  expect(placePreferences.defaultLocationId).toBe(savedBerlin?.id);
  expect(placePreferences.orderedLocationIds[0]).toBe(savedBerlin?.id);

  const requestsBeforeReturningToParis = browserWeatherQueries.length;
  await page
    .getByRole('list', { name: 'Your saved places' })
    .getByRole('button', { name: 'Paris', exact: true })
    .click();
  await expect
    .poll(() => browserWeatherQueries.length, { timeout: 15_000 })
    .toBeGreaterThan(requestsBeforeReturningToParis);
  await expect(page.locator('.location-name')).toHaveText('Paris', { timeout: 15_000 });
  await expect(page).toHaveURL('/');

  await openWeatherTool(page, 'Saved places');
  await page.getByRole('button', { name: 'Remove Paris from saved places' }).click();
  const removeConfirmation = page.getByRole('group', { name: 'Remove Paris' });
  await expect(removeConfirmation).toContainText('Remove Paris?');
  await removeConfirmation.getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('.saved-location-status')).toContainText(
    'Paris removed from your places.',
  );
  await expect(page.getByRole('list', { name: 'Your saved places' })).not.toContainText('Paris');
  expect(savedLocationDeleteAuthorization).toBe(`Bearer ${accessToken}`);
  expect(deletedSavedLocationId).toBe(paris.id);

  await openWeatherTool(page, 'History');
  await page.getByRole('button', { name: '90 days' }).click();
  await page.getByRole('button', { name: 'Record this observation' }).click();
  await expect(page.locator('.weather-history-status')).toContainText('recorded.');
  await expect(page.getByRole('list', { name: 'Recorded observations' })).toContainText('20°');
  expect(postedObservation).toMatchObject({
    latitude: 48.8534,
    longitude: 2.3488,
    observed_at: '2026-09-01T10:00:00.000Z',
    location_name: 'Paris',
    temperatureC: 20,
  });
  expect(historyAuthorization).toBe(`Bearer ${accessToken}`);

  const historyDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  expect((await historyDownload).suggestedFilename()).toBe('atmos-history-paris-90d.csv');

  await page.getByRole('button', { name: /Delete observation from/ }).click();
  await expect(page.locator('.weather-history-status')).toContainText('Observation deleted.');
  await expect(page.getByRole('list', { name: 'Recorded observations' })).toHaveCount(0);
  expect(deleteAuthorization).toBe(`Bearer ${accessToken}`);
  expect(deletedSnapshotId).toBe('00000000-0000-4000-8000-000000000030');

  await openWeatherTool(page, 'Alerts');
  await page.getByLabel('Threshold').fill('18');
  const currentLocationWeekday = await page.evaluate(() =>
    new Intl.DateTimeFormat('en', { weekday: 'long', timeZone: 'UTC' })
      .format(new Date())
      .toLowerCase(),
  );
  const excludedWeekday = currentLocationWeekday === 'monday' ? 'tuesday' : 'monday';
  const excludedWeekdayLabel = excludedWeekday[0]!.toUpperCase() + excludedWeekday.slice(1);
  await page.getByRole('checkbox', { name: excludedWeekdayLabel, exact: true }).uncheck();
  await page.getByLabel('Cooldown (minutes)').fill('120');
  const alertWindow = await page.evaluate(() => {
    const inputValue = (date: Date) =>
      new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    return {
      startsAt: inputValue(new Date(Date.now() - 60 * 60_000)),
      endsAt: inputValue(new Date(Date.now() + 60 * 60_000)),
    };
  });
  await page.getByLabel('Starts at (optional, device time)').fill(alertWindow.startsAt);
  await page.getByLabel('Ends at (optional, device time)').fill(alertWindow.endsAt);
  await page.getByRole('button', { name: 'Add in-app rule' }).click();
  await expect(page.locator('.in-app-alert-status')).toHaveText('Matches current forecast');
  await expect(page.getByRole('list', { name: 'Your alert rules' })).toContainText(
    'Temperature above 18°C',
  );
  expect(savedAlertRule).toMatchObject({
    notification_channels: ['in-app'],
    enabled: true,
    schedule: { cooldownMinutes: 120 },
  });
  const savedSchedule = savedAlertRule?.schedule as {
    weekdays: string[];
    startsAt: string;
    endsAt: string;
    cooldownMinutes: number;
  };
  expect(savedSchedule.weekdays).toContain(currentLocationWeekday);
  expect(savedSchedule.weekdays).not.toContain(excludedWeekday);
  expect(Date.parse(savedSchedule.startsAt)).toBeLessThanOrEqual(Date.now());
  expect(Date.parse(savedSchedule.endsAt)).toBeGreaterThan(Date.now());
  await expect(page.getByRole('list', { name: 'Your alert rules' }).locator('li')).toContainText(
    'cooldown 120 min',
  );
  expect(alertAuthorization).toBe(`Bearer ${accessToken}`);

  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.locator('.in-app-alert-status')).toHaveText('Paused');
  await page.getByRole('button', { name: /Delete alert/ }).click();
  await expect(page.locator('.in-app-alerts-status')).toContainText('Alert rule deleted');
  await expect(page.getByRole('list', { name: 'Your alert rules' })).toHaveCount(0);
  expect(airQualityRequestCount).toBe(0);
  expect(warningRequestCount).toBe(0);

  await page.locator('#alert-metric').selectOption('aqi');
  await page.getByLabel('Threshold').fill('60');
  await expect.poll(() => airQualityRequestCount).toBe(1);
  await page.getByRole('button', { name: 'Add in-app rule' }).click();
  await expect(page.locator('.in-app-alert-status')).toHaveText('Matches current forecast');
  expect(savedAlertRule?.conditions).toEqual([{ metric: 'aqi', comparison: 'above', value: 60 }]);
  expect(warningRequestCount).toBe(0);
  await page.getByRole('button', { name: /Delete alert/ }).click();
  await expect(page.getByRole('list', { name: 'Your alert rules' })).toHaveCount(0);

  await page.locator('#alert-metric').selectOption('provider-severe-weather-alert');
  await expect.poll(() => warningRequestCount).toBe(1);
  await page.getByRole('button', { name: 'Add in-app rule' }).click();
  await expect(page.locator('.in-app-alert-status')).toHaveText('Matches current forecast');
  expect(savedAlertRule?.conditions).toEqual([
    { metric: 'provider-severe-weather-alert', expected: true },
  ]);
  expect(airQualityRequestCount).toBe(1);
  await page.getByRole('button', { name: /Delete alert/ }).click();
  await expect(page.getByRole('list', { name: 'Your alert rules' })).toHaveCount(0);

  await page.reload();
  const restoredPreferences = await page.evaluate(
    (userId) => ({
      savedPlaces: window.localStorage.getItem(`atmos.saved-places.${userId}`),
      authSessionKey: Object.keys(window.localStorage).find((key) => key.includes('auth-token')),
    }),
    user.id,
  );
  expect(restoredPreferences.savedPlaces).toContain(savedBerlin?.id);
  expect(restoredPreferences.authSessionKey).toBeTruthy();
  await openWeatherTool(page, 'Saved places');
  await expect(page.getByRole('list', { name: 'Your saved places' })).toContainText('Berlin Home');
  await expect.poll(() => browserWeatherQueries.length).toBeGreaterThan(1);
  await expect(page.locator('.saved-location-status')).toContainText(
    'Showing your default place Berlin Home.',
  );
  await expect(page.locator('.location-name')).toHaveText('Berlin Home');
  await expect(page).toHaveURL('/');

  const requestsAfterDefault = browserWeatherQueries.length;
  await page.goto('/?lat=48.8534&lon=2.3488&timezone=Europe%2FParis&name=Paris&country=France');
  await expect(page.locator('.location-name')).toHaveText('Paris');
  await openWeatherTool(page, 'Saved places');
  await expect(page.locator('.location-name')).toHaveText('Paris');
  expect(browserWeatherQueries).toHaveLength(requestsAfterDefault);
});

test('shows email-confirmation guidance after account creation', async ({ page }) => {
  const user = {
    id: '00000000-0000-4000-8000-000000000011',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'new-user@example.test',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at: '2026-09-27T10:00:00.000Z',
  };
  await page.route('**/auth/v1/signup**', async (route) => {
    await route.fulfill({ json: { user, session: null } });
  });
  await page.goto('/');
  await openWeatherTool(page, 'Saved places');
  await page.getByRole('button', { name: 'Need an account? Create one' }).click();
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill('safe-example-password');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.locator('.saved-location-status')).toContainText(
    'check your email to confirm it',
  );
  await expect(page.getByText(user.email, { exact: true })).toHaveCount(0);
});

test('publishes Google OAuth privacy and terms pages from the public site', async ({ page }) => {
  await page.goto('/');

  const homepageLegalLinks = page.getByRole('navigation', { name: 'Legal information' });
  await expect(homepageLegalLinks.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
    'href',
    '/privacy',
  );
  await expect(homepageLegalLinks.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
    'href',
    '/terms',
  );

  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy Policy', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Google sign-in' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'jach96443@gmail.com' })).toHaveAttribute(
    'href',
    'mailto:jach96443@gmail.com',
  );

  await page.goto('/terms');
  await expect(page.getByRole('heading', { name: 'Terms of Service', level: 1 })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Weather information is not safety advice' }),
  ).toBeVisible();
});

test('requests a non-enumerating password recovery link and handles an expired recovery session', async ({
  page,
}) => {
  const user = {
    id: '00000000-0000-4000-8000-000000000012',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'weather@example.test',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at: '2026-09-27T10:00:00.000Z',
  };
  const accessToken = 'test-recovery-access-token';
  let recoveryRequest: Record<string, unknown> | undefined;
  let recoveryRequestUrl = '';
  let updatedPassword = '';
  let passwordUpdateAuthorization = '';
  await page.route('**/auth/v1/recover**', async (route) => {
    recoveryRequest = route.request().postDataJSON();
    recoveryRequestUrl = route.request().url();
    await route.fulfill({ status: 200, json: {} });
  });
  await page.route('**/auth/v1/token?grant_type=password', async (route) => {
    await route.fulfill({
      json: {
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'test-refresh-token',
        user,
      },
    });
  });
  await page.route('**/auth/v1/user', async (route) => {
    if (!['PUT', 'PATCH'].includes(route.request().method())) {
      await route.continue();
      return;
    }
    updatedPassword = String(route.request().postDataJSON().password ?? '');
    passwordUpdateAuthorization = route.request().headers().authorization ?? '';
    await route.fulfill({ json: user });
  });
  await page.goto('/');
  await openWeatherTool(page, 'Saved places');
  await page.getByLabel('Email').fill('weather@example.test');
  await page.getByRole('button', { name: 'Forgot password?' }).click();

  await expect(page.locator('.saved-location-status')).toContainText(
    'If an account exists for this address',
  );
  expect(recoveryRequest?.email).toBe('weather@example.test');
  const recoveryOptions = recoveryRequest?.options as { emailRedirectTo?: string } | undefined;
  const redirectTarget =
    new URL(recoveryRequestUrl).searchParams.get('redirect_to') ??
    (recoveryRequest?.redirect_to as string | undefined) ??
    (recoveryRequest?.redirectTo as string | undefined) ??
    recoveryOptions?.emailRedirectTo;
  expect(redirectTarget).toBe('http://127.0.0.1:3000/auth/update-password');

  await page.goto('/auth/update-password');
  await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('recovery link is missing or expired');
  await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);

  await page.goto('/');
  await openWeatherTool(page, 'Saved places');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill('safe-example-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(user.email, { exact: true })).toBeVisible();
  await page.goto('/auth/update-password');
  await page.getByLabel('New password', { exact: true }).fill('new-safe-password-123');
  await page.getByLabel('Confirm new password', { exact: true }).fill('new-safe-password-123');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.locator('.password-recovery-status')).toContainText(
    'Your password has been updated',
  );
  expect(updatedPassword).toBe('new-safe-password-123');
  expect(passwordUpdateAuthorization).toBe(`Bearer ${accessToken}`);
});

test('starts Google OAuth through the configured Supabase provider', async ({ page }) => {
  let authorizationUrl = '';
  await page.route('**/auth/v1/authorize**', async (route) => {
    authorizationUrl = route.request().url();
    await route.fulfill({
      status: 302,
      headers: { location: 'http://127.0.0.1:3000/?oauth-started=1' },
    });
  });
  await page.goto('/');
  await openWeatherTool(page, 'Saved places');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await page.waitForURL('**/?oauth-started=1');

  const authorization = new URL(authorizationUrl);
  expect(authorization.searchParams.get('provider')).toBe('google');
  expect(authorization.searchParams.get('redirect_to')).toBe('http://127.0.0.1:3000');
});

test('deletes only the confirmed signed-in account through the authenticated API', async ({
  page,
}) => {
  const user = {
    id: '00000000-0000-4000-8000-000000000013',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'delete-me@example.test',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at: '2026-09-27T10:00:00.000Z',
    last_sign_in_at: new Date().toISOString(),
  };
  const accessToken = 'test-account-delete-access-token';
  let deleteAuthorization = '';
  let deletePayload: { confirmationEmail?: string; confirmationPhrase?: string } | undefined;
  await page.route('**/auth/v1/token?grant_type=password', async (route) => {
    await route.fulfill({
      json: {
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'test-delete-refresh-token',
        user,
      },
    });
  });
  await page.route('**/api/v1/locations', async (route) => {
    await route.fulfill({ json: { locations: [], preferencesInitialized: true } });
  });
  await page.route('**/api/v1/account', async (route) => {
    deleteAuthorization = route.request().headers().authorization ?? '';
    deletePayload = route.request().postDataJSON();
    await route.fulfill({ status: 204, body: '' });
  });

  await page.goto('/');
  await openWeatherTool(page, 'Saved places');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill('safe-example-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(user.email, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete account' }).click();
  await page.getByLabel('Confirm your account email').fill(user.email);
  await page.getByLabel('Type DELETE to confirm').fill('DELETE');
  await page.getByRole('button', { name: 'Delete account permanently' }).click();

  await expect(page.locator('.saved-location-status')).toContainText(
    'Your account and its saved data were deleted.',
  );
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  expect(deleteAuthorization).toBe(`Bearer ${accessToken}`);
  expect(deletePayload).toEqual({
    confirmationEmail: user.email,
    confirmationPhrase: 'DELETE',
  });
});

test('serves a standalone web manifest and an offline worker that bypasses private APIs', async ({
  request,
}) => {
  const manifestResponse = await request.get('/manifest.webmanifest');
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({
    name: 'Atmos Weather Intelligence',
    start_url: '/',
    display: 'standalone',
  });
  expect(manifest.icons).toContainEqual(
    expect.objectContaining({ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }),
  );

  const serviceWorkerResponse = await request.get('/sw.js');
  expect(serviceWorkerResponse.ok()).toBe(true);
  const serviceWorker = await serviceWorkerResponse.text();
  expect(serviceWorker).toContain("requestUrl.pathname.startsWith('/api/')");
  expect(serviceWorker).toContain("requestUrl.pathname.startsWith('/auth/')");
  expect(serviceWorker).toContain("requestUrl.pathname === '/'");
});
