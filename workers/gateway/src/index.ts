import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { OpenMeteoProvider } from '@atmos/provider-openmeteo';
import type { Dashboard, WeatherProvider } from '@atmos/contracts';
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
  RELEASE_ID?: string;
  SUPABASE_FUNCTION_URL?: string;
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
const staleWeatherCacheTtlSeconds = 3600;
const forwardedProxyHeaders = new Set(['accept', 'authorization', 'content-type']);
const noWeatherCache: WeatherCache = {
  match: async () => undefined,
  put: async () => undefined,
};

function gatewayError(
  context: Context<GatewayEnvironment>,
  code: string,
  message: string,
  status: 400 | 401 | 404 | 503,
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

export function createApp(
  weatherProvider: WeatherProvider = new OpenMeteoProvider(),
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
      allowMethods: ['GET', 'OPTIONS', 'POST'],
      allowHeaders: ['Authorization', 'Content-Type', 'Traceparent', 'X-Request-Id'],
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
      dashboard = await weatherProvider.getDashboard(input);
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: 'weather_provider_failed',
          request_id: context.get('requestId'),
          trace_id: context.get('traceparent').split('-')[1],
          cache_status: staleResponse ? 'STALE' : 'MISS',
          error_type: error instanceof Error ? error.name : 'unknown',
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

    const response = context.json(dashboard);
    response.headers.set(
      'cache-control',
      `public, max-age=${weatherCacheTtlSeconds}, s-maxage=${weatherCacheTtlSeconds}`,
    );
    response.headers.set('x-cache', 'MISS');
    try {
      await Promise.all([
        weatherCache.put(
          cacheKeys.fresh,
          Response.json(
            { ...dashboard, meta: { ...dashboard.meta, cached: true, stale: false } },
            {
              headers: {
                'cache-control': `public, max-age=${weatherCacheTtlSeconds}, s-maxage=${weatherCacheTtlSeconds}`,
              },
            },
          ),
        ),
        weatherCache.put(
          cacheKeys.stale,
          Response.json(
            { ...dashboard, meta: { ...dashboard.meta, cached: true, stale: true } },
            {
              headers: {
                'cache-control': `public, max-age=0, s-maxage=${staleWeatherCacheTtlSeconds}`,
              },
            },
          ),
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
