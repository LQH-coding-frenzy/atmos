import { createHash } from 'node:crypto';
import {
  airQualitySchema,
  dashboardSchema,
  type AirQuality,
  type AirQualityInput,
  type Dashboard,
  type LocationInput,
} from '@atmos/contracts';
import { OpenMeteoProvider } from '@atmos/provider-openmeteo';
import { getCache } from '@vercel/functions';

const cacheSchemaVersion = 1;
const freshWindowMilliseconds = 300_000;
const staleWindowMilliseconds = 3_600_000;
const cacheTtlSeconds = 3_600;
const maximumLocalCacheEntries = 256;

type CachedWeatherRecord<T> = {
  schema: number;
  generatedAt: number;
  data: T;
};

export type PublicWeatherCacheResult<T> = {
  data: T;
  cached: boolean;
  stale: boolean;
  cacheReadErrorType?: string;
  cacheWriteErrorType?: string;
  providerErrorType?: string;
};

export type PublicWeatherCacheStore = {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown, ttlSeconds: number, name: string): Promise<void>;
};

export type PublicWeatherProvider = {
  getDashboard(input: LocationInput): Promise<Dashboard>;
  getAirQuality(input: AirQualityInput): Promise<AirQuality>;
};

function safeErrorType(error: unknown) {
  return error instanceof Error ? error.name : 'unknown';
}

function cacheKey(scope: 'dashboard' | 'air-quality', parts: Array<string | number | boolean>) {
  const digest = createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  return `atmos:public-weather:v${cacheSchemaVersion}:${scope}:${digest}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseCacheRecord<T>(value: unknown, parse: (candidate: unknown) => T | undefined) {
  if (
    !isRecord(value) ||
    value.schema !== cacheSchemaVersion ||
    typeof value.generatedAt !== 'number' ||
    !Number.isFinite(value.generatedAt)
  ) {
    return undefined;
  }
  const data = parse(value.data);
  return data ? { generatedAt: value.generatedAt, data } : undefined;
}

const localEntries = new Map<string, { expiresAt: number; value: unknown }>();
const localCache: PublicWeatherCacheStore = {
  async get(key) {
    const entry = localEntries.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      localEntries.delete(key);
      return null;
    }
    localEntries.delete(key);
    localEntries.set(key, entry);
    return entry.value;
  },
  async set(key, value, ttlSeconds) {
    localEntries.delete(key);
    localEntries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1_000 });
    if (localEntries.size > maximumLocalCacheEntries) {
      const oldestKey = localEntries.keys().next().value;
      if (oldestKey) localEntries.delete(oldestKey);
    }
  },
};

const vercelRuntimeCache: PublicWeatherCacheStore = {
  async get(key) {
    return getCache().get(key);
  },
  async set(key, value, ttlSeconds, name) {
    await getCache().set(key, value, { ttl: ttlSeconds, name, tags: ['atmos-public-weather-v1'] });
  },
};

export function publicWeatherCacheStore(): PublicWeatherCacheStore {
  const isVercelDeployment = process.env.VERCEL === '1' && process.env.VERCEL_ENV !== 'development';
  return isVercelDeployment ? vercelRuntimeCache : localCache;
}

export function createPublicWeatherCache(
  provider: PublicWeatherProvider,
  store: PublicWeatherCacheStore,
  now = Date.now,
) {
  const dashboardInFlight = new Map<string, Promise<PublicWeatherCacheResult<Dashboard>>>();
  const airQualityInFlight = new Map<string, Promise<PublicWeatherCacheResult<AirQuality>>>();

  async function getOrRefresh<T>(
    key: string,
    entryName: string,
    parse: (candidate: unknown) => T | undefined,
    fetchFresh: () => Promise<T>,
    inFlight: Map<string, Promise<PublicWeatherCacheResult<T>>>,
  ): Promise<PublicWeatherCacheResult<T>> {
    const existing = inFlight.get(key);
    if (existing) return existing;

    const pending = (async () => {
      let cached: ReturnType<typeof parseCacheRecord<T>>;
      let cacheReadErrorType: string | undefined;
      try {
        cached = parseCacheRecord(await store.get(key), parse);
      } catch (error) {
        cacheReadErrorType = safeErrorType(error);
      }

      const ageMilliseconds = cached ? now() - cached.generatedAt : Number.POSITIVE_INFINITY;
      if (cached && ageMilliseconds >= 0 && ageMilliseconds < freshWindowMilliseconds) {
        return {
          data: cached.data,
          cached: true,
          stale: false,
          ...(cacheReadErrorType ? { cacheReadErrorType } : {}),
        };
      }
      const stale =
        cached &&
        ageMilliseconds >= freshWindowMilliseconds &&
        ageMilliseconds <= staleWindowMilliseconds
          ? cached
          : undefined;

      try {
        const data = parse(await fetchFresh());
        if (!data) throw new Error('Weather provider response did not match its contract');

        let cacheWriteErrorType: string | undefined;
        try {
          const entry: CachedWeatherRecord<T> = {
            schema: cacheSchemaVersion,
            generatedAt: now(),
            data,
          };
          await store.set(key, entry, cacheTtlSeconds, entryName);
        } catch (error) {
          cacheWriteErrorType = safeErrorType(error);
        }

        return {
          data,
          cached: false,
          stale: false,
          ...(cacheReadErrorType ? { cacheReadErrorType } : {}),
          ...(cacheWriteErrorType ? { cacheWriteErrorType } : {}),
        };
      } catch (error) {
        if (stale) {
          return {
            data: stale.data,
            cached: true,
            stale: true,
            providerErrorType: safeErrorType(error),
            ...(cacheReadErrorType ? { cacheReadErrorType } : {}),
          };
        }
        throw error;
      }
    })().finally(() => inFlight.delete(key));

    inFlight.set(key, pending);
    return pending;
  }

  return {
    getDashboard(input: LocationInput) {
      const key = cacheKey('dashboard', [
        input.latitude,
        input.longitude,
        input.timezone,
        input.units,
      ]);
      return getOrRefresh(
        key,
        'public-weather-dashboard',
        (candidate) => {
          const parsed = dashboardSchema.safeParse(candidate);
          return parsed.success ? parsed.data : undefined;
        },
        () => provider.getDashboard(input),
        dashboardInFlight,
      );
    },
    getAirQuality(input: AirQualityInput) {
      const key = cacheKey('air-quality', [
        input.latitude,
        input.longitude,
        input.includeTimeline === true,
      ]);
      return getOrRefresh(
        key,
        input.includeTimeline ? 'public-air-quality-timeline' : 'public-air-quality-current',
        (candidate) => {
          const parsed = airQualitySchema.safeParse(candidate);
          if (!parsed.success || (input.includeTimeline === true && !parsed.data.timeline)) {
            return undefined;
          }
          return parsed.data;
        },
        () => provider.getAirQuality(input),
        airQualityInFlight,
      );
    },
  };
}

const publicProvider = new OpenMeteoProvider();
export const publicWeatherCache = createPublicWeatherCache(
  publicProvider,
  publicWeatherCacheStore(),
);
