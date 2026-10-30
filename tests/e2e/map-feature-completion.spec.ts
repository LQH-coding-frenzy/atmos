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

test('loads bounded AQI point samples and confirms arbitrary map coordinates before selection', async ({
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

  const placePreview = page.getByRole('region', { name: /Weather preview for/ });
  await expect(placePreview).toBeVisible();
  await expect(placePreview).toContainText('Selected map point');
  await expect(page.getByRole('button', { name: 'Use this location' })).toBeEnabled();
  await expect.poll(() => coordinateQueries.length).toBe(1);
  expect(coordinateQueries[0]!.latitude).toBeGreaterThanOrEqual(-90);
  expect(coordinateQueries[0]!.latitude).toBeLessThanOrEqual(90);
  expect(coordinateQueries[0]!.longitude).toBeGreaterThanOrEqual(-180);
  expect(coordinateQueries[0]!.longitude).toBeLessThanOrEqual(180);
  expect(searchRequests).toBe(0);

  await page.getByRole('button', { name: 'Use this location' }).click();
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
