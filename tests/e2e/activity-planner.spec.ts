import { expect, test } from '@playwright/test';

const forecast = {
  location: {
    id: 'planner-demo',
    name: 'Planner Demo',
    country: 'Test',
    latitude: 52.52,
    longitude: 13.405,
    timezone: 'UTC',
  },
  current: {
    observedAt: '2026-10-18T09:00:00.000Z',
    temperatureC: 18,
    apparentTemperatureC: 18,
    humidityPercent: 50,
    windSpeedKph: 10,
    pressureHpa: 1012,
    condition: 'partly-cloudy',
  },
  hourly: [
    {
      time: '2026-10-18T10:00:00.000Z',
      temperatureC: 18,
      apparentTemperatureC: 18,
      humidityPercent: 50,
      precipitationProbability: 10,
      precipitationMm: 0.1,
      windSpeedKph: 10,
      windGustKph: 12,
      uvIndex: 2,
      condition: 'partly-cloudy',
    },
    {
      time: '2026-10-18T11:00:00.000Z',
      temperatureC: 18,
      apparentTemperatureC: 18,
      humidityPercent: 50,
      precipitationProbability: 10,
      precipitationMm: 0.1,
      windSpeedKph: 10,
      windGustKph: 12,
      uvIndex: 2,
      condition: 'partly-cloudy',
    },
  ],
  daily: [
    {
      date: '2026-10-18',
      highC: 20,
      lowC: 12,
      precipitationProbability: 10,
      condition: 'partly-cloudy',
      sunrise: '2026-10-18T06:00:00.000Z',
      sunset: '2026-10-18T17:00:00.000Z',
      daylightSeconds: 39600,
    },
  ],
  meta: {
    provider: 'open-meteo',
    cached: false,
    stale: false,
    updatedAt: '2026-10-18T09:00:00.000Z',
  },
};

const pollutants = {
  pm25: 5,
  pm10: 10,
  carbonMonoxide: 100,
  nitrogenDioxide: 3,
  sulphurDioxide: 1,
  ozone: 45,
};

test('offers all activity profiles, session-local custom thresholds, and opt-in AQI scoring', async ({
  page,
}, testInfo) => {
  let weatherRequests = 0;
  const aqiRequests: Array<Record<string, unknown>> = [];
  await page.route('**/api/public/v1/weather/dashboard', async (route) => {
    weatherRequests += 1;
    await route.fulfill({ json: forecast });
  });
  await page.route('**/api/public/v1/weather/air-quality', async (route) => {
    aqiRequests.push(route.request().postDataJSON());
    await route.fulfill({
      json: {
        observedAt: '2026-10-18T09:00:00.000Z',
        usAqi: 25,
        europeanAqi: 18,
        pollutants,
        timeline: {
          kind: 'model',
          requestedPastDays: 7,
          requestedForecastDays: 5,
          hours: [
            {
              time: '2026-10-18T10:00:00.000Z',
              usAqi: 25,
              europeanAqi: 18,
              pollutants,
            },
            {
              time: '2026-10-18T11:00:00.000Z',
              usAqi: 200,
              europeanAqi: 80,
              pollutants,
            },
          ],
        },
        meta: {
          provider: 'open-meteo',
          cached: false,
          stale: false,
          updatedAt: '2026-10-18T09:02:00.000Z',
        },
      },
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Refresh weather' }).click();
  const planner = page.locator('#activities');
  await expect(planner).toContainText('Best upcoming Running window');
  const profilePicker = planner.getByLabel('Activity profile');
  await expect(profilePicker.locator('option')).toHaveCount(10);
  expect(weatherRequests).toBe(1);
  expect(aqiRequests).toHaveLength(0);

  await profilePicker.selectOption('football');
  await expect(planner.locator('.planner-summary')).toContainText('Football');
  await profilePicker.selectOption('custom');
  await expect(planner.getByLabel('Profile name')).toBeVisible();
  await planner.getByLabel('Profile name').fill('Garden work');
  await planner.getByLabel('Maximum rain chance (%)').fill('100');
  await expect(planner.locator('.planner-summary')).toContainText('Garden work');
  const tolerantScore = Number(
    (await planner.locator('.planner-summary strong').textContent())?.split('/')[0],
  );
  await planner.getByLabel('Maximum rain chance (%)').fill('1');
  await expect
    .poll(async () =>
      Number((await planner.locator('.planner-summary strong').textContent())?.split('/')[0]),
    )
    .toBeLessThan(tolerantScore);
  await expect(planner).toContainText('AQI');
  await expect(planner).toContainText('coverage');

  await planner.getByRole('button', { name: 'Load AQI forecast (optional)' }).click();
  await expect(planner).toContainText('Modeled U.S. AQI is included');
  await expect(planner).toContainText('Not station readings.');
  expect(aqiRequests).toHaveLength(1);
  expect(aqiRequests[0]).toMatchObject({
    includeTimeline: true,
    latitude: 52.52,
    longitude: 13.405,
  });
  await expect(planner.locator('.planner-summary')).toContainText('100% input coverage');
  await planner.locator('.planner-window-details').first().locator('summary').click();
  await expect(planner.locator('.planner-window-details').first()).toContainText(
    'Modeled U.S. AQI',
  );
  await expect(planner).toContainText('not safety advice');
  if (!process.env.CI) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await planner.screenshot({ path: testInfo.outputPath('activity-planner-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileTitle = await planner
      .getByRole('heading', { name: 'Find your window.' })
      .boundingBox();
    expect(mobileTitle?.width).toBeGreaterThan(250);
    await planner.screenshot({ path: testInfo.outputPath('activity-planner-mobile.png') });
  }
  await page.setViewportSize({ width: 320, height: 740 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
});
