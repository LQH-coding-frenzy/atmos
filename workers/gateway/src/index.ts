import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { OpenMeteoProvider } from '@atmos/provider-openmeteo';
import type { WeatherProvider } from '@atmos/contracts';

type Bindings = {
  CORS_ORIGIN?: string;
  RELEASE_ID?: string;
  SUPABASE_FUNCTION_URL?: string;
};

type WeatherCache = Pick<Cache, 'match' | 'put'>;

const weatherCacheTtlSeconds = 300;
const noWeatherCache: WeatherCache = {
  match: async () => undefined,
  put: async () => undefined,
};

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

export function createApp(
  weatherProvider: WeatherProvider = new OpenMeteoProvider(),
  cache?: WeatherCache,
) {
  const app = new Hono<{ Bindings: Bindings }>();

  app.use('*', async (context, next) => {
    const requestId = context.req.header('x-request-id') ?? crypto.randomUUID();
    context.header('x-request-id', requestId);
    await next();
  });

  app.use(
    '*',
    cors({
      origin: (origin, context) => {
        const allowedOrigin = context.env?.CORS_ORIGIN ?? 'http://127.0.0.1:3000';
        return origin === allowedOrigin ? origin : allowedOrigin;
      },
      allowMethods: ['GET', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
      maxAge: 86400,
    }),
  );
  app.use('*', secureHeaders());

  app.get('/health', (context) => context.json({ status: 'ok' }));
  app.get('/version', (context) => context.json({ release: context.env.RELEASE_ID ?? 'local' }));

  app.get('/api/v1/weather/dashboard', async (context) => {
    const input = weatherInput(context);
    if (!input) {
      return context.json(
        {
          error: {
            code: 'INVALID_LOCATION',
            message: 'Valid latitude and longitude query parameters are required.',
          },
        },
        400,
      );
    }

    const cacheKey = new Request(context.req.url, { method: 'GET' });
    const weatherCache =
      cache ??
      (typeof caches === 'undefined'
        ? noWeatherCache
        : (caches as CacheStorage & { default: WeatherCache }).default);
    const cachedResponse = await weatherCache.match(cacheKey);
    if (cachedResponse) {
      const response = new Response(cachedResponse.body, cachedResponse);
      response.headers.set('x-cache', 'HIT');
      return response;
    }

    try {
      const response = context.json(await weatherProvider.getDashboard(input));
      response.headers.set('cache-control', `public, max-age=${weatherCacheTtlSeconds}`);
      response.headers.set('x-cache', 'MISS');
      await weatherCache.put(cacheKey, response.clone());
      return response;
    } catch {
      return context.json(
        { error: { code: 'WEATHER_UNAVAILABLE', message: 'Weather is temporarily unavailable.' } },
        503,
      );
    }
  });

  app.all('/api/*', async (context) => {
    const functionUrl = context.env?.SUPABASE_FUNCTION_URL;
    if (!functionUrl) {
      return context.json(
        { error: { code: 'API_UNAVAILABLE', message: 'API is temporarily unavailable.' } },
        503,
      );
    }

    const target = new URL(
      context.req.path.slice(1),
      functionUrl.endsWith('/') ? functionUrl : `${functionUrl}/`,
    );
    target.search = new URL(context.req.url).search;
    const request = new Request(target, context.req.raw);
    request.headers.set(
      'x-request-id',
      context.res.headers.get('x-request-id') ?? crypto.randomUUID(),
    );
    return fetch(request);
  });

  app.notFound((context) =>
    context.json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } }, 404),
  );

  return app;
}

export const app = createApp();
export default app;
