import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AirQuality, AirQualityInput, Dashboard, LocationInput } from '@atmos/contracts';
import { createWeatherRouteHandlers } from './weather-route-handlers';

const dashboard: Dashboard = {
  location: {
    id: 'berlin-de',
    name: 'Berlin',
    country: 'Germany',
    latitude: 52.52,
    longitude: 13.405,
    timezone: 'Europe/Berlin',
  },
  current: {
    observedAt: '2026-10-23T10:00:00.000Z',
    temperatureC: 20,
    apparentTemperatureC: 19,
    humidityPercent: 64,
    windSpeedKph: 13,
    pressureHpa: 1017,
    condition: 'partly-cloudy',
  },
  hourly: [
    {
      time: '2026-10-23T11:00:00.000Z',
      temperatureC: 21,
      precipitationProbability: 5,
      condition: 'clear',
    },
  ],
  daily: [
    {
      date: '2026-10-24',
      highC: 22,
      lowC: 15,
      precipitationProbability: 10,
      condition: 'clear',
    },
  ],
  meta: {
    provider: 'open-meteo',
    cached: false,
    stale: false,
    updatedAt: '2026-10-23T10:00:00.000Z',
  },
};

const airQuality: AirQuality = {
  observedAt: '2026-10-23T10:00:00.000Z',
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
  timeline: {
    kind: 'model',
    requestedPastDays: 7,
    requestedForecastDays: 5,
    hours: [
      {
        time: '2026-10-23T10:00:00.000Z',
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
      },
    ],
  },
  meta: {
    provider: 'open-meteo',
    cached: false,
    stale: false,
    updatedAt: '2026-10-23T10:00:00.000Z',
  },
};

const serviceToken = 'test-only-'.repeat(4);

function post(body: string, requestId = 'weather_route_test-1', authorizationToken = serviceToken) {
  return new Request('https://rainify.dpdns.org/api/v1/weather/dashboard', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': requestId,
      ...(authorizationToken ? { authorization: `Bearer ${authorizationToken}` } : {}),
    },
    body,
  });
}

describe('Next.js weather transform handlers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('validates and normalizes dashboard input without logging coordinates', async () => {
    const getDashboard = vi.fn(async (input: LocationInput) => ({
      ...dashboard,
      location: { ...dashboard.location, latitude: input.latitude, longitude: input.longitude },
    }));
    const handlers = createWeatherRouteHandlers({ getDashboard }, serviceToken);
    const response = await handlers.dashboard(
      post(
        JSON.stringify({
          latitude: 52.52,
          longitude: 13.405,
          timezone: 'Europe/Berlin',
          units: 'metric',
        }),
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-request-id')).toBe('weather_route_test-1');
    await expect(response.json()).resolves.toMatchObject({
      location: { latitude: 52.52, longitude: 13.405 },
      meta: { provider: 'open-meteo', cached: false },
    });
    expect(getDashboard).toHaveBeenCalledWith({
      latitude: 52.52,
      longitude: 13.405,
      timezone: 'Europe/Berlin',
      units: 'metric',
    });
  });

  it('rejects invalid and oversized dashboard requests before provider work', async () => {
    const getDashboard = vi.fn(async () => dashboard);
    const handlers = createWeatherRouteHandlers({ getDashboard }, serviceToken);
    const invalid = await handlers.dashboard(
      post(JSON.stringify({ latitude: 91, longitude: 13, timezone: 'Europe/Berlin' })),
    );
    const invalidTimezone = await handlers.dashboard(
      post(JSON.stringify({ latitude: 52, longitude: 13, timezone: 'Europe/../Berlin' })),
    );
    const oversized = await handlers.dashboard(
      post(JSON.stringify({ padding: 'x'.repeat(3_000) })),
    );

    expect(invalid.status).toBe(400);
    expect(invalidTimezone.status).toBe(400);
    expect(oversized.status).toBe(413);
    expect(getDashboard).not.toHaveBeenCalled();
  });

  it('returns a sanitized provider failure and omits request input from logs', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const handlers = createWeatherRouteHandlers(
      {
        getDashboard: vi.fn(async () => {
          throw new Error('private provider payload and coordinates');
        }),
      },
      serviceToken,
    );
    const response = await handlers.dashboard(
      post(JSON.stringify({ latitude: 52.52, longitude: 13.405, timezone: 'Europe/Berlin' })),
    );
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toContain('WEATHER_UNAVAILABLE');
    expect(body).not.toContain('private provider payload');
    expect(warning).toHaveBeenCalledOnce();
    expect(warning.mock.calls[0]?.[0]).not.toContain('52.52');
    expect(warning.mock.calls[0]?.[0]).not.toContain('private provider payload');
  });

  it('supports the bounded AQI timeline request contract', async () => {
    const getAirQuality = vi.fn(async (input: AirQualityInput) => {
      if (input.includeTimeline) return airQuality;
      const current = { ...airQuality };
      delete current.timeline;
      return current;
    });
    const handlers = createWeatherRouteHandlers(
      {
        getDashboard: vi.fn(async () => dashboard),
        getAirQuality,
      },
      serviceToken,
    );
    const response = await handlers.airQuality(
      post(
        JSON.stringify({ latitude: 52.52, longitude: 13.405, includeTimeline: true }),
        'aqi_route_test-1',
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toBe('aqi_route_test-1');
    await expect(response.json()).resolves.toMatchObject({
      timeline: { kind: 'model', requestedPastDays: 7, requestedForecastDays: 5 },
    });
    expect(getAirQuality).toHaveBeenCalledWith({
      latitude: 52.52,
      longitude: 13.405,
      includeTimeline: true,
    });
  });

  it('fails AQI closed when timeline data is unavailable', async () => {
    const getAirQuality = vi.fn(async () => {
      const current = { ...airQuality };
      delete current.timeline;
      return current;
    });
    const handlers = createWeatherRouteHandlers(
      {
        getDashboard: vi.fn(async () => dashboard),
        getAirQuality,
      },
      serviceToken,
    );
    const response = await handlers.airQuality(
      post(JSON.stringify({ latitude: 52.52, longitude: 13.405, includeTimeline: true })),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'AIR_QUALITY_UNAVAILABLE' },
    });
  });

  it('rejects requests without the shared service credential before provider work', async () => {
    const getDashboard = vi.fn(async () => dashboard);
    const handlers = createWeatherRouteHandlers({ getDashboard }, serviceToken);
    const response = await handlers.dashboard(
      post(
        JSON.stringify({ latitude: 52.52, longitude: 13.405, timezone: 'Europe/Berlin' }),
        'weather_unauthorized-1',
        '',
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'UNAUTHORIZED' },
    });
    expect(getDashboard).not.toHaveBeenCalled();
  });

  it('checks the shared service credential without calling a provider', async () => {
    const getDashboard = vi.fn(async () => dashboard);
    const getAirQuality = vi.fn(async () => airQuality);
    const handlers = createWeatherRouteHandlers({ getDashboard, getAirQuality }, serviceToken);
    const authorized = new Request('https://rainify.dpdns.org/api/v1/weather/transform-health', {
      method: 'POST',
      headers: { authorization: `Bearer ${serviceToken}`, 'x-request-id': 'transform_health-1' },
    });
    const denied = new Request('https://rainify.dpdns.org/api/v1/weather/transform-health', {
      method: 'POST',
      headers: { 'x-request-id': 'transform_health-2' },
    });
    const healthy = await handlers.transformHealth(authorized);
    const unauthorized = await handlers.transformHealth(denied);

    expect(healthy.status).toBe(200);
    expect(healthy.headers.get('cache-control')).toBe('no-store');
    await expect(healthy.json()).resolves.toEqual({ status: 'ok' });
    expect(unauthorized.status).toBe(401);
    expect(getDashboard).not.toHaveBeenCalled();
    expect(getAirQuality).not.toHaveBeenCalled();
  });
});
