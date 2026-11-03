import { expect, test } from '@playwright/test';

const airQuality = {
  observedAt: '2026-10-18T10:00:00.000Z',
  usAqi: null,
  europeanAqi: 35,
  pollutants: {
    pm25: null,
    pm10: null,
    carbonMonoxide: null,
    nitrogenDioxide: null,
    sulphurDioxide: null,
    ozone: null,
  },
  meta: {
    provider: 'open-meteo',
    cached: false,
    stale: false,
    updatedAt: '2026-10-18T10:02:00.000Z',
  },
};

function dashboard(latitude: number, longitude: number) {
  return {
    location: {
      id: 'map-preview',
      name: 'Map preview',
      country: 'Selected coordinates',
      latitude,
      longitude,
      timezone: 'UTC',
    },
    current: {
      observedAt: '2026-10-18T10:00:00.000Z',
      temperatureC: 19,
      apparentTemperatureC: 18,
      humidityPercent: 57,
      windSpeedKph: 12,
      pressureHpa: 1012,
      condition: 'partly-cloudy',
    },
    hourly: [
      {
        time: '2026-10-18T11:00:00.000Z',
        temperatureC: 20,
        precipitationProbability: 10,
        condition: 'partly-cloudy',
      },
    ],
    daily: [
      {
        date: '2026-10-18',
        highC: 22,
        lowC: 14,
        precipitationProbability: 10,
        condition: 'partly-cloudy',
      },
    ],
    meta: {
      provider: 'open-meteo',
      cached: false,
      stale: false,
      updatedAt: '2026-10-18T10:00:00.000Z',
    },
  };
}

test('loads bounded AQI point samples and selects arbitrary map coordinates directly', async ({
  page,
}, testInfo) => {
  const requestedAqi: Array<Record<string, unknown>> = [];
  const coordinateQueries: Array<{ latitude: number; longitude: number }> = [];
  let searchRequests = 0;

  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/styles/liberty', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        version: 8,
        sources: {},
        layers: [
          {
            id: 'map-test-background',
            type: 'background',
            paint: { 'background-color': '#dce9e8' },
          },
        ],
      },
    });
  });
  await page.route('**/api/v1/weather/map/layers', async (route) => {
    await route.fulfill({ json: { openWeatherAvailable: false } });
  });
  await page.route('**/api/v1/weather/radar/frames*', async (route) => {
    const timestamp = Math.floor(Date.now() / 1000);
    await route.fulfill({
      json: {
        generatedAt: timestamp,
        tileHost: 'https://tilecache.rainviewer.com',
        frames: [{ timestamp, path: '/v2/radar/test-frame' }],
      },
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
  await page.route('**/api/public/v1/weather/air-quality', async (route) => {
    requestedAqi.push(route.request().postDataJSON());
    await route.fulfill({ json: airQuality });
  });
  await page.route('**/api/public/v1/weather/dashboard', async (route) => {
    const input = route.request().postDataJSON();
    const latitude = Number(input.latitude);
    const longitude = Number(input.longitude);
    coordinateQueries.push({ latitude, longitude });
    await route.fulfill({ json: dashboard(latitude, longitude) });
  });
  await page.route('**/api/v1/locations/search?**', async (route) => {
    searchRequests += 1;
    await route.fulfill({ json: { results: [] } });
  });

  await page.goto('/');
  await page.locator('.maplibregl-canvas').waitFor();
  await expect(page.getByText(/doesn't offer selectable city labels/)).toBeVisible();
  const layerPicker = page.getByRole('combobox', { name: 'Weather map layer' });
  await layerPicker.selectOption('aqi');
  const aqiPanel = page.getByRole('region', { name: 'Air quality map samples' });
  await expect(aqiPanel).toBeVisible();
  await expect(page.locator('.map-city-picker')).toHaveCount(0);
  await expect(aqiPanel).toContainText('Point samples');
  await expect(aqiPanel).toContainText('U.S. AQI Unavailable');
  await expect(aqiPanel).toContainText('European AQI 35');
  await expect(aqiPanel).toContainText('UTC');
  await expect(aqiPanel).toContainText('Dots only—not a continuous surface.');
  await expect(aqiPanel).toContainText('not station readings');
  await expect(aqiPanel.getByRole('link', { name: 'CC BY 4.0' })).toBeVisible();
  expect(requestedAqi).toHaveLength(1);
  expect(requestedAqi[0]).toMatchObject({ latitude: 52.52, longitude: 13.405 });
  expect(await aqiPanel.getByText(/U\.S\. AQI 0/).count()).toBe(0);
  if (!process.env.CI) {
    await page.locator('#map').screenshot({ path: testInfo.outputPath('map-aqi-mobile.png') });
  }

  await layerPicker.selectOption('cities');
  const canvas = page.locator('.maplibregl-canvas');
  const canvasBounds = await canvas.boundingBox();
  expect(canvasBounds).not.toBeNull();
  await canvas.click({
    position: {
      x: Math.floor(canvasBounds!.width * 0.78),
      y: Math.floor(canvasBounds!.height * 0.68),
    },
  });

  await expect.poll(() => coordinateQueries.length).toBe(1);
  expect(coordinateQueries[0]!.latitude).toBeGreaterThanOrEqual(-90);
  expect(coordinateQueries[0]!.latitude).toBeLessThanOrEqual(90);
  expect(coordinateQueries[0]!.longitude).toBeGreaterThanOrEqual(-180);
  expect(coordinateQueries[0]!.longitude).toBeLessThanOrEqual(180);
  expect(searchRequests).toBe(0);

  await expect(page).toHaveURL(/lat=.*lon=/);
  const currentUrl = new URL(page.url());
  expect(Number(currentUrl.searchParams.get('lat'))).toBeCloseTo(coordinateQueries[0]!.latitude, 4);
  expect(Number(currentUrl.searchParams.get('lon'))).toBeCloseTo(
    coordinateQueries[0]!.longitude,
    4,
  );

  await layerPicker.selectOption('aqi');
  await expect(aqiPanel).toContainText('U.S. AQI Unavailable');
  expect(requestedAqi).toHaveLength(2);
  if (!process.env.CI) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('#map').screenshot({ path: testInfo.outputPath('map-aqi-desktop.png') });
  }
  await page.setViewportSize({ width: 320, height: 740 });
  const mobilePanelBounds = await aqiPanel.boundingBox();
  expect(mobilePanelBounds).not.toBeNull();
  expect(mobilePanelBounds!.x).toBeGreaterThanOrEqual(0);
  expect(mobilePanelBounds!.x + mobilePanelBounds!.width).toBeLessThanOrEqual(320);
  const mobileZoomBounds = await page
    .getByRole('button', { name: 'Zoom in', exact: true })
    .boundingBox();
  expect(mobileZoomBounds).not.toBeNull();
  expect(mobilePanelBounds!.x + mobilePanelBounds!.width).toBeLessThanOrEqual(mobileZoomBounds!.x);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  if (!process.env.CI) {
    await page.locator('#map').screenshot({ path: testInfo.outputPath('map-aqi-320px.png') });
  }
});

test('keeps the previous location when direct selection fails and allows retry', async ({
  page,
}) => {
  let requests = 0;
  await page.route('**/styles/liberty', (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#ddd' } }],
      },
    }),
  );
  await page.route('**/api/public/v1/weather/dashboard', async (route) => {
    requests++;
    if (requests === 1) {
      await route.fulfill({ status: 503, json: { error: 'unavailable' } });
      return;
    }
    const input = route.request().postDataJSON();
    await route.fulfill({ json: dashboard(Number(input.latitude), Number(input.longitude)) });
  });
  await page.goto('/#map');
  const canvas = page.locator('.maplibregl-canvas');
  await canvas.waitFor();
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await canvas.click({ position: { x: bounds!.width * 0.75, y: bounds!.height * 0.65 } });
  await expect(page.getByText(/could not be loaded. Your previous location/)).toBeVisible();
  await expect(page.locator('.location-name')).toHaveText('Berlin');
  await expect(page).not.toHaveURL(/lat=/);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page).toHaveURL(/lat=.*lon=/);
  await expect(page.getByText(/could not be loaded. Your previous location/)).toHaveCount(0);
  expect(requests).toBe(2);
});

test('keeps the latest map selection when an earlier response arrives late', async ({ page }) => {
  let requests = 0;
  let releaseFirst: () => void = () => {};
  const firstPending = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const coordinates: Array<{ latitude: number; longitude: number }> = [];
  await page.route('**/styles/liberty', (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#ddd' } }],
      },
    }),
  );
  await page.route('**/api/public/v1/weather/dashboard', async (route) => {
    const input = route.request().postDataJSON();
    const point = { latitude: Number(input.latitude), longitude: Number(input.longitude) };
    coordinates.push(point);
    const requestNumber = ++requests;
    if (requestNumber === 1) await firstPending;
    await route.fulfill({ json: dashboard(point.latitude, point.longitude) }).catch(() => {});
  });
  try {
    await page.goto('/#map');
    const canvas = page.locator('.maplibregl-canvas');
    await canvas.waitFor();
    const bounds = await canvas.boundingBox();
    expect(bounds).not.toBeNull();
    await canvas.click({ position: { x: bounds!.width * 0.7, y: bounds!.height * 0.6 } });
    await expect.poll(() => requests).toBe(1);
    await canvas.click({ position: { x: bounds!.width * 0.8, y: bounds!.height * 0.55 } });
    await expect.poll(() => requests).toBe(2);
    await expect
      .poll(() => new URL(page.url()).searchParams.get('lat'))
      .toBe(String(coordinates[1]!.latitude));
    releaseFirst();
    await expect(page).toHaveURL(new RegExp(`lat=${coordinates[1]!.latitude}`));
  } finally {
    releaseFirst();
  }
});

test('does not select a location while dragging the map', async ({ page }) => {
  let requests = 0;
  await page.route('**/styles/liberty', (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#ddd' } }],
      },
    }),
  );
  await page.route('**/api/public/v1/weather/dashboard', async (route) => {
    requests++;
    await route.fulfill({ status: 503, json: { error: 'unexpected selection' } });
  });
  await page.goto('/#map');
  const canvas = page.locator('.maplibregl-canvas');
  await canvas.waitFor();
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const x = bounds!.x + bounds!.width * 0.7;
  const y = bounds!.y + bounds!.height * 0.55;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 80, y + 30, { steps: 5 });
  await page.mouse.up();
  await expect(page).not.toHaveURL(/lat=/);
  await expect(page.locator('.location-name')).toHaveText('Berlin');
  expect(requests).toBe(0);
});

test('supports choosing the current map city with the keyboard', async ({ page }) => {
  await page.route('**/styles/liberty', (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#ddd' } }],
      },
    }),
  );
  await page.goto('/#map');
  const picker = page.getByRole('combobox', { name: 'Browse cities visible on the map' });
  await expect(picker).toBeVisible();
  await picker.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(picker).toHaveValue(/selected:/);
  await expect(page.locator('.location-name')).toHaveText('Berlin');
  await expect(page.getByRole('button', { name: 'Open Berlin' })).toHaveCount(0);
});

test('restores direct map selections with browser Back and Forward', async ({ page }) => {
  await page.route('**/styles/liberty', (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {},
        layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#ddd' } }],
      },
    }),
  );
  await page.route('**/api/public/v1/weather/dashboard', async (route) => {
    const input = route.request().postDataJSON();
    await route.fulfill({ json: dashboard(Number(input.latitude), Number(input.longitude)) });
  });
  await page.goto('/#map');
  const canvas = page.locator('.maplibregl-canvas');
  await canvas.waitFor();
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await canvas.click({ position: { x: bounds!.width * 0.75, y: bounds!.height * 0.65 } });
  await expect(page).toHaveURL(/lat=.*lon=/);
  const selectedUrl = page.url();
  const selectedName = await page.locator('.location-name').textContent();
  expect(selectedName).not.toBe('Berlin');
  await page.goBack();
  await expect(page.locator('.location-name')).toHaveText('Berlin');
  await page.goForward();
  await expect(page).toHaveURL(selectedUrl);
  await expect(page.locator('.location-name')).toHaveText(selectedName!);
});

test('keeps mobile map controls clear of the offline notice', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.route('**/api/v1/weather/map/layers', (route) =>
    route.fulfill({ json: { openWeatherAvailable: false } }),
  );
  await page.route('**/api/v1/weather/radar/frames*', (route) => {
    const timestamp = Math.floor(Date.now() / 1000);
    return route.fulfill({
      json: {
        generatedAt: timestamp,
        tileHost: 'https://tilecache.rainviewer.com',
        frames: [{ timestamp, path: '/v2/radar/test-frame' }],
      },
    });
  });
  await page.goto('/#map');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    window.dispatchEvent(new Event('offline'));
  });
  const notice = page.locator('.weather-offline');
  const controls = page.locator('.map-radar-controls');
  await expect(notice).toBeVisible();
  await expect(controls).toBeVisible();
  const noticeBounds = await notice.boundingBox();
  const controlBounds = await controls.boundingBox();
  expect(noticeBounds).not.toBeNull();
  expect(controlBounds).not.toBeNull();
  expect(controlBounds!.y + controlBounds!.height).toBeLessThanOrEqual(noticeBounds!.y);
});
