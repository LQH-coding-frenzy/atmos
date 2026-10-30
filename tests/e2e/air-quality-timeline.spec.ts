import { expect, test, type Page } from '@playwright/test';

function fixture(timeline = true, stale = false, empty = false) {
  const pollutants = {
    pm25: 7.2,
    pm10: 12.4,
    carbonMonoxide: 120,
    nitrogenDioxide: 4.3,
    sulphurDioxide: 1.1,
    ozone: 65,
  };
  return {
    observedAt: '2026-10-08T10:00:00.000Z',
    usAqi: 42,
    europeanAqi: 18,
    pollutants,
    ...(timeline
      ? {
          timeline: {
            kind: 'model',
            requestedPastDays: 7,
            requestedForecastDays: 5,
            hours: Array.from({ length: 6 }, (_, index) => ({
              time: `2026-10-08T${String(index + 8).padStart(2, '0')}:00:00.000Z`,
              usAqi: empty || index === 4 ? null : 40 + index,
              europeanAqi: empty ? null : 18,
              pollutants: empty
                ? Object.fromEntries(Object.keys(pollutants).map((key) => [key, null]))
                : pollutants,
            })),
          },
        }
      : {}),
    meta: { provider: 'open-meteo', cached: stale, stale, updatedAt: '2026-10-08T10:02:00.000Z' },
  };
}
async function openAirQuality(page: Page) {
  await page.getByRole('button', { name: 'Open weather tools' }).click();
  await page.locator('.air-quality-panel > summary').click();
  await expect(page.locator('.aqi-index').first()).toContainText('42');
}

test('loads AQI timelines only on request and switches period, range and metric without refetching', async ({
  page,
}) => {
  let currentCalls = 0,
    timelineCalls = 0;
  await page.route('**/api/public/v1/weather/air-quality', async (route) => {
    const request = route.request();
    const headers = request.headers();
    expect(headers['content-type']).toBe('application/json');
    expect(headers.origin).toBe(new URL(request.url()).origin);
    const timeline = request.postDataJSON().includeTimeline === true;
    if (timeline) timelineCalls++;
    else currentCalls++;
    await route.fulfill({ json: fixture(timeline) });
  });
  await page.goto('/');
  expect(currentCalls).toBe(0);
  expect(timelineCalls).toBe(0);
  await openAirQuality(page);
  expect(currentCalls).toBe(1);
  expect(timelineCalls).toBe(0);
  await page.getByRole('button', { name: 'Explore AQI forecast and history' }).click();
  const timeline = page.getByRole('region', { name: 'Air quality over time' });
  await expect(timeline.getByRole('img', { name: /U.S. AQI forecast chart/ })).toBeVisible();
  await expect(timeline).toContainText('3/4 hourly values available.');
  await expect(timeline).toContainText('not ground-station observations');
  await timeline.getByText('Exact hourly values', { exact: true }).click();
  await expect(timeline.getByRole('table')).toContainText('Unavailable');
  await timeline.getByRole('button', { name: 'Past model data', exact: true }).click();
  await expect(timeline.getByRole('img', { name: /past model chart/ })).toBeVisible();
  await expect(timeline).toContainText('2/2 hourly values available.');
  await timeline.getByLabel('Measurement', { exact: true }).selectOption('pm25');
  await timeline.getByLabel('Range', { exact: true }).selectOption('full');
  await expect(timeline.getByRole('table')).toContainText('PM2.5 (µg/m³)');
  expect(timelineCalls).toBe(1);
  await page.setViewportSize({ width: 320, height: 740 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Close weather tools' }).click();
  await expect(timeline).not.toBeVisible();
  await openAirQuality(page);
  await expect(
    page.getByRole('button', { name: 'Explore AQI forecast and history' }),
  ).toBeVisible();
  expect(timelineCalls).toBe(1);
});

test('preserves current AQI after a timeline failure and retries with a visibly stale model timeline', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/api/public/v1/weather/air-quality', async (route) => {
    if (route.request().postDataJSON().includeTimeline !== true)
      return route.fulfill({ json: fixture(false) });
    calls++;
    if (calls === 1)
      return route.fulfill({ status: 503, json: { error: { code: 'AIR_QUALITY_UNAVAILABLE' } } });
    await route.fulfill({ json: fixture(true, true) });
  });
  await page.goto('/');
  await openAirQuality(page);
  await page.getByRole('button', { name: 'Explore AQI forecast and history' }).click();
  await expect(page.getByRole('region', { name: 'Air quality over time' })).toContainText(
    'could not be loaded',
  );
  await expect(page.locator('.aqi-index').first()).toContainText('42');
  await page.getByRole('button', { name: 'Retry AQI timeline' }).click();
  await expect(page.getByRole('region', { name: 'Air quality over time' })).toContainText(
    'Cached model timeline',
  );
  await expect(page.getByRole('img', { name: /U.S. AQI forecast chart/ })).toBeVisible();
  expect(calls).toBe(2);
});

test('handles current-only legacy servers without inventing a forecast', async ({ page }) => {
  await page.route('**/api/public/v1/weather/air-quality', async (route) =>
    route.fulfill({ json: fixture(false) }),
  );
  await page.goto('/');
  await openAirQuality(page);
  await page.getByRole('button', { name: 'Explore AQI forecast and history' }).click();
  const timeline = page.getByRole('region', { name: 'Air quality over time' });
  await expect(timeline).toContainText('unavailable in this server response');
  await expect(timeline.getByRole('img')).toHaveCount(0);
  await expect(page.locator('.aqi-index').first()).toContainText('42');
});

test('represents an entirely missing model range as unavailable rather than a zero-valued chart', async ({
  page,
}) => {
  await page.route('**/api/public/v1/weather/air-quality', async (route) =>
    route.fulfill({ json: fixture(true, false, true) }),
  );
  await page.goto('/');
  await openAirQuality(page);
  await page.getByRole('button', { name: 'Explore AQI forecast and history' }).click();
  const timeline = page.getByRole('region', { name: 'Air quality over time' });
  await expect(timeline).toContainText('No usable U.S. AQI model values in this range');
  await expect(timeline.getByRole('img')).toHaveCount(0);
  await timeline.getByText('Exact hourly values', { exact: true }).click();
  await expect(timeline.getByRole('table')).toContainText('Unavailable');
});

test('cancels hidden timeline work and prevents a late response from replacing a newer request', async ({
  page,
}) => {
  let calls = 0;
  let releaseFirst: (() => Promise<void>) | undefined;
  await page.route('**/api/public/v1/weather/air-quality', async (route) => {
    if (route.request().postDataJSON().includeTimeline !== true)
      return route.fulfill({ json: fixture(false) });
    calls++;
    if (calls === 1) {
      await new Promise<void>((resolve) => {
        releaseFirst = async () => {
          try {
            await route.fulfill({ json: fixture(true) });
          } catch {
            /* The hidden request was aborted. */
          }
          resolve();
        };
      });
      return;
    }
    const fresh = fixture(true);
    fresh.timeline!.hours = fresh.timeline!.hours.map((hour) => ({ ...hour, usAqi: 99 }));
    await route.fulfill({ json: fresh });
  });
  try {
    await page.goto('/');
    await openAirQuality(page);
    await page.getByRole('button', { name: 'Explore AQI forecast and history' }).click();
    await expect.poll(() => calls).toBe(1);
    await page.getByRole('button', { name: 'Hide forecast and history' }).click();
    await expect(page.getByRole('region', { name: 'Air quality over time' })).not.toBeVisible();
    await page.getByRole('button', { name: 'Explore AQI forecast and history' }).click();
    await expect(page.locator('.aqi-timeline-summary')).toContainText('low 99, high 99');
    await releaseFirst?.();
    await expect(page.locator('.aqi-timeline-summary')).toContainText('low 99, high 99');
    expect(calls).toBe(2);
  } finally {
    await releaseFirst?.();
  }
});
