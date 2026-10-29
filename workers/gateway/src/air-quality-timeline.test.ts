import { describe, expect, it, vi } from 'vitest';
import type { AirQuality, AirQualityInput } from '@atmos/contracts';
import { MockWeatherProvider } from '@atmos/provider-openmeteo';
import { createApp } from './index';

function result(timeline = false): AirQuality {
  const pollutants = {
    pm25: 7.2,
    pm10: 12.4,
    carbonMonoxide: 120,
    nitrogenDioxide: 4,
    sulphurDioxide: 1,
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
            kind: 'model' as const,
            requestedPastDays: 7 as const,
            requestedForecastDays: 5 as const,
            hours: [{ time: '2026-10-08T10:00:00.000Z', usAqi: 42, europeanAqi: 18, pollutants }],
          },
        }
      : {}),
    meta: {
      provider: 'open-meteo',
      cached: false,
      stale: false,
      updatedAt: '2026-10-08T10:02:00.000Z',
    },
  };
}
const base = 'http://localhost/api/v1/weather/air-quality?lat=52.52&lon=13.405';
const provider = new MockWeatherProvider();

function cacheKeyUrl(request: RequestInfo | URL) {
  return request instanceof Request ? request.url : String(request);
}

describe('AQI timeline gateway boundary', () => {
  it('isolates canonical current and timeline caches and retains bounded stale responses per mode', async () => {
    let failing = false;
    const getAirQuality = vi.fn(async (input: AirQualityInput) => {
      if (failing) throw new Error('sensitive provider diagnostics');
      return result(input.includeTimeline);
    });
    const responses = new Map<string, Response>();
    const cache = {
      match: vi.fn(async (request: RequestInfo | URL) =>
        responses.get(cacheKeyUrl(request))?.clone(),
      ),
      put: vi.fn(async (request: RequestInfo | URL, response: Response) => {
        responses.set(cacheKeyUrl(request), response.clone());
      }),
    };
    const app = createApp(
      { getDashboard: provider.getDashboard.bind(provider), getAirQuality },
      cache,
    );
    expect((await app.request(base)).status).toBe(200);
    const timeline = await app.request(`${base}&view=timeline&past_days=999&private=discard`);
    expect(timeline.status).toBe(200);
    expect(timeline.headers.get('x-cache')).toBe('MISS');
    expect(getAirQuality.mock.calls[1]?.[0]).toEqual({
      latitude: 52.52,
      longitude: 13.405,
      includeTimeline: true,
    });
    const timelineCacheKey = `${base}&view=timeline&__atmos_cache_schema=3`;
    expect(responses.has(timelineCacheKey)).toBe(true);
    expect(
      [...responses.keys()].some((key) => key.includes('private') || key.includes('999')),
    ).toBe(false);
    const hit = await app.request(`${base}&view=timeline`);
    expect(hit.headers.get('x-cache')).toBe('HIT');
    expect(((await hit.json()) as AirQuality).timeline?.hours).toHaveLength(1);
    expect(
      ((await (await app.request(`${base}&view=current`)).json()) as AirQuality).timeline,
    ).toBeUndefined();
    expect(getAirQuality).toHaveBeenCalledTimes(2);
    const cachedTimeline = responses.get(timelineCacheKey);
    expect(cachedTimeline).toBeDefined();
    if (cachedTimeline) {
      const staleEntry = new Response(cachedTimeline.body, cachedTimeline);
      staleEntry.headers.set('x-atmos-cache-stored-at', String(Date.now() - 10 * 60_000));
      responses.set(timelineCacheKey, staleEntry);
    }
    failing = true;
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const stale = await app.request(`${base}&view=timeline`);
    expect(stale.headers.get('x-cache')).toBe('STALE');
    expect(stale.headers.get('cache-control')).toBe('private, no-store');
    const staleData = (await stale.json()) as AirQuality;
    expect(staleData.timeline?.hours).toHaveLength(1);
    expect(staleData.meta.stale).toBe(true);
    expect(JSON.stringify(warning.mock.calls)).not.toContain('sensitive provider diagnostics');
    warning.mockRestore();
  });
  it('coalesces only identical modes, not current and timeline together', async () => {
    const resolvers = new Map<boolean, (value: AirQuality) => void>();
    const getAirQuality = vi.fn(
      (input: AirQualityInput) =>
        new Promise<AirQuality>((resolve) => resolvers.set(!!input.includeTimeline, resolve)),
    );
    const app = createApp(
      { getDashboard: provider.getDashboard.bind(provider), getAirQuality },
      { match: async () => undefined, put: async () => undefined },
    );
    const current = app.request(base);
    const timeline = app.request(`${base}&view=timeline`);
    const sameTimeline = app.request(`${base}&view=timeline`);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getAirQuality).toHaveBeenCalledTimes(2);
    resolvers.get(false)!(result());
    resolvers.get(true)!(result(true));
    const [a, b, c] = await Promise.all([current, timeline, sameTimeline]);
    expect(((await a.json()) as AirQuality).timeline).toBeUndefined();
    expect(((await b.json()) as AirQuality).timeline?.kind).toBe('model');
    expect(((await c.json()) as AirQuality).timeline?.kind).toBe('model');
  });
  it('rejects unknown modes before calling providers and fails closed if a timeline is missing', async () => {
    const getAirQuality = vi.fn(async () => result());
    const app = createApp(
      { getDashboard: provider.getDashboard.bind(provider), getAirQuality },
      { match: async () => undefined, put: async () => undefined },
    );
    const invalid = await app.request(`${base}&view=unbounded-history`);
    expect(invalid.status).toBe(400);
    expect(getAirQuality).not.toHaveBeenCalled();
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const missing = await app.request(`${base}&view=timeline`);
    expect(missing.status).toBe(503);
    expect(await missing.json()).toMatchObject({ error: { code: 'AIR_QUALITY_UNAVAILABLE' } });
    warning.mockRestore();
  });
});
