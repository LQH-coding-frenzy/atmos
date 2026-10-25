import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import type {
  AirQuality,
  AirQualityInput,
  AirQualityProvider,
  Dashboard,
  LocationSearchProvider,
  LocationSearchResult,
  LocationInput,
  WeatherRadarTimeline,
  WeatherProvider,
} from '@atmos/contracts';
import { createCorrelation } from './correlation';
import {
  backendReleaseFromUrl,
  canonicalReleaseId,
  recordRequestAnalytics,
  requestRouteGroup,
  type AnalyticsProvider,
  type RequestAnalyticsDataset,
} from './request-analytics';

type Bindings = {
  CORS_ORIGIN?: string;
  OPENWEATHER_API_KEY?: string;
  RELEASE_ID?: string;
  SUPABASE_FUNCTION_URL?: string;
  WEATHER_TRANSFORM_TOKEN?: string;
  WEATHER_TRANSFORM_ORIGIN?: string;
  REQUEST_ANALYTICS?: RequestAnalyticsDataset;
  CF_VERSION_METADATA?: { id: string; tag?: string; timestamp: string };
};

type Variables = {
  requestId: string;
  traceparent: string;
  analyticsProvider?: AnalyticsProvider;
  providerDurationMs?: number;
};

type GatewayEnvironment = { Bindings: Bindings; Variables: Variables };

type WeatherCache = Pick<Cache, 'match' | 'put'>;

const weatherCacheTtlSeconds = 300;
const airQualityCacheTtlSeconds = 300;
const weatherTransformTokenMinimumLength = 32;
const weatherRadarCacheTtlSeconds = 300;
const weatherMapTileCacheTtlSeconds = 300;
const openWeatherTileRequestsPerWindow = 50;
const openWeatherTileWindowMilliseconds = 60_000;
const staleWeatherCacheTtlSeconds = 3600;
const locationSearchCacheTtlSeconds = 86400;
const rainViewerMetadataUrl = 'https://api.rainviewer.com/public/weather-maps.json';
const rainViewerTileHost = 'https://tilecache.rainviewer.com';
let openWeatherTileWindowStartedAt = 0;
let openWeatherTileRequestCount = 0;
const forwardedProxyHeaders = new Set(['accept', 'authorization', 'content-type']);
const locationSearchInFlight = new Map<string, Promise<LocationSearchResult[]>>();
const airQualityInFlight = new Map<string, Promise<AirQuality>>();
const noWeatherCache: WeatherCache = {
  match: async () => undefined,
  put: async () => undefined,
};

function createLazyOpenMeteoProvider() {
  type Provider = import('@atmos/provider-openmeteo').OpenMeteoProvider;
  let providerPromise: Promise<Provider> | undefined;
  const loadProvider = () =>
    (providerPromise ??= import('@atmos/provider-openmeteo').then(
      ({ OpenMeteoProvider }) => new OpenMeteoProvider(),
    ));

  return {
    getDashboard: (input: LocationInput) =>
      loadProvider().then((provider) => provider.getDashboard(input)),
    getAirQuality: (input: AirQualityInput) =>
      loadProvider().then((provider) => provider.getAirQuality(input)),
    searchLocations: (query: string) =>
      loadProvider().then((provider) => provider.searchLocations(query)),
  };
}

type CacheableWeatherPayload = {
  meta: { cached: boolean; stale: boolean };
};

function serializeWeatherCacheVariants<T extends CacheableWeatherPayload>(payload: T) {
  const { meta, ...data } = payload;
  const serializedData = JSON.stringify(data);
  if (!serializedData || serializedData[0] !== '{' || !serializedData.endsWith('}')) {
    throw new Error('Weather response could not be serialized.');
  }

  const serializedDataPrefix = serializedData.slice(0, -1);
  const serialize = (cached: boolean, stale: boolean) =>
    `${serializedDataPrefix},"meta":${JSON.stringify({ ...meta, cached, stale })}}`;

  return {
    response: serialize(meta.cached, meta.stale),
    fresh: serialize(true, false),
    stale: serialize(true, true),
  };
}

type WeatherTransformFailureClass =
  | 'not_configured'
  | 'invalid_origin'
  | 'network_error'
  | 'timeout'
  | 'upstream_3xx'
  | 'upstream_4xx'
  | 'upstream_5xx'
  | 'invalid_content_type'
  | 'invalid_json'
  | 'invalid_response';

class WeatherTransformError extends Error {
  constructor(readonly failureClass: WeatherTransformFailureClass) {
    super('Server weather transform failed');
  }
}

function sanitizedProviderFailure(error: unknown) {
  if (error instanceof WeatherTransformError) {
    return { failure_class: error.failureClass };
  }
  return { error_type: error instanceof Error ? error.name : 'unknown' };
}

function gatewayError(
  context: Context<GatewayEnvironment>,
  code: string,
  message: string,
  status: 400 | 401 | 404 | 429 | 503,
) {
  return context.json({ error: { code, message, request_id: context.get('requestId') } }, status);
}

function dependencyHealthResponse(context: Context<GatewayEnvironment>, healthy: boolean) {
  const response = healthy
    ? context.json({ status: 'ok', database: 'ok' })
    : context.json({ status: 'degraded', database: 'degraded' }, 503);
  response.headers.set('cache-control', 'no-store');
  return response;
}

function transformHealthResponse(context: Context<GatewayEnvironment>, healthy: boolean) {
  const response = healthy
    ? context.json({ status: 'ok' })
    : context.json({ status: 'degraded' }, 503);
  response.headers.set('cache-control', 'no-store');
  return response;
}

function weatherInput(context: { req: { query: (name: string) => string | undefined } }) {
  const latitudeValue = context.req.query('lat');
  const longitudeValue = context.req.query('lon');
  if (!latitudeValue?.trim() || !longitudeValue?.trim()) return undefined;
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  const timezone = context.req.query('timezone') ?? 'auto';
  const units = context.req.query('units') ?? 'metric';

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    !/^[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)*$/.test(timezone) ||
    timezone.length > 64 ||
    (units !== 'metric' && units !== 'imperial')
  ) {
    return undefined;
  }

  return { latitude, longitude, timezone, units } as const;
}

function weatherCacheKeys(url: string, input: ReturnType<typeof weatherInput>) {
  if (!input) throw new Error('Weather cache keys require valid weather input');
  const freshUrl = new URL(url);
  freshUrl.search = new URLSearchParams({
    lat: String(input.latitude),
    lon: String(input.longitude),
    timezone: input.timezone,
    units: input.units,
  }).toString();
  const staleUrl = new URL(freshUrl);
  staleUrl.searchParams.set('__atmos_cache_tier', 'stale');
  return {
    fresh: new Request(freshUrl, { method: 'GET' }),
    stale: new Request(staleUrl, { method: 'GET' }),
  };
}

function usesNextWeatherTransform(env: Bindings | undefined) {
  return Boolean(
    env?.WEATHER_TRANSFORM_ORIGIN &&
    canonicalReleaseId(env.RELEASE_ID, env.CF_VERSION_METADATA?.tag),
  );
}

async function fetchNextWeatherTransform<T>(
  env: Bindings | undefined,
  path:
    | '/api/v1/weather/dashboard'
    | '/api/v1/weather/air-quality'
    | '/api/v1/weather/transform-health',
  input: LocationInput | AirQualityInput | Record<string, never>,
  requestId: string,
  traceparent: string,
): Promise<T> {
  const originValue = env?.WEATHER_TRANSFORM_ORIGIN;
  const serviceToken = env?.WEATHER_TRANSFORM_TOKEN;
  if (!originValue || !serviceToken || serviceToken.length < weatherTransformTokenMinimumLength) {
    throw new WeatherTransformError('not_configured');
  }

  const origin = new URL(originValue);
  if (
    origin.protocol !== 'https:' ||
    origin.hostname !== 'rainify.dpdns.org' ||
    origin.port ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  ) {
    throw new WeatherTransformError('invalid_origin');
  }

  let response: Response;
  try {
    response = await fetch(new URL(path, origin), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${serviceToken}`,
        'content-type': 'application/json',
        'x-request-id': requestId,
        traceparent,
      },
      body: JSON.stringify(input),
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new WeatherTransformError(
      error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network_error',
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    const failureClass: WeatherTransformFailureClass =
      response.status >= 500
        ? 'upstream_5xx'
        : response.status >= 400
          ? 'upstream_4xx'
          : response.status >= 300 || response.type === 'opaqueredirect'
            ? 'upstream_3xx'
            : 'invalid_response';
    throw new WeatherTransformError(failureClass);
  }
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    await response.body?.cancel();
    throw new WeatherTransformError('invalid_content_type');
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new WeatherTransformError('invalid_json');
  }
  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    throw new WeatherTransformError('invalid_response');
  }
  return result as T;
}

function airQualityInput(context: { req: { query: (name: string) => string | undefined } }) {
  const latitudeValue = context.req.query('lat');
  const longitudeValue = context.req.query('lon');
  const view = context.req.query('view');
  if (view !== undefined && view !== 'current' && view !== 'timeline') return undefined;
  if (!latitudeValue?.trim() || !longitudeValue?.trim()) return undefined;
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return undefined;
  }
  return {
    latitude,
    longitude,
    ...(view === 'timeline' ? { includeTimeline: true } : {}),
  } as const;
}

function airQualityCacheKeys(url: string, input: NonNullable<ReturnType<typeof airQualityInput>>) {
  const freshUrl = new URL(url);
  freshUrl.search = new URLSearchParams({
    lat: String(input.latitude),
    lon: String(input.longitude),
  }).toString();
  if (input.includeTimeline) freshUrl.searchParams.set('view', 'timeline');
  const staleUrl = new URL(freshUrl);
  staleUrl.searchParams.set('__atmos_cache_tier', 'stale');
  return {
    fresh: new Request(freshUrl, { method: 'GET' }),
    stale: new Request(staleUrl, { method: 'GET' }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function reserveOpenWeatherTileRequest(now = Date.now()) {
  if (
    now < openWeatherTileWindowStartedAt ||
    now - openWeatherTileWindowStartedAt >= openWeatherTileWindowMilliseconds
  ) {
    openWeatherTileWindowStartedAt = now;
    openWeatherTileRequestCount = 0;
  }
  if (openWeatherTileRequestCount >= openWeatherTileRequestsPerWindow) return false;
  openWeatherTileRequestCount += 1;
  return true;
}

async function openWeatherTileInput(params: Record<string, string>) {
  const { openWeatherMapLayerSchema } = await import('@atmos/contracts');
  const layer = openWeatherMapLayerSchema.safeParse(params.layer);
  const { z: zoomValue, x: xValue, y: yValue } = params;
  if (
    !layer.success ||
    !/^\d{1,2}$/.test(zoomValue ?? '') ||
    !/^\d{1,7}$/.test(xValue ?? '') ||
    !/^\d{1,7}$/.test(yValue ?? '')
  ) {
    return undefined;
  }

  const zoom = Number(zoomValue);
  const x = Number(xValue);
  const y = Number(yValue);
  const tilesAcross = 2 ** zoom;
  if (
    !Number.isSafeInteger(zoom) ||
    zoom < 0 ||
    zoom > 17 ||
    !Number.isSafeInteger(x) ||
    !Number.isSafeInteger(y) ||
    x < 0 ||
    x >= tilesAcross ||
    y < 0 ||
    y >= tilesAcross
  ) {
    return undefined;
  }

  return { layer: layer.data, zoom, x, y } as const;
}

async function normalizeRainViewerTimeline(
  payload: unknown,
): Promise<WeatherRadarTimeline | undefined> {
  if (!isRecord(payload) || payload.host !== rainViewerTileHost) return undefined;
  if (!isRecord(payload.radar) || !Array.isArray(payload.radar.past)) return undefined;

  const now = Math.floor(Date.now() / 1000);
  const oldestAllowed = now - 2 * 60 * 60;
  const newestAllowed = now + 60;
  const frames = payload.radar.past
    .flatMap((frame) => {
      if (!isRecord(frame)) return [];
      const timestamp = frame.time;
      const path = frame.path;
      if (
        typeof timestamp !== 'number' ||
        !Number.isInteger(timestamp) ||
        timestamp < oldestAllowed ||
        timestamp > newestAllowed ||
        typeof path !== 'string' ||
        !/^\/v2\/radar\/[A-Za-z0-9_-]{1,64}$/.test(path)
      ) {
        return [];
      }
      return [{ timestamp, path }];
    })
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(-13);

  const generatedAt =
    typeof payload.generated === 'number' &&
    Number.isInteger(payload.generated) &&
    payload.generated > 0
      ? payload.generated
      : null;
  const { weatherRadarTimelineSchema } = await import('@atmos/contracts');
  const parsed = weatherRadarTimelineSchema.safeParse({
    generatedAt,
    tileHost: rainViewerTileHost,
    frames,
  });
  return parsed.success ? parsed.data : undefined;
}

function locationSearchInput(context: { req: { query: (name: string) => string | undefined } }) {
  const query = context.req.query('q')?.trim().replace(/\s+/g, ' ');
  if (!query || query.length < 2 || query.length > 80) return undefined;
  return query;
}

function locationSearchCacheKey(url: string, query: string) {
  const cacheUrl = new URL(url);
  cacheUrl.search = new URLSearchParams({ q: query.toLocaleLowerCase('en-US') }).toString();
  return new Request(cacheUrl, { method: 'GET' });
}

function coalescedLocationSearch(
  query: string,
  search: () => Promise<LocationSearchResult[]>,
): Promise<LocationSearchResult[]> {
  const existing = locationSearchInFlight.get(query);
  if (existing) return existing;
  const pending = search().finally(() => locationSearchInFlight.delete(query));
  locationSearchInFlight.set(query, pending);
  return pending;
}

function coalescedAirQuality(
  key: string,
  getAirQuality: () => Promise<AirQuality>,
): Promise<AirQuality> {
  const existing = airQualityInFlight.get(key);
  if (existing) return existing;
  const pending = getAirQuality().finally(() => airQualityInFlight.delete(key));
  airQualityInFlight.set(key, pending);
  return pending;
}

export function createApp(
  weatherProvider: WeatherProvider &
    Partial<LocationSearchProvider> &
    Partial<AirQualityProvider> = createLazyOpenMeteoProvider(),
  cache?: WeatherCache,
) {
  const app = new Hono<GatewayEnvironment>();

  app.use('*', async (context, next) => {
    const correlation = createCorrelation(
      context.req.header('x-request-id'),
      context.req.header('traceparent'),
    );
    context.set('requestId', correlation.requestId);
    context.set('traceparent', correlation.traceparent);
    context.header('x-request-id', correlation.requestId);
    context.header('traceparent', correlation.traceparent);
    await next();
  });

  app.use('*', async (context, next) => {
    const startedAt = performance.now();
    await next();
    const routeGroup = requestRouteGroup(context.req.method, context.req.path);
    const releaseId = canonicalReleaseId(
      context.env?.RELEASE_ID,
      context.env?.CF_VERSION_METADATA?.tag,
    );
    recordRequestAnalytics(context.env?.REQUEST_ANALYTICS, {
      workerVersionId: context.env?.CF_VERSION_METADATA?.id,
      releaseId,
      routeGroup,
      status: context.res.status,
      cacheStatus: context.res.headers.get('x-cache') ?? undefined,
      backendRelease:
        routeGroup === 'api_proxy' || routeGroup === 'health_dependencies'
          ? backendReleaseFromUrl(context.env?.SUPABASE_FUNCTION_URL)
          : 'none',
      provider: context.get('analyticsProvider') ?? 'none',
      wallDurationMs: performance.now() - startedAt,
      providerDurationMs: context.get('providerDurationMs'),
    });
  });

  app.use(
    '*',
    cors({
      origin: (origin, context) => {
        const allowedOrigin = context.env?.CORS_ORIGIN ?? 'http://127.0.0.1:3000';
        return origin === allowedOrigin ? origin : undefined;
      },
      allowMethods: ['DELETE', 'GET', 'OPTIONS', 'PATCH', 'POST'],
      allowHeaders: [
        'Authorization',
        'Content-Type',
        'Traceparent',
        'X-Request-Id',
        'X-Atmos-Version-Key',
        'Cloudflare-Workers-Version-Key',
      ],
      maxAge: 86400,
    }),
  );
  app.use('*', secureHeaders());

  app.get('/health', (context) => context.json({ status: 'ok' }));
  app.get('/health/dependencies', async (context) => {
    const functionUrl = context.env?.SUPABASE_FUNCTION_URL;
    if (!functionUrl) return dependencyHealthResponse(context, false);

    let target: URL;
    try {
      target = new URL(
        'health/dependencies',
        functionUrl.endsWith('/') ? functionUrl : `${functionUrl}/`,
      );
    } catch {
      return dependencyHealthResponse(context, false);
    }
    const request = new Request(target, {
      headers: {
        accept: 'application/json',
        'x-request-id': context.get('requestId'),
        traceparent: context.get('traceparent'),
      },
    });
    const providerStartedAt = performance.now();
    context.set('analyticsProvider', 'supabase');
    try {
      const upstream = await fetch(request);
      const body = (await upstream.json().catch(() => undefined)) as
        { status?: unknown; database?: unknown } | undefined;
      const healthy = upstream.ok && body?.status === 'ok' && body.database === 'ok';
      return dependencyHealthResponse(context, healthy);
    } catch {
      return dependencyHealthResponse(context, false);
    } finally {
      context.set('providerDurationMs', performance.now() - providerStartedAt);
    }
  });
  app.get('/health/transform', async (context) => {
    const startedAt = performance.now();
    context.set('analyticsProvider', 'none');
    try {
      if (!usesNextWeatherTransform(context.env)) {
        throw new WeatherTransformError('not_configured');
      }
      const result = await fetchNextWeatherTransform<{ status?: unknown }>(
        context.env,
        '/api/v1/weather/transform-health',
        {},
        context.get('requestId'),
        context.get('traceparent'),
      );
      if (result.status !== 'ok') throw new WeatherTransformError('invalid_response');
      return transformHealthResponse(context, true);
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: 'weather_transform_health_failed',
          request_id: context.get('requestId'),
          trace_id: context.get('traceparent').split('-')[1],
          ...sanitizedProviderFailure(error),
        }),
      );
      return transformHealthResponse(context, false);
    } finally {
      context.set('providerDurationMs', performance.now() - startedAt);
    }
  });
  app.get('/version', (context) =>
    context.json({
      release:
        canonicalReleaseId(context.env.RELEASE_ID, context.env.CF_VERSION_METADATA?.tag) ?? 'local',
    }),
  );

  app.get('/api/v1/weather/dashboard', async (context) => {
    const input = weatherInput(context);
    if (!input) {
      return gatewayError(
        context,
        'INVALID_LOCATION',
        'Valid latitude and longitude query parameters are required.',
        400,
      );
    }

    const cacheKeys = weatherCacheKeys(context.req.url, input);
    const weatherCache =
      cache ??
      (typeof caches === 'undefined'
        ? noWeatherCache
        : (caches as CacheStorage & { default: WeatherCache }).default);
    let staleResponse: Response | undefined;
    try {
      const cachedResponse = await weatherCache.match(cacheKeys.fresh);
      if (cachedResponse) {
        context.set('analyticsProvider', 'cache');
        const response = new Response(cachedResponse.body, cachedResponse);
        response.headers.set('x-cache', 'HIT');
        return response;
      }
      staleResponse = await weatherCache.match(cacheKeys.stale);
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: 'weather_cache_read_failed',
          request_id: context.get('requestId'),
          trace_id: context.get('traceparent').split('-')[1],
          error_type: error instanceof Error ? error.name : 'unknown',
        }),
      );
    }

    let dashboard: Dashboard;
    const providerStartedAt = performance.now();
    context.set('analyticsProvider', 'open-meteo');
    try {
      dashboard = usesNextWeatherTransform(context.env)
        ? await fetchNextWeatherTransform<Dashboard>(
            context.env,
            '/api/v1/weather/dashboard',
            input,
            context.get('requestId'),
            context.get('traceparent'),
          )
        : await weatherProvider.getDashboard(input);
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: 'weather_provider_failed',
          request_id: context.get('requestId'),
          trace_id: context.get('traceparent').split('-')[1],
          cache_status: staleResponse ? 'STALE' : 'MISS',
          ...sanitizedProviderFailure(error),
        }),
      );
      if (staleResponse) {
        const response = new Response(staleResponse.body, staleResponse);
        response.headers.set('cache-control', 'private, no-store');
        response.headers.set('x-cache', 'STALE');
        return response;
      }
      return gatewayError(
        context,
        'WEATHER_UNAVAILABLE',
        'Weather is temporarily unavailable.',
        503,
      );
    } finally {
      context.set('providerDurationMs', performance.now() - providerStartedAt);
    }

    const responseBodies = serializeWeatherCacheVariants(dashboard);
    const response = context.body(responseBodies.response, 200, {
      'content-type': 'application/json; charset=UTF-8',
    });
    response.headers.set(
      'cache-control',
      `public, max-age=${weatherCacheTtlSeconds}, s-maxage=${weatherCacheTtlSeconds}`,
    );
    response.headers.set('x-cache', 'MISS');
    try {
      await Promise.all([
        weatherCache.put(
          cacheKeys.fresh,
          new Response(responseBodies.fresh, {
            headers: {
              'content-type': 'application/json',
              'cache-control': `public, max-age=${weatherCacheTtlSeconds}, s-maxage=${weatherCacheTtlSeconds}`,
            },
          }),
        ),
        weatherCache.put(
          cacheKeys.stale,
          new Response(responseBodies.stale, {
            headers: {
              'content-type': 'application/json',
              'cache-control': `public, max-age=0, s-maxage=${staleWeatherCacheTtlSeconds}`,
            },
          }),
        ),
      ]);
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: 'weather_cache_write_failed',
          request_id: context.get('requestId'),
          trace_id: context.get('traceparent').split('-')[1],
          error_type: error instanceof Error ? error.name : 'unknown',
        }),
      );
    }
    return response;
  });

  app.get('/api/v1/weather/air-quality', async (context) => {
    const input = airQualityInput(context);
    if (!input) {
      return gatewayError(
        context,
        'INVALID_LOCATION',
        'Valid latitude and longitude query parameters are required.',
        400,
      );
    }

    const airQualityCache =
      cache ??
      (typeof caches === 'undefined'
        ? noWeatherCache
        : (caches as CacheStorage & { default: WeatherCache }).default);
    const cacheKeys = airQualityCacheKeys(context.req.url, input);
    let staleResponse: Response | undefined;
    try {
      const cached = await airQualityCache.match(cacheKeys.fresh);
      if (cached) {
        context.set('analyticsProvider', 'cache');
        const response = new Response(cached.body, cached);
        response.headers.set('x-cache', 'HIT');
        return response;
      }
      staleResponse = await airQualityCache.match(cacheKeys.stale);
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: 'air_quality_cache_read_failed',
          request_id: context.get('requestId'),
          trace_id: context.get('traceparent').split('-')[1],
          error_type: error instanceof Error ? error.name : 'unknown',
        }),
      );
    }

    const useNextTransform =
      input.includeTimeline === true && usesNextWeatherTransform(context.env);
    if (!useNextTransform && !weatherProvider.getAirQuality) {
      return gatewayError(
        context,
        'AIR_QUALITY_UNAVAILABLE',
        'Air quality is temporarily unavailable.',
        503,
      );
    }

    const key = `${input.latitude}:${input.longitude}:${input.includeTimeline ? 'timeline' : 'current'}`;
    const providerStartedAt = performance.now();
    context.set('analyticsProvider', 'open-meteo');
    try {
      const airQuality = await coalescedAirQuality(key, async () => {
        if (useNextTransform) {
          return fetchNextWeatherTransform<AirQuality>(
            context.env,
            '/api/v1/weather/air-quality',
            input,
            context.get('requestId'),
            context.get('traceparent'),
          );
        }
        const result = await weatherProvider.getAirQuality!(input);
        const { airQualitySchema } = await import('@atmos/contracts');
        const parsed = airQualitySchema.safeParse(result);
        if (!parsed.success || (input.includeTimeline && !parsed.data.timeline)) {
          throw new Error('Air-quality response has an invalid shape');
        }
        return parsed.data;
      });

      const responseBodies = serializeWeatherCacheVariants(airQuality);
      const response = context.body(responseBodies.response, 200, {
        'content-type': 'application/json; charset=UTF-8',
      });
      response.headers.set(
        'cache-control',
        `public, max-age=${airQualityCacheTtlSeconds}, s-maxage=${airQualityCacheTtlSeconds}`,
      );
      response.headers.set('x-cache', 'MISS');
      try {
        await Promise.all([
          airQualityCache.put(
            cacheKeys.fresh,
            new Response(responseBodies.fresh, {
              headers: {
                'content-type': 'application/json',
                'cache-control': `public, max-age=${airQualityCacheTtlSeconds}, s-maxage=${airQualityCacheTtlSeconds}`,
              },
            }),
          ),
          airQualityCache.put(
            cacheKeys.stale,
            new Response(responseBodies.stale, {
              headers: {
                'content-type': 'application/json',
                'cache-control': `public, max-age=0, s-maxage=${staleWeatherCacheTtlSeconds}`,
              },
            }),
          ),
        ]);
      } catch (error) {
        console.warn(
          JSON.stringify({
            event: 'air_quality_cache_write_failed',
            request_id: context.get('requestId'),
            trace_id: context.get('traceparent').split('-')[1],
            error_type: error instanceof Error ? error.name : 'unknown',
          }),
        );
      }
      return response;
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: 'air_quality_provider_failed',
          request_id: context.get('requestId'),
          trace_id: context.get('traceparent').split('-')[1],
          cache_status: staleResponse ? 'STALE' : 'MISS',
          ...sanitizedProviderFailure(error),
        }),
      );
      if (staleResponse) {
        const response = new Response(staleResponse.body, staleResponse);
        response.headers.set('cache-control', 'private, no-store');
        response.headers.set('x-cache', 'STALE');
        return response;
      }
      return gatewayError(
        context,
        'AIR_QUALITY_UNAVAILABLE',
        'Air quality is temporarily unavailable.',
        503,
      );
    } finally {
      context.set('providerDurationMs', performance.now() - providerStartedAt);
    }
  });

  app.get('/api/v1/weather/radar/frames', async (context) => {
    const radarCache =
      cache ??
      (typeof caches === 'undefined'
        ? noWeatherCache
        : (caches as CacheStorage & { default: WeatherCache }).default);
    const cacheUrl = new URL('/api/v1/weather/radar/frames', context.req.url);
    cacheUrl.searchParams.set('__atmos_cache_schema', '2');
    const cacheKey = new Request(cacheUrl, { method: 'GET' });

    try {
      const cached = await radarCache.match(cacheKey);
      if (cached) {
        context.set('analyticsProvider', 'cache');
        const response = new Response(cached.body, cached);
        response.headers.set('x-cache', 'HIT');
        return response;
      }
    } catch {
      // Radar metadata remains available when the best-effort edge cache is unavailable.
    }

    const providerStartedAt = performance.now();
    context.set('analyticsProvider', 'rainviewer');
    try {
      const upstream = await fetch(rainViewerMetadataUrl, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(5_000),
      });
      if (!upstream.ok) throw new Error('RainViewer metadata request failed');

      const contentLength = Number(upstream.headers.get('content-length'));
      if (Number.isFinite(contentLength) && contentLength > 64_000) {
        throw new Error('RainViewer metadata response exceeded the size limit');
      }
      const body = await upstream.text();
      if (body.length > 64_000)
        throw new Error('RainViewer metadata response exceeded the size limit');

      let payload: unknown;
      try {
        payload = JSON.parse(body);
      } catch {
        throw new Error('RainViewer metadata was not valid JSON');
      }
      const timeline = await normalizeRainViewerTimeline(payload);
      if (!timeline) throw new Error('RainViewer metadata did not match the expected contract');

      const cacheControl = `public, max-age=${weatherRadarCacheTtlSeconds}, s-maxage=${weatherRadarCacheTtlSeconds}`;
      const response = context.json(timeline);
      response.headers.set('cache-control', cacheControl);
      response.headers.set('x-cache', 'MISS');
      try {
        await radarCache.put(
          cacheKey,
          Response.json(timeline, { headers: { 'cache-control': cacheControl } }),
        );
      } catch {
        // Cache writes are an optimization, not a reason to reject valid radar metadata.
      }
      return response;
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: 'weather_radar_metadata_failed',
          request_id: context.get('requestId'),
          trace_id: context.get('traceparent').split('-')[1],
          error_type: error instanceof Error ? error.name : 'unknown',
        }),
      );
      return gatewayError(
        context,
        'RADAR_UNAVAILABLE',
        'Weather radar is temporarily unavailable.',
        503,
      );
    } finally {
      context.set('providerDurationMs', performance.now() - providerStartedAt);
    }
  });

  app.get('/api/v1/weather/map/layers', async (context) => {
    const { weatherMapConfigurationSchema } = await import('@atmos/contracts');
    const configuration = weatherMapConfigurationSchema.parse({
      openWeatherAvailable: Boolean(context.env?.OPENWEATHER_API_KEY?.trim()),
    });
    const response = context.json(configuration);
    response.headers.set('cache-control', 'no-store');
    return response;
  });

  app.get('/api/v1/weather/maps/openweather/:layer/:z/:x/:y', async (context) => {
    const input = await openWeatherTileInput(context.req.param());
    if (!input) {
      return gatewayError(
        context,
        'INVALID_MAP_TILE',
        'A supported weather-map layer and valid tile coordinates are required.',
        400,
      );
    }

    const apiKey = context.env?.OPENWEATHER_API_KEY?.trim();
    if (!apiKey) {
      return gatewayError(
        context,
        'OPENWEATHER_MAPS_UNAVAILABLE',
        'OpenWeather map layers are not configured.',
        503,
      );
    }

    const tileUrl = new URL(context.req.url);
    tileUrl.search = '';
    const cacheKey = new Request(tileUrl, { method: 'GET' });
    const tileCache =
      cache ??
      (typeof caches === 'undefined'
        ? noWeatherCache
        : (caches as CacheStorage & { default: WeatherCache }).default);
    try {
      const cached = await tileCache.match(cacheKey);
      if (cached) {
        context.set('analyticsProvider', 'cache');
        const response = new Response(cached.body, cached);
        response.headers.set('x-cache', 'HIT');
        return response;
      }
    } catch {
      // Continue to the provider when a best-effort edge cache read fails.
    }

    if (!reserveOpenWeatherTileRequest()) {
      return gatewayError(
        context,
        'MAP_TILE_RATE_LIMITED',
        'Weather-map tiles are temporarily rate limited.',
        429,
      );
    }

    const providerStartedAt = performance.now();
    context.set('analyticsProvider', 'openweather');
    try {
      const upstreamUrl = new URL(
        `https://tile.openweathermap.org/map/${input.layer}/${input.zoom}/${input.x}/${input.y}.png`,
      );
      upstreamUrl.searchParams.set('appid', apiKey);
      const upstream = await fetch(upstreamUrl, {
        headers: { accept: 'image/png' },
        signal: AbortSignal.timeout(5_000),
      });
      const contentLength = Number(upstream.headers.get('content-length'));
      if (
        !upstream.ok ||
        !upstream.headers.get('content-type')?.startsWith('image/png') ||
        (Number.isFinite(contentLength) && contentLength > 1_000_000)
      ) {
        throw new Error('OpenWeather returned an invalid map tile');
      }

      const cacheControl = `public, max-age=${weatherMapTileCacheTtlSeconds}, s-maxage=${weatherMapTileCacheTtlSeconds}`;
      const response = new Response(upstream.body, {
        headers: {
          'cache-control': cacheControl,
          'content-type': 'image/png',
          'x-cache': 'MISS',
        },
      });
      try {
        await tileCache.put(cacheKey, response.clone());
      } catch {
        // Cache writes are an optimization, not a reason to reject a valid tile.
      }
      return response;
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: 'openweather_map_tile_failed',
          request_id: context.get('requestId'),
          trace_id: context.get('traceparent').split('-')[1],
          error_type: error instanceof Error ? error.name : 'unknown',
        }),
      );
      return gatewayError(
        context,
        'OPENWEATHER_MAPS_UNAVAILABLE',
        'OpenWeather map tiles are temporarily unavailable.',
        503,
      );
    } finally {
      context.set('providerDurationMs', performance.now() - providerStartedAt);
    }
  });

  app.get('/api/v1/locations/search', async (context) => {
    const query = locationSearchInput(context);
    if (!query) {
      return gatewayError(
        context,
        'INVALID_LOCATION_SEARCH',
        'A location search query between 2 and 80 characters is required.',
        400,
      );
    }
    if (!weatherProvider.searchLocations) {
      return gatewayError(context, 'LOCATIONS_UNAVAILABLE', 'Location search is unavailable.', 503);
    }

    const searchCache =
      cache ??
      (typeof caches === 'undefined'
        ? noWeatherCache
        : (caches as CacheStorage & { default: WeatherCache }).default);
    const cacheKey = locationSearchCacheKey(context.req.url, query);
    try {
      const cached = await searchCache.match(cacheKey);
      if (cached) {
        context.set('analyticsProvider', 'cache');
        const response = new Response(cached.body, cached);
        response.headers.set('x-cache', 'HIT');
        return response;
      }
    } catch {
      // Location search remains available if a best-effort edge cache read fails.
    }

    context.set('analyticsProvider', 'open-meteo');
    const providerStartedAt = performance.now();
    try {
      const locations = await coalescedLocationSearch(query, () =>
        weatherProvider.searchLocations!(query),
      );
      const response = context.json({ results: locations });
      response.headers.set(
        'cache-control',
        `public, max-age=${locationSearchCacheTtlSeconds}, s-maxage=${locationSearchCacheTtlSeconds}`,
      );
      response.headers.set('x-cache', 'MISS');
      try {
        await searchCache.put(
          cacheKey,
          Response.json(
            { results: locations },
            {
              headers: {
                'cache-control': `public, max-age=${locationSearchCacheTtlSeconds}, s-maxage=${locationSearchCacheTtlSeconds}`,
              },
            },
          ),
        );
      } catch {
        // Caching is an optimization, not a reason to reject a valid bounded search.
      }
      return response;
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: 'location_search_failed',
          request_id: context.get('requestId'),
          trace_id: context.get('traceparent').split('-')[1],
          error_type: error instanceof Error ? error.name : 'unknown',
        }),
      );
      return gatewayError(
        context,
        'LOCATIONS_UNAVAILABLE',
        'Location search is temporarily unavailable.',
        503,
      );
    } finally {
      context.set('providerDurationMs', performance.now() - providerStartedAt);
    }
  });

  app.all('/api/*', async (context) => {
    const functionUrl = context.env?.SUPABASE_FUNCTION_URL;
    if (!functionUrl) {
      return gatewayError(context, 'API_UNAVAILABLE', 'API is temporarily unavailable.', 503);
    }

    let target: URL;
    try {
      target = new URL(
        context.req.path.slice(1),
        functionUrl.endsWith('/') ? functionUrl : `${functionUrl}/`,
      );
    } catch {
      return gatewayError(context, 'API_UNAVAILABLE', 'API is temporarily unavailable.', 503);
    }
    target.search = new URL(context.req.url).search;
    const request = new Request(target, context.req.raw);
    for (const header of [...request.headers.keys()]) {
      if (!forwardedProxyHeaders.has(header)) request.headers.delete(header);
    }
    request.headers.set('x-request-id', context.get('requestId'));
    request.headers.set('traceparent', context.get('traceparent'));
    const providerStartedAt = performance.now();
    context.set('analyticsProvider', 'supabase');
    try {
      const response = await fetch(new Request(request, { signal: AbortSignal.timeout(5_000) }));
      return new Response(response.body, response);
    } catch {
      return gatewayError(context, 'API_UNAVAILABLE', 'API is temporarily unavailable.', 503);
    } finally {
      context.set('providerDurationMs', performance.now() - providerStartedAt);
    }
  });

  app.notFound((context) => gatewayError(context, 'NOT_FOUND', 'Route not found.', 404));

  return app;
}

export const app = createApp();

export default { fetch: app.fetch };
