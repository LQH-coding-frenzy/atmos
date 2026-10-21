import { expect, test } from '@playwright/test';

function warningResponse(overrides: Record<string, unknown> = {}) {
  return {
    coverage: 'supported',
    source: 'nws',
    alerts: [
      {
        id: 'https://api.weather.gov/alerts/urn:oid:2.49.0.1.840.0.fixture',
        event: 'Tornado Warning',
        headline: 'Tornado Warning issued for District A',
        severity: 'Extreme',
        urgency: 'Immediate',
        certainty: 'Observed',
        area: 'District A; District B',
        publishedAt: '2026-10-19T14:00:00+00:00',
        effectiveAt: '2026-10-19T14:00:00+00:00',
        onsetAt: null,
        expiresAt: '2026-10-19T14:45:00+00:00',
        endsAt: null,
        description:
          'Fixture: seek shelter immediately.\n\nThis is source text from a test fixture.',
        instruction: 'Move to a sturdy shelter now.',
        sourceUrl: 'https://api.weather.gov/alerts/urn:oid:2.49.0.1.840.0.fixture',
      },
    ],
    meta: {
      checkedAt: '2026-10-19T14:00:00.000Z',
      cached: false,
      stale: false,
      truncated: false,
    },
    ...overrides,
  };
}

async function openOfficialAlerts(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Open weather tools' }).click();
  const dialog = page.getByRole('dialog', { name: 'Weather tools' });
  await dialog
    .locator('.tool-list > details > summary')
    .filter({ hasText: 'Official alerts' })
    .click();
  return dialog;
}

test('fetches official warning data only on demand and preserves source content', async ({
  page,
}) => {
  const requests: string[] = [];
  const requestBodies: Array<Record<string, unknown>> = [];
  await page.route('**/api/v1/weather/warnings', async (route) => {
    requests.push(route.request().url());
    requestBodies.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ json: warningResponse() });
  });

  await page.goto('/');
  expect(requests).toHaveLength(0);
  const dialog = await openOfficialAlerts(page);
  await expect(
    dialog.getByRole('heading', { name: 'Tornado Warning issued for District A' }),
  ).toBeVisible();
  await expect(dialog.locator('.severe-weather-description')).toContainText(
    'Fixture: seek shelter immediately.',
  );
  await expect(dialog.locator('.severe-weather-instruction')).toHaveText(
    'Move to a sturdy shelter now.',
  );
  await expect(dialog.locator('.severe-weather-area')).toHaveText('District A; District B');
  await expect(dialog.locator('.severe-weather-alert-context')).toHaveText(
    'Urgency: Immediate · Certainty: Observed',
  );
  await expect(dialog.locator('.severe-weather-times')).toContainText('Published');
  await expect(dialog.getByRole('link', { name: 'View original alert' })).toHaveAttribute(
    'href',
    'https://api.weather.gov/alerts/urn:oid:2.49.0.1.840.0.fixture',
  );
  expect(new URL(requests[0]!).pathname).toBe('/api/v1/weather/warnings');
  expect(requestBodies[0]).toMatchObject({
    country: 'Germany',
    latitude: 52.52,
    longitude: 13.405,
  });

  await page.setViewportSize({ width: 320, height: 740 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await expect(dialog.locator('.severe-weather-attribution')).toContainText(
    'not an emergency-alert service',
  );
});

test('makes unsupported coverage distinct from an empty warning list', async ({ page }) => {
  await page.route('**/api/v1/weather/warnings', async (route) =>
    route.fulfill({
      json: warningResponse({ coverage: 'unsupported', source: null, alerts: [] }),
    }),
  );

  await page.goto('/');
  const dialog = await openOfficialAlerts(page);

  await expect(dialog.locator('.severe-weather-unsupported')).toContainText(
    'This is not a “no alerts” result.',
  );
  await expect(dialog.locator('.severe-weather-empty')).toHaveCount(0);
});

test('shows a recoverable failure without implying there are no alerts', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/v1/weather/warnings', async (route) => {
    calls += 1;
    if (calls === 1) {
      await route.fulfill({ status: 503, json: { error: { code: 'WARNINGS_UNAVAILABLE' } } });
      return;
    }
    await route.fulfill({
      json: warningResponse({ alerts: [] }),
    });
  });

  await page.goto('/');
  const dialog = await openOfficialAlerts(page);
  await expect(dialog.locator('.severe-weather-error')).toContainText(
    'This does not mean there are no active alerts.',
  );
  await dialog.getByRole('button', { name: 'Check again' }).click();
  await expect(dialog.locator('.severe-weather-empty')).toContainText(
    'No active alerts are currently reported',
  );
  expect(calls).toBe(2);
});
