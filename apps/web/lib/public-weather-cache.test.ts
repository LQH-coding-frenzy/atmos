import { describe, expect, it, vi } from 'vitest';
import type { AirQuality, AirQualityInput, LocationInput } from '@atmos/contracts';
import { MockWeatherProvider } from '@atmos/provider-openmeteo';
import { createPublicWeatherCache, type PublicWeatherCacheStore } from './public-weather-cache';

const dashboardInput: LocationInput = {
  latitude: 52.52,
  longitude: 13.405,
  timezone: 'Europe/Berlin',
  units: 'metric',
};

const pollutants = {
  pm25: 7.2,
  pm10: 12.4,
  carbonMonoxide: 120,
  nitrogenDioxide: 4.3,
  sulphurDioxide: 1.1,
  ozone: 65,
};

function airQuality(includeTimeline = false): AirQuality {
  return {
    observedAt: '2026-10-30T10:00:00.000Z',
    usAqi: 42,
    europeanAqi: 18,
    pollutants,
    ...(includeTimeline
      ? {
          timeline: {
            kind: 'model' as const,
            requestedPastDays: 7 as const,
            requestedForecastDays: 5 as const,
            hours: [
              {
                time: '2026-10-30T11:00:00.000Z',
                usAqi: 44,
                europeanAqi: 19,
                pollutants,
              },
            ],
          },
        }
      : {}),
    meta: {
      provider: 'open-meteo',
      cached: false,
      stale: false,
      updatedAt: '2026-10-30T10:00:00.000Z',
    },
  };
}

function memoryStore(clock: { now: number }) {
  const entries = new Map<string, { expiresAt: number; value: unknown }>();
  const store: PublicWeatherCacheStore = {
    async get(key) {
      const entry = entries.get(key);
      if (!entry || entry.expiresAt <= clock.now) {
        entries.delete(key);
        return null;
      }
      return entry.value;
    },
    async set(key, value, ttlSeconds) {
      entries.set(key, { value, expiresAt: clock.now + ttlSeconds * 1_000 });
    },
  };
  return { store, entries };
}

describe('Vercel public weather cache', () => {
  it('returns a miss, then serves normalized dashboard data from cache inside five minutes', async () => {
    const clock = { now: 1_000 };
    const { store, entries } = memoryStore(clock);
    const provider = new MockWeatherProvider();
    const getDashboard = vi.fn(provider.getDashboard.bind(provider));
    const cache = createPublicWeatherCache(
      {
        getDashboard,
        getAirQuality: vi.fn(async (input: AirQualityInput) => airQuality(input.includeTimeline)),
      },
      store,
      () => clock.now,
    );

    const miss = await cache.getDashboard(dashboardInput);
    expect(miss).toMatchObject({ cached: false, stale: false });
    expect(getDashboard).toHaveBeenCalledOnce();
    expect(entries.size).toBe(1);
    expect([...entries.keys()][0]).not.toContain('52.52');

    clock.now += 299_999;
    const hit = await cache.getDashboard(dashboardInput);
    expect(hit).toMatchObject({ cached: true, stale: false });
    expect(hit.data).toEqual(miss.data);
    expect(getDashboard).toHaveBeenCalledOnce();
  });

  it('refreshes stale data on provider success and serves it stale on provider failure', async () => {
    const clock = { now: 10_000 };
    const { store } = memoryStore(clock);
    const provider = new MockWeatherProvider();
    const getDashboard = vi.fn(provider.getDashboard.bind(provider));
    const cache = createPublicWeatherCache(
      {
        getDashboard,
        getAirQuality: vi.fn(async (input: AirQualityInput) => airQuality(input.includeTimeline)),
      },
      store,
      () => clock.now,
    );

    await cache.getDashboard(dashboardInput);
    clock.now += 300_001;
    const refreshed = await cache.getDashboard(dashboardInput);
    expect(refreshed).toMatchObject({ cached: false, stale: false });
    expect(getDashboard).toHaveBeenCalledTimes(2);

    clock.now += 300_001;
    getDashboard.mockRejectedValueOnce(new Error('provider details must stay private'));
    const stale = await cache.getDashboard(dashboardInput);
    expect(stale).toMatchObject({ cached: true, stale: true, providerErrorType: 'Error' });
    expect(stale.data).toEqual(refreshed.data);
  });

  it('does not serve entries past one hour and treats cache write failures as non-fatal', async () => {
    const clock = { now: 20_000 };
    const { store } = memoryStore(clock);
    const provider = new MockWeatherProvider();
    const getDashboard = vi.fn(provider.getDashboard.bind(provider));
    const makeCache = (cacheStore: PublicWeatherCacheStore) =>
      createPublicWeatherCache(
        {
          getDashboard,
          getAirQuality: vi.fn(async (input: AirQualityInput) => airQuality(input.includeTimeline)),
        },
        cacheStore,
        () => clock.now,
      );
    const cache = makeCache(store);

    await cache.getDashboard(dashboardInput);
    clock.now += 3_600_001;
    getDashboard.mockRejectedValueOnce(new Error('provider unavailable'));
    await expect(cache.getDashboard(dashboardInput)).rejects.toThrow('provider unavailable');

    const writeFailureCache = makeCache({
      get: async () => null,
      set: async () => Promise.reject(new Error('cache details')),
    });
    await expect(writeFailureCache.getDashboard(dashboardInput)).resolves.toMatchObject({
      cached: false,
      stale: false,
      cacheWriteErrorType: 'Error',
    });
  });

  it('reuses a shared cache record across cache instances', async () => {
    const clock = { now: 25_000 };
    const { store } = memoryStore(clock);
    const firstProvider = new MockWeatherProvider();
    const secondProvider = new MockWeatherProvider();
    const firstFetch = vi.fn(firstProvider.getDashboard.bind(firstProvider));
    const secondFetch = vi.fn(secondProvider.getDashboard.bind(secondProvider));
    const firstInstance = createPublicWeatherCache(
      {
        getDashboard: firstFetch,
        getAirQuality: vi.fn(async (input: AirQualityInput) => airQuality(input.includeTimeline)),
      },
      store,
      () => clock.now,
    );
    const secondInstance = createPublicWeatherCache(
      {
        getDashboard: secondFetch,
        getAirQuality: vi.fn(async (input: AirQualityInput) => airQuality(input.includeTimeline)),
      },
      store,
      () => clock.now,
    );

    await firstInstance.getDashboard(dashboardInput);
    const result = await secondInstance.getDashboard(dashboardInput);

    expect(result).toMatchObject({ cached: true, stale: false });
    expect(firstFetch).toHaveBeenCalledOnce();
    expect(secondFetch).not.toHaveBeenCalled();
  });

  it('continues with the provider when cache reads fail and reports sanitized cache errors', async () => {
    const provider = new MockWeatherProvider();
    const getDashboard = vi.fn(provider.getDashboard.bind(provider));
    const cache = createPublicWeatherCache(
      {
        getDashboard,
        getAirQuality: vi.fn(async (input: AirQualityInput) => airQuality(input.includeTimeline)),
      },
      {
        get: async () => Promise.reject(new Error('private cache endpoint details')),
        set: async () => Promise.reject(new Error('private cache write details')),
      },
    );

    await expect(cache.getDashboard(dashboardInput)).resolves.toMatchObject({
      cached: false,
      stale: false,
      cacheReadErrorType: 'Error',
      cacheWriteErrorType: 'Error',
    });
    expect(getDashboard).toHaveBeenCalledOnce();
  });

  it('isolates current and timeline AQI keys and coalesces concurrent timeline misses', async () => {
    const clock = { now: 30_000 };
    const { store, entries } = memoryStore(clock);
    const provider = new MockWeatherProvider();
    const current = airQuality();
    const timeline = airQuality(true);
    let resolveTimeline!: (value: AirQuality) => void;
    const getAirQuality = vi.fn(async (input: AirQualityInput) => {
      if (input.includeTimeline) {
        return new Promise<AirQuality>((resolve) => {
          resolveTimeline = resolve;
        });
      }
      return current;
    });
    const cache = createPublicWeatherCache(
      { getDashboard: provider.getDashboard.bind(provider), getAirQuality },
      store,
      () => clock.now,
    );

    const currentResult = await cache.getAirQuality({ latitude: 52.52, longitude: 13.405 });
    const firstTimeline = cache.getAirQuality({
      latitude: 52.52,
      longitude: 13.405,
      includeTimeline: true,
    });
    const secondTimeline = cache.getAirQuality({
      latitude: 52.52,
      longitude: 13.405,
      includeTimeline: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getAirQuality).toHaveBeenCalledTimes(2);
    resolveTimeline(timeline);
    const timelineResults = await Promise.all([firstTimeline, secondTimeline]);

    expect(currentResult.data.timeline).toBeUndefined();
    expect(timelineResults.map((result) => result.data.timeline?.kind)).toEqual(['model', 'model']);
    expect(entries.size).toBe(2);
  });
});
