import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AirQuality, AirQualityInput, Dashboard, LocationInput } from '@atmos/contracts';
import {
  createPublicWeatherRouteHandlers,
  createWeatherRouteHandlers,
} from './weather-route-handlers';

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
const legacyWorkerCacheVariantsAccept = 'application/vnd.atmos.weather-cache-variants; version=1';
const workerCacheVariantsAccept = 'application/vnd.atmos.weather-cache-variants; version=2';
const workerCacheVariantsMagic = [0x41, 0x54, 0x43, 0x32];

function post(
  body: string,
  requestId = 'weather_route_test-1',
  authorizationToken = serviceToken,
  accept?: string,
  resource: 'dashboard' | 'air-quality' = 'dashboard',
  origin: string | null = 'https://rainify.dpdns.org',
  contentType = 'application/json',
) {
  return new Request(`https://rainify.dpdns.org/api/v1/weather/${resource}`, {
    method: 'POST',
    headers: {
      'content-type': contentType,
      'x-request-id': requestId,
      ...(origin ? { origin } : {}),
      ...(accept ? { accept } : {}),
      ...(authorizationToken ? { authorization: `Bearer ${authorizationToken}` } : {}),
    },
    body,
  });
}

async function decodeCacheVariantFrame(response: Response) {
  expect(response.headers.get('content-type')).toBe(workerCacheVariantsAccept);
  const bytes = new Uint8Array(await response.arrayBuffer());
  expect(Array.from(bytes.subarray(0, 4))).toEqual(workerCacheVariantsMagic);
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const prefixLength = header.getUint32(4);
  const suffixLengths = [header.getUint32(8), header.getUint32(12)];
  const prefix = bytes.subarray(16, 16 + prefixLength);
  const variants: unknown[] = [];
  let offset = 16 + prefixLength;
  for (const suffixLength of suffixLengths) {
    const suffix = bytes.subarray(offset, offset + suffixLength);
    const variant = new Uint8Array(prefix.length + suffix.length);
    variant.set(prefix);
    variant.set(suffix, prefix.length);
    variants.push(JSON.parse(new TextDecoder().decode(variant)));
    offset += suffixLength;
  }
  expect(offset).toBe(bytes.length);
  return variants;
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

  it('returns framed cache variants only for an authenticated Worker request', async () => {
    const getDashboard = vi.fn(async () => dashboard);
    const handlers = createWeatherRouteHandlers({ getDashboard }, serviceToken);
    const response = await handlers.dashboard(
      post(
        JSON.stringify({
          latitude: 52.52,
          longitude: 13.405,
          timezone: 'Europe/Berlin',
          units: 'metric',
        }),
        'worker_cache_variants-1',
        serviceToken,
        workerCacheVariantsAccept,
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-request-id')).toBe('worker_cache_variants-1');
    const [original, fresh] = await decodeCacheVariantFrame(response);
    expect(original).toMatchObject({ meta: { cached: false, stale: false } });
    expect(fresh).toMatchObject({ meta: { cached: true, stale: false } });
    expect(getDashboard).toHaveBeenCalledOnce();
  });

  it('returns framed AQI timeline cache variants to the authenticated Worker', async () => {
    const getAirQuality = vi.fn(async () => airQuality);
    const handlers = createWeatherRouteHandlers(
      { getDashboard: vi.fn(async () => dashboard), getAirQuality },
      serviceToken,
    );
    const response = await handlers.airQuality(
      post(
        JSON.stringify({ latitude: 52.52, longitude: 13.405, includeTimeline: true }),
        'worker_aqi_variants-1',
        serviceToken,
        workerCacheVariantsAccept,
        'air-quality',
      ),
    );

    expect(response.status).toBe(200);
    const [original, fresh] = await decodeCacheVariantFrame(response);
    expect(original).toMatchObject({ timeline: { kind: 'model' }, meta: { cached: false } });
    expect(fresh).toMatchObject({ meta: { cached: true, stale: false } });
    expect(getAirQuality).toHaveBeenCalledOnce();
  });

  it('keeps the previous cache-variant frame available to an already uploaded Worker', async () => {
    const handlers = createWeatherRouteHandlers(
      { getDashboard: vi.fn(async () => dashboard) },
      serviceToken,
    );
    const response = await handlers.dashboard(
      post(
        JSON.stringify({
          latitude: 52.52,
          longitude: 13.405,
          timezone: 'Europe/Berlin',
          units: 'metric',
        }),
        'worker_cache_variants_legacy-1',
        serviceToken,
        legacyWorkerCacheVariantsAccept,
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(legacyWorkerCacheVariantsAccept);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(bytes.subarray(0, 4))).toEqual([0x41, 0x54, 0x43, 0x31]);
    const frame = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const lengths = [frame.getUint32(4), frame.getUint32(8), frame.getUint32(12)];
    const variants: unknown[] = [];
    let offset = 16;
    for (const length of lengths) {
      variants.push(JSON.parse(new TextDecoder().decode(bytes.subarray(offset, offset + length))));
      offset += length;
    }
    expect(offset).toBe(bytes.length);
    expect(variants).toEqual([
      expect.objectContaining({ meta: expect.objectContaining({ cached: false, stale: false }) }),
      expect.objectContaining({ meta: expect.objectContaining({ cached: true, stale: false }) }),
      expect.objectContaining({ meta: expect.objectContaining({ cached: true, stale: true }) }),
    ]);
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
        workerCacheVariantsAccept,
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

describe('public Next.js weather handlers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('serves a bounded dashboard without a Worker service credential', async () => {
    const getDashboard = vi.fn(async () => ({ data: dashboard, cached: false, stale: false }));
    const handlers = createPublicWeatherRouteHandlers({
      getDashboard,
      getAirQuality: vi.fn(async () => ({ data: airQuality, cached: false, stale: false })),
    });
    const response = await handlers.dashboard(
      post(
        JSON.stringify({
          latitude: 52.52,
          longitude: 13.405,
          timezone: 'Europe/Berlin',
          units: 'metric',
        }),
        'public_dashboard-1',
        '',
        undefined,
        'dashboard',
        'https://rainify.dpdns.org',
        'application/json; charset=utf-8',
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-cache')).toBe('MISS');
    expect(response.headers.get('x-request-id')).toBe('public_dashboard-1');
    expect(response.headers.get('authorization')).toBeNull();
    await expect(response.json()).resolves.toMatchObject({
      location: { name: 'Berlin' },
      meta: { cached: false, stale: false },
    });
    expect(getDashboard).toHaveBeenCalledWith({
      latitude: 52.52,
      longitude: 13.405,
      timezone: 'Europe/Berlin',
      units: 'metric',
    });
  });

  it('rejects missing/cross-origin requests and simple content types before provider work', async () => {
    const getDashboard = vi.fn(async () => ({ data: dashboard, cached: false, stale: false }));
    const getAirQuality = vi.fn(async () => ({ data: airQuality, cached: false, stale: false }));
    const handlers = createPublicWeatherRouteHandlers({ getDashboard, getAirQuality });
    const body = JSON.stringify({
      latitude: 52.52,
      longitude: 13.405,
      timezone: 'Europe/Berlin',
      units: 'metric',
    });
    const missingOrigin = await handlers.dashboard(
      post(body, 'public_origin_missing-1', '', undefined, 'dashboard', null),
    );
    const crossOrigin = await handlers.dashboard(
      post(body, 'public_origin_cross-1', '', undefined, 'dashboard', 'https://attacker.example'),
    );
    const simpleContentType = await handlers.airQuality(
      post(
        JSON.stringify({ latitude: 52.52, longitude: 13.405 }),
        'public_content_type-1',
        '',
        undefined,
        'air-quality',
        'https://rainify.dpdns.org',
        'text/plain',
      ),
    );

    expect(missingOrigin.status).toBe(403);
    expect(crossOrigin.status).toBe(403);
    expect(simpleContentType.status).toBe(415);
    expect(getDashboard).not.toHaveBeenCalled();
    expect(getAirQuality).not.toHaveBeenCalled();
  });

  it('marks a cached AQI fallback stale and logs no request coordinates', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const handlers = createPublicWeatherRouteHandlers({
      getDashboard: vi.fn(async () => ({ data: dashboard, cached: false, stale: false })),
      getAirQuality: vi.fn(async () => ({
        data: airQuality,
        cached: true,
        stale: true,
        providerErrorType: 'Error',
      })),
    });
    const response = await handlers.airQuality(
      post(
        JSON.stringify({ latitude: 52.52, longitude: 13.405, includeTimeline: true }),
        'public_aqi-1',
        '',
        undefined,
        'air-quality',
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-cache')).toBe('STALE');
    await expect(response.json()).resolves.toMatchObject({
      timeline: { kind: 'model' },
      meta: { cached: true, stale: true },
    });
    expect(JSON.stringify(warning.mock.calls)).not.toContain('52.52');
    expect(JSON.stringify(warning.mock.calls)).not.toContain('13.405');
    expect(JSON.stringify(warning.mock.calls)).not.toContain('private provider');
  });
});
