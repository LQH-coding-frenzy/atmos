import { expect, test } from '@playwright/test';

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
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close navigation' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
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
  await page.getByText('Air quality', { exact: true }).click();

  await expect(page.locator('.aqi-index').nth(0)).toContainText('42');
  await expect(page.locator('.aqi-index').nth(0)).toContainText('Good');
  await expect(page.locator('.aqi-index').nth(1)).toContainText('18');
  await expect(page.getByText('7.2 µg/m³', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open-Meteo Air Quality API' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'CAMS ENSEMBLE' })).toBeVisible();
  expect(new URL(requestedUrl).searchParams.get('lat')).toBe('52.52');
  expect(new URL(requestedUrl).searchParams.get('lon')).toBe('13.405');
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
  await page.route('**/api/v1/weather/dashboard?**', async (route) => {
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
});

test('authenticates, saves the current place, and switches to an API-returned saved place', async ({
  page,
}) => {
  const paris = {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Paris',
    latitude: 48.8534,
    longitude: 2.3488,
    created_at: '2026-09-27T10:00:00.000Z',
    updated_at: '2026-09-27T10:00:00.000Z',
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
      };
      await route.fulfill({ status: 201, json: { location: savedBerlin } });
      return;
    }
    await route.fulfill({ json: { locations: [paris, ...(savedBerlin ? [savedBerlin] : [])] } });
  });
  await page.route('**/api/v1/weather/dashboard?**', async (route) => {
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
        schedule: {
          weekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
          cooldownMinutes: 60,
        },
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
  await page.getByText('Saved places', { exact: true }).click();
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill('safe-example-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText(user.email, { exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Your saved places' })).toContainText('Paris');
  expect(forwardedAuthorization).toBe(`Bearer ${accessToken}`);

  await page.getByRole('button', { name: 'Save Berlin' }).click();
  await expect(page.locator('.saved-location-status')).toContainText('Berlin saved to your places');
  expect(postedLocation).toEqual({ name: 'Berlin', latitude: 52.52, longitude: 13.405 });
  expect(forwardedAuthorization).toBe(`Bearer ${accessToken}`);

  await page
    .getByRole('list', { name: 'Your saved places' })
    .getByRole('button', { name: 'Paris' })
    .click();
  await expect(page.locator('.location-name')).toHaveText('Paris');
  await expect(page).toHaveURL('/');

  await page.getByText('History', { exact: true }).click();
  await page.getByRole('button', { name: 'Record this observation' }).click();
  await expect(page.locator('.weather-history-status')).toContainText('recorded.');
  await expect(page.getByRole('list', { name: 'Recorded observations' })).toContainText('20 deg');
  expect(postedObservation).toMatchObject({
    latitude: 48.8534,
    longitude: 2.3488,
    observed_at: '2026-09-01T10:00:00.000Z',
    location_name: 'Paris',
    temperatureC: 20,
  });
  expect(historyAuthorization).toBe(`Bearer ${accessToken}`);

  await page.getByRole('button', { name: /Delete observation from/ }).click();
  await expect(page.locator('.weather-history-status')).toContainText('Observation deleted.');
  await expect(page.getByRole('list', { name: 'Recorded observations' })).toHaveCount(0);
  expect(deleteAuthorization).toBe(`Bearer ${accessToken}`);
  expect(deletedSnapshotId).toBe('00000000-0000-4000-8000-000000000030');

  await page.getByText('Alerts', { exact: true }).click();
  await page.getByLabel('Threshold').fill('18');
  await page.getByRole('button', { name: 'Add in-app rule' }).click();
  await expect(page.locator('.in-app-alert-status')).toHaveText('Matches current forecast');
  await expect(page.getByRole('list', { name: 'Your alert rules' })).toContainText(
    'Temperature above 18°C',
  );
  expect(savedAlertRule).toMatchObject({ notification_channels: ['in-app'], enabled: true });
  expect(alertAuthorization).toBe(`Bearer ${accessToken}`);

  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.locator('.in-app-alert-status')).toHaveText('Paused');
  await page.getByRole('button', { name: /Delete alert/ }).click();
  await expect(page.locator('.in-app-alerts-status')).toContainText('Alert rule deleted');
  await expect(page.getByRole('list', { name: 'Your alert rules' })).toHaveCount(0);
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
  await page.getByText('Saved places', { exact: true }).click();
  await page.getByRole('button', { name: 'Need an account? Create one' }).click();
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill('safe-example-password');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.locator('.saved-location-status')).toContainText(
    'check your email to confirm it',
  );
  await expect(page.getByText(user.email, { exact: true })).toHaveCount(0);
});
