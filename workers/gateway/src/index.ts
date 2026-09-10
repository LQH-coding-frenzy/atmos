import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { OpenMeteoProvider } from '@atmos/provider-openmeteo';
import type { Dashboard, WeatherProvider } from '@atmos/contracts';
import { assertNotificationMessage, type NotificationQueueMessage } from './notification-queue';
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
  INTERNAL_QUEUE_SECRET?: string;
  NOTIFICATION_QUEUE?: Queue<NotificationQueueMessage>;
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

function weatherInput(context: { req: { query: (name: string) => string | undefined } }) {
  const latitude = Number(context.req.query('lat'));
  const longitude = Number(context.req.query('lon'));
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

function weatherCacheKeys(url: string) {
  const freshUrl = new URL(url);
  freshUrl.searchParams.delete('__atmos_cache_tier');
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
        routeGroup === 'api_proxy'
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
  app.get('/version', (context) =>
    context.json({
      release:
        canonicalReleaseId(context.env.RELEASE_ID, context.env.CF_VERSION_METADATA?.tag) ?? 'local',
    }),
  );

  app.post('/internal/notifications/publish', async (context) => {
    if (
      !context.env.INTERNAL_QUEUE_SECRET ||
      context.req.header('x-internal-queue-secret') !== context.env.INTERNAL_QUEUE_SECRET
    ) {
      return gatewayError(context, 'UNAUTHORIZED', 'Internal authorization is required.', 401);
    }
    if (!context.env.NOTIFICATION_QUEUE) {
      return gatewayError(context, 'QUEUE_UNAVAILABLE', 'Notification queue is unavailable.', 503);
    }
    const messages = await context.req.json<unknown>().catch(() => undefined);
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 100) {
      return gatewayError(context, 'INVALID_MESSAGE', 'Notification batch is invalid.', 400);
    }
    try {
      messages.forEach((message) => assertNotificationMessage(message as NotificationQueueMessage));
    } catch {
      return gatewayError(context, 'INVALID_MESSAGE', 'Notification batch is invalid.', 400);
    }
    const notificationMessages = messages as NotificationQueueMessage[];
    const providerStartedAt = performance.now();
    context.set('analyticsProvider', 'cloudflare-queue');
    try {
      await context.env.NOTIFICATION_QUEUE.sendBatch(
        notificationMessages.map((body) => ({ body })),
      );
    } finally {
      context.set('providerDurationMs', performance.now() - providerStartedAt);
    }
    return context.json({ published: notificationMessages.length });
  });

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

    const cacheKeys = weatherCacheKeys(context.req.url);
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

    const target = new URL(
      context.req.path.slice(1),
      functionUrl.endsWith('/') ? functionUrl : `${functionUrl}/`,
    );
    target.search = new URL(context.req.url).search;
    const request = new Request(target, context.req.raw);
    request.headers.set('x-request-id', context.get('requestId'));
    request.headers.set('traceparent', context.get('traceparent'));
    const providerStartedAt = performance.now();
    context.set('analyticsProvider', 'supabase');
    try {
      return await fetch(request);
    } finally {
      context.set('providerDurationMs', performance.now() - providerStartedAt);
    }
  });

  app.notFound((context) => gatewayError(context, 'NOT_FOUND', 'Route not found.', 404));

  return app;
}

export const app = createApp();

export default {
  fetch: app.fetch,
  async queue(
    batch: MessageBatch<import('./notification-queue').NotificationQueueMessage>,
    env: Bindings,
  ) {
    if (!env.SUPABASE_FUNCTION_URL || !env.INTERNAL_QUEUE_SECRET) {
      throw new Error('Queue consumer is not configured');
    }
    for (const message of batch.messages) {
      const correlation = createCorrelation(undefined, undefined);
      const response = await fetch(`${env.SUPABASE_FUNCTION_URL}/internal/notifications/deliver`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-queue-secret': env.INTERNAL_QUEUE_SECRET,
          'x-request-id': correlation.requestId,
          traceparent: correlation.traceparent,
        },
        body: JSON.stringify(message.body),
      });
      if (response.ok) message.ack();
      else message.retry();
    }
  },
};
