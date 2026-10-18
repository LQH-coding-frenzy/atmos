import { expect, test } from '@playwright/test';

const cities = [
  {
    id: 'potsdam-de',
    name: 'Potsdam',
    country: 'Germany',
    latitude: 52.401,
    longitude: 13.0593,
    timezone: 'Europe/Berlin',
  },
  {
    id: 'munich-de',
    name: 'Munich',
    country: 'Germany',
    latitude: 48.137,
    longitude: 11.575,
    timezone: 'Europe/Berlin',
  },
  {
    id: 'hamburg-de',
    name: 'Hamburg',
    country: 'Germany',
    latitude: 53.551,
    longitude: 9.993,
    timezone: 'Europe/Berlin',
  },
  {
    id: 'paris-fr',
    name: 'Paris',
    country: 'France',
    latitude: 48.853,
    longitude: 2.349,
    timezone: 'Europe/Paris',
  },
];

const cityWeather: Record<
  string,
  {
    temperatureC: number;
    apparentTemperatureC: number;
    humidityPercent: number;
    precipitationProbability: number;
    precipitationMm: number;
    windSpeedKph: number;
    windGustKph: number;
    uvIndex: number;
    condition: string;
  }
> = {
  berlin: {
    temperatureC: 20,
    apparentTemperatureC: 20,
    humidityPercent: 45,
    precipitationProbability: 5,
    precipitationMm: 0.1,
    windSpeedKph: 8,
    windGustKph: 12,
    uvIndex: 1,
    condition: 'clear',
  },
  potsdam: {
    temperatureC: 18,
    apparentTemperatureC: 18,
    humidityPercent: 50,
    precipitationProbability: 15,
    precipitationMm: 0.2,
    windSpeedKph: 10,
    windGustKph: 14,
    uvIndex: 2,
    condition: 'partly-cloudy',
  },
  munich: {
    temperatureC: 31,
    apparentTemperatureC: 32,
    humidityPercent: 90,
    precipitationProbability: 80,
    precipitationMm: 4,
    windSpeedKph: 40,
    windGustKph: 60,
    uvIndex: 9,
    condition: 'rain',
  },
  hamburg: {
    temperatureC: 18,
    apparentTemperatureC: 18,
    humidityPercent: 60,
    precipitationProbability: 10,
    precipitationMm: 0.1,
    windSpeedKph: 12,
    windGustKph: 16,
    uvIndex: 3,
    condition: 'cloudy',
  },
};

function comparisonDashboard(
  place:
    | (typeof cities)[number]
    | {
        id: string;
        name: string;
        country: string;
        latitude: number;
        longitude: number;
        timezone: string;
      },
  weather: (typeof cityWeather)[string],
) {
  const forecastTime = '2026-10-18T11:00:00.000Z';
  return {
    location: place,
    current: {
      observedAt: '2026-10-18T10:00:00.000Z',
      temperatureC: weather.temperatureC,
      apparentTemperatureC: weather.apparentTemperatureC,
      humidityPercent: weather.humidityPercent,
      windSpeedKph: weather.windSpeedKph,
      windGustKph: weather.windGustKph,
      pressureHpa: 1012,
      condition: weather.condition,
    },
    hourly: [
      {
        time: forecastTime,
        temperatureC: weather.temperatureC,
        apparentTemperatureC: weather.apparentTemperatureC,
        humidityPercent: weather.humidityPercent,
        precipitationProbability: weather.precipitationProbability,
        precipitationMm: weather.precipitationMm,
        windSpeedKph: weather.windSpeedKph,
        windGustKph: weather.windGustKph,
        uvIndex: weather.uvIndex,
        condition: weather.condition,
      },
    ],
    daily: [
      {
        date: '2026-10-18',
        highC: weather.temperatureC + 2,
        lowC: weather.temperatureC - 4,
        precipitationProbability: weather.precipitationProbability,
        condition: weather.condition,
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

test('compares a bounded set of cities with expanded metrics and opt-in AQI suitability', async ({
  page,
}, testInfo) => {
  const weatherRequests: string[] = [];
  const aqiRequests: string[] = [];
  let activeAqiRequests = 0;
  let maximumActiveAqiRequests = 0;

  await page.route('**/api/v1/locations/search?**', async (route) => {
    const query = new URL(route.request().url()).searchParams.get('q')?.toLowerCase() ?? '';
    await route.fulfill({
      json: { results: cities.filter((city) => city.name.toLowerCase().includes(query)) },
    });
  });
  await page.route('**/api/v1/weather/dashboard?**', async (route) => {
    weatherRequests.push(route.request().url());
    const params = new URL(route.request().url()).searchParams;
    const latitude = Number(params.get('lat'));
    const longitude = Number(params.get('lon'));
    const place = cities.find(
      (city) => city.latitude === latitude && city.longitude === longitude,
    ) ?? {
      id: 'berlin-de',
      name: 'Berlin',
      country: 'Germany',
      latitude,
      longitude,
      timezone: 'Europe/Berlin',
    };
    const key = place.id === 'berlin-de' ? 'berlin' : place.name.toLowerCase();
    await route.fulfill({
      json: comparisonDashboard(place, cityWeather[key] ?? cityWeather.berlin!),
    });
  });
  await page.route('**/api/v1/weather/air-quality?**', async (route) => {
    aqiRequests.push(route.request().url());
    activeAqiRequests += 1;
    maximumActiveAqiRequests = Math.max(maximumActiveAqiRequests, activeAqiRequests);
    await new Promise((resolve) => setTimeout(resolve, 25));
    const params = new URL(route.request().url()).searchParams;
    const city = cities.find(
      (item) =>
        item.latitude === Number(params.get('lat')) && item.longitude === Number(params.get('lon')),
    );
    const usAqi = city?.id === 'munich-de' ? 200 : city?.id === 'hamburg-de' ? 75 : 35;
    try {
      await route.fulfill({
        json: {
          observedAt: '2026-10-18T10:00:00.000Z',
          usAqi,
          europeanAqi: 18,
          pollutants: {
            pm25: 5,
            pm10: 10,
            carbonMonoxide: 100,
            nitrogenDioxide: 3,
            sulphurDioxide: 1,
            ozone: 45,
          },
          timeline: {
            kind: 'model',
            requestedPastDays: 7,
            requestedForecastDays: 5,
            hours: [
              {
                time: '2026-10-18T11:00:00.000Z',
                usAqi,
                europeanAqi: 18,
                pollutants: {
                  pm25: 5,
                  pm10: 10,
                  carbonMonoxide: 100,
                  nitrogenDioxide: 3,
                  sulphurDioxide: 1,
                  ozone: 45,
                },
              },
            ],
          },
          meta: {
            provider: 'open-meteo',
            cached: false,
            stale: false,
            updatedAt: '2026-10-18T10:02:00.000Z',
          },
        },
      });
    } finally {
      activeAqiRequests -= 1;
    }
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Refresh weather' }).click();
  const tools = page.getByRole('dialog', { name: 'Weather tools' });
  await page.getByRole('button', { name: 'Open weather tools' }).click();
  const comparisonSummary = tools
    .locator('.tool-list > details > summary')
    .filter({ hasText: 'Compare cities' });
  await comparisonSummary.click();
  const searchInput = page.getByLabel('Search for a city to compare');

  for (const [index, name] of ['Potsdam', 'Munich', 'Hamburg'].entries()) {
    const requestsBeforeSearch = weatherRequests.length;
    await searchInput.fill(name);
    await page.getByRole('button', { name: 'Search comparison cities' }).click();
    const resultButton = page
      .getByRole('list', { name: 'Comparison city results' })
      .getByRole('button', { name: new RegExp(name) });
    await expect(resultButton).toBeVisible();
    expect(weatherRequests).toHaveLength(requestsBeforeSearch);
    await resultButton.click();
    await expect.poll(() => weatherRequests.length).toBe(requestsBeforeSearch + 1);
    await expect(page.locator('.weather-comparison-city')).toHaveCount(index + 2);
  }

  const comparisonResult = page.getByRole('list', { name: 'Comparison city results' });
  await searchInput.fill('Paris');
  await page.getByRole('button', { name: 'Search comparison cities' }).click();
  const parisResult = comparisonResult.getByRole('button', { name: /Paris/ });
  await expect(parisResult).toBeDisabled();
  await expect(
    page.getByText('Three destination limit reached. Remove a city before adding another.'),
  ).toBeVisible();
  expect(aqiRequests).toHaveLength(0);

  const ranking = page.getByRole('list', { name: 'Ranked city comparison' });
  await expect(ranking.locator('.weather-comparison-city')).toHaveCount(4);
  await expect(ranking).toContainText('Next-hour precipitation');
  await expect(ranking).toContainText('Next-hour UV');
  await expect(ranking).toContainText('Running fit');
  await page.getByLabel('Activity suitability profile').selectOption('cycling');
  await expect(
    page.getByText('4 places ranked by Cycling fit; scroll to review every city.'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Load AQI for comparison' }).click();
  await expect(page.getByText('AQI loaded for all places')).toBeVisible();
  expect(aqiRequests).toHaveLength(4);
  expect(maximumActiveAqiRequests).toBeLessThanOrEqual(2);
  await expect(ranking).toContainText('U.S. AQI');
  await expect(ranking).toContainText('European AQI');
  await expect(ranking).toContainText('Coverage 100%');
  await expect(page.getByRole('link', { name: 'CC BY 4.0' })).toBeVisible();
  await expect(
    ranking.locator('.weather-comparison-city').nth(3).getByRole('heading', { name: 'Munich' }),
  ).toBeVisible();
  await expect(ranking.locator('.weather-comparison-city').nth(3)).toContainText('200');
  if (!process.env.CI) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('.weather-comparison-popover').screenshot({
      path: testInfo.outputPath('weather-comparison-desktop.png'),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.weather-comparison-popover').screenshot({
      path: testInfo.outputPath('weather-comparison-mobile.png'),
    });
  }
  await page.setViewportSize({ width: 320, height: 740 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
});
