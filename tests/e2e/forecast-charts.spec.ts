import { expect, test } from '@playwright/test';

test('explores weather chart series and hourly, seven-day and sixteen-day ranges', async ({
  page,
}) => {
  let weatherRequests = 0;
  const extendedDaily = Array.from({ length: 16 }, (_, index) => ({
    date: `2026-09-${String(index + 1).padStart(2, '0')}`,
    highC: 20 + index,
    lowC: 10 + index,
    precipitationProbability: index === 15 ? null : index * 5,
    condition: index > 8 ? 'rain' : 'partly-cloudy',
    apparentTemperatureMaxC: 18 + index,
    humidityMeanPercent: 55 + index,
    pressureMeanHpa: 1010 - index / 2,
    precipitationMm: index === 3 ? null : index * 1.25,
    rainMm: index === 3 ? null : index,
    snowfallCm: 0,
    uvIndexMax: index / 2,
    windSpeedMaxKph: 10 + index,
    windGustMaxKph: 15 + index,
    cloudCoverMeanPercent: index * 5,
    visibilityMeanM: 10000 - index * 100,
    sunrise: `2026-09-${String(index + 1).padStart(2, '0')}T05:00:00.000Z`,
    sunset: `2026-09-${String(index + 1).padStart(2, '0')}T18:00:00.000Z`,
    daylightSeconds: 46800,
  }));
  const hourly = Array.from({ length: 12 }, (_, index) => ({
    time: new Date(Date.parse('2026-09-01T10:00:00Z') + index * 3600000).toISOString(),
    temperatureC: 15 + index,
    apparentTemperatureC: 14 + index,
    humidityPercent: 50 + index,
    pressureHpa: 1012 - index / 10,
    windSpeedKph: 10 + index,
    windGustKph: 18 + index,
    precipitationProbability: index * 8,
    condition: index > 7 ? 'rain' : 'partly-cloudy',
    precipitationMm: index === 4 ? null : index / 10,
    rainMm: index === 4 ? null : index / 20,
    snowfallCm: 0,
    uvIndex: index / 2,
    visibilityM: 12000 - index * 250,
    cloudCoverPercent: index * 8,
    isDay: index > 1,
  }));
  const payload = {
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
      condition: 'partly-cloudy',
    },
    hourly,
    daily: extendedDaily.slice(0, 7),
    extendedDaily,
    meta: {
      provider: 'open-meteo',
      cached: false,
      stale: false,
      updatedAt: '2026-09-01T10:00:00.000Z',
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
    weatherRequests++;
    await route.fulfill({ json: payload, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Refresh weather' }).click();
  await expect.poll(() => weatherRequests).toBe(1);
  await expect(page.locator('.hero-temperature')).toContainText('20');
  await expect(page.locator('.forecast-row').first()).toContainText('20°');
  const chart = page.getByRole('img', { name: 'Temperature, 7d weather chart' });
  await expect(chart).toBeVisible();
  await expect(page.locator('.forecast-chart-summary')).toContainText('Low 20 °C · High 26 °C');
  const metric = page.getByLabel('Chart metric');
  await metric.selectOption('humidity');
  await expect(page.getByRole('img', { name: 'Humidity, 7d weather chart' })).toBeVisible();
  await expect(page.locator('.forecast-chart-data')).toContainText('61 %');
  await metric.selectOption('precipitation');
  await expect(page.getByRole('img', { name: 'Precipitation, 7d weather chart' })).toBeVisible();
  await expect(page.locator('.forecast-chart-data')).toContainText('Unavailable');

  const range = page.getByRole('group', { name: 'Chart time range' });
  await range.getByRole('button', { name: 'Next 12 hours' }).click();
  await expect(page.getByRole('img', { name: 'Precipitation, 12h weather chart' })).toBeVisible();
  await expect(page.locator('.forecast-chart-data table tbody tr')).toHaveCount(12);
  await expect(page.locator('.forecast-trend-chart svg')).toBeVisible();
  await metric.selectOption('accumulated-rainfall').catch(() => {});
  await expect(metric).toHaveValue('precipitation');

  await range.getByRole('button', { name: '16 days' }).click();
  await metric.selectOption('accumulated-rainfall');
  await expect(
    page.getByRole('img', { name: 'Accumulated rainfall, 16d weather chart' }),
  ).toBeVisible();
  await expect(page.locator('.forecast-chart-summary')).toContainText('High 3 mm');
  await expect(page.locator('.forecast-trend-chart')).toHaveAttribute('aria-describedby');
  expect(weatherRequests).toBe(1);

  await page.setViewportSize({ width: 320, height: 740 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
  await page.locator('.overview-card').scrollIntoViewIfNeeded();
  await page.locator('.overview-card').screenshot({
    path: 'C:/Users/jach9/AppData/Local/Temp/opencode/forecast-chart-mobile-detail.png',
  });
  await page.screenshot({
    path: 'C:/Users/jach9/AppData/Local/Temp/opencode/forecast-chart-mobile.png',
  });
});
