import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockWeatherProvider } from '@atmos/provider-openmeteo';
import { app, createApp } from './index';
import worker from './index';

describe('gateway', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  it('acks successful queue deliveries and retries failed delivery claims', async () => {
    const ack = vi.fn();
    const retry = vi.fn();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 503 }));
    vi.stubGlobal('fetch', fetcher);
    await worker.queue(
      {
        messages: [
          {
            body: {
              version: 1,
              event_id: 'event',
              delivery_id: 'first',
              kind: 'weather-alert',
              attempt_hint: 0,
            },
            ack,
            retry,
          },
          {
            body: {
              version: 1,
              event_id: 'event',
              delivery_id: 'second',
              kind: 'weather-alert',
              attempt_hint: 0,
            },
            ack,
            retry,
          },
        ],
      } as unknown as MessageBatch<import('./notification-queue').NotificationQueueMessage>,
      {
        SUPABASE_FUNCTION_URL: 'https://project/functions/v1/api-v1',
        INTERNAL_QUEUE_SECRET: 'test',
      },
    );
    expect(ack).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledTimes(1);
  });
  it('returns cheap health and version responses with a request ID', async () => {
    const health = await app.request('http://localhost/health');
    const version = await app.request('http://localhost/version', undefined, {
      RELEASE_ID: 'abcdef012345',
    });

    expect(health.status).toBe(200);
    expect(health.headers.get('x-request-id')).toBeTruthy();
    expect(health.headers.get('traceparent')).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
    await expect(health.json()).resolves.toEqual({ status: 'ok' });
    await expect(version.json()).resolves.toEqual({ release: 'abcdef012345' });
  });

  it('records bounded release telemetry without changing the response', async () => {
    const writeDataPoint = vi.fn();
    const response = await app.request('http://localhost/health?user=private', undefined, {
      REQUEST_ANALYTICS: { writeDataPoint },
      CF_VERSION_METADATA: {
        id: '7cf6db10-8f5e-4cb2-a70c-34a1d3f28193',
        tag: 'abcdef012345',
        timestamp: '2026-09-10T00:00:00.000Z',
      },
    });

    expect(response.status).toBe(200);
    expect(writeDataPoint).toHaveBeenCalledOnce();
    expect(writeDataPoint.mock.calls[0]?.[0]).toMatchObject({
      indexes: ['7cf6db10-8f5e-4cb2-a70c-34a1d3f28193'],
      blobs: ['abcdef012345', 'health', '2xx', 'BYPASS', 'none', 'none'],
    });
    expect(JSON.stringify(writeDataPoint.mock.calls[0]?.[0])).not.toContain('private');
  });

  it('preserves valid correlation headers and replaces invalid values', async () => {
    const traceparent = '00-1234567890abcdef1234567890abcdef-1234567890abcdef-01';
    const preserved = await app.request('http://localhost/health', {
      headers: { 'x-request-id': 'browser_request-1', traceparent },
    });
    const replaced = await app.request('http://localhost/health', {
      headers: {
        'x-request-id': 'x'.repeat(129),
        traceparent: `00-${'0'.repeat(32)}-${'0'.repeat(16)}-01`,
      },
    });

    expect(preserved.headers.get('x-request-id')).toBe('browser_request-1');
    expect(preserved.headers.get('traceparent')).toBe(traceparent);
    expect(replaced.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(replaced.headers.get('traceparent')).toMatch(
      /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/,
    );
  });

  it('allows configured browser origins to preflight API writes', async () => {
    const response = await app.request(
      'http://localhost/api/v1/locations',
      {
        method: 'OPTIONS',
        headers: {
          origin: 'https://rainify.dpdns.org',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'authorization,traceparent,x-request-id',
        },
      },
      { CORS_ORIGIN: 'https://rainify.dpdns.org' },
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://rainify.dpdns.org');
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
    expect(response.headers.get('access-control-allow-headers')).toContain('Traceparent');
  });

  it('does not grant cross-origin access to unconfigured origins', async () => {
    const response = await app.request(
      'http://localhost/health',
      { headers: { origin: 'https://untrusted.example' } },
      { CORS_ORIGIN: 'https://rainify.dpdns.org' },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('returns stable sanitized errors for unknown routes', async () => {
    const response = await app.request('http://localhost/nope');
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'NOT_FOUND', message: 'Route not found.', request_id: expect.any(String) },
    });
  });

  it('proxies API requests to the configured versioned function', async () => {
    const fetcher = vi.fn(async (request: Request) => {
      void request;
      return new Response('ok', { headers: { 'x-upstream': 'preserved' } });
    });
    vi.stubGlobal('fetch', fetcher);

    const response = await app.request(
      'http://localhost/api/v1/me?detail=full',
      {
        headers: {
          accept: 'application/json',
          authorization: 'Bearer user-token',
          'cf-connecting-ip': '192.0.2.1',
          cookie: 'private=session',
          'x-request-id': 'proxy_request-1',
          traceparent: '00-1234567890abcdef1234567890abcdef-1234567890abcdef-01',
        },
      },
      { SUPABASE_FUNCTION_URL: 'https://project.supabase.co/functions/v1/api-v1' },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-upstream')).toBe('preserved');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0].url).toBe(
      'https://project.supabase.co/functions/v1/api-v1/api/v1/me?detail=full',
    );
    expect(fetcher.mock.calls[0]?.[0].headers.get('x-request-id')).toBe('proxy_request-1');
    expect(fetcher.mock.calls[0]?.[0].headers.get('traceparent')).toBe(
      '00-1234567890abcdef1234567890abcdef-1234567890abcdef-01',
    );
    expect(fetcher.mock.calls[0]?.[0].headers.get('accept')).toBe('application/json');
    expect(fetcher.mock.calls[0]?.[0].headers.get('authorization')).toBe('Bearer user-token');
    expect(fetcher.mock.calls[0]?.[0].headers.get('cf-connecting-ip')).toBeNull();
    expect(fetcher.mock.calls[0]?.[0].headers.get('cookie')).toBeNull();
    await expect(response.text()).resolves.toBe('ok');
  });

  it('returns a sanitized response when no function is configured', async () => {
    const response = await app.request('http://localhost/api/v1/me');

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'API_UNAVAILABLE',
        message: 'API is temporarily unavailable.',
        request_id: expect.any(String),
      },
    });
  });

  it('returns normalized public weather before the Supabase proxy', async () => {
    const getDashboard = vi.fn(
      new MockWeatherProvider().getDashboard.bind(new MockWeatherProvider()),
    );
    const weatherApp = createApp({ getDashboard });

    const response = await weatherApp.request(
      'http://localhost/api/v1/weather/dashboard?lat=52.52&lon=13.405&timezone=Europe%2FBerlin&units=metric',
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      location: { name: 'Berlin', latitude: 52.52, longitude: 13.405 },
      meta: { provider: 'mock' },
    });
    expect(getDashboard).toHaveBeenCalledWith({
      latitude: 52.52,
      longitude: 13.405,
      timezone: 'Europe/Berlin',
      units: 'metric',
    });
  });

  it('rejects invalid location input before calling the provider', async () => {
    const getDashboard = vi.fn();
    const weatherApp = createApp({ getDashboard });

    const response = await weatherApp.request(
      'http://localhost/api/v1/weather/dashboard?lat=91&lon=13.405',
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'INVALID_LOCATION',
        message: 'Valid latitude and longitude query parameters are required.',
        request_id: expect.any(String),
      },
    });
    expect(getDashboard).not.toHaveBeenCalled();
  });

  it('sanitizes an upstream weather failure', async () => {
    const weatherApp = createApp({
      getDashboard: async () => {
        throw new Error('upstream response body');
      },
    });

    const response = await weatherApp.request(
      'http://localhost/api/v1/weather/dashboard?lat=52.52&lon=13.405',
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'WEATHER_UNAVAILABLE',
        message: 'Weather is temporarily unavailable.',
        request_id: expect.any(String),
      },
    });
  });

  it('serves the bounded stale tier when the weather provider fails', async () => {
    const staleDashboard = await new MockWeatherProvider().getDashboard({
      latitude: 52.52,
      longitude: 13.405,
      timezone: 'Europe/Berlin',
      units: 'metric',
    });
    const cache = {
      match: vi.fn(async (request: Request) =>
        request.url.includes('__atmos_cache_tier=stale')
          ? Response.json({
              ...staleDashboard,
              meta: { ...staleDashboard.meta, cached: true, stale: true },
            })
          : undefined,
      ),
      put: vi.fn(),
    };
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const weatherApp = createApp(
      {
        getDashboard: async () => {
          throw new Error('sensitive upstream response');
        },
      },
      cache,
    );

    const response = await weatherApp.request(
      'http://localhost/api/v1/weather/dashboard?lat=52.52&lon=13.405',
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-cache')).toBe('STALE');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toMatchObject({
      location: { name: 'Berlin' },
      meta: { cached: true, stale: true },
    });
    expect(warning).toHaveBeenCalledOnce();
    expect(JSON.parse(String(warning.mock.calls[0]?.[0]))).toMatchObject({
      event: 'weather_provider_failed',
      cache_status: 'STALE',
      error_type: 'Error',
    });
    expect(warning.mock.calls[0]?.[0]).not.toContain('sensitive upstream response');
  });

  it('serves cached public weather without calling the provider', async () => {
    const getDashboard = vi.fn();
    const cache = {
      match: vi.fn(async () =>
        Response.json({ location: { name: 'Berlin' }, meta: { provider: 'mock' } }),
      ),
      put: vi.fn(),
    };
    const weatherApp = createApp({ getDashboard }, cache);

    const response = await weatherApp.request(
      'http://localhost/api/v1/weather/dashboard?lat=52.52&lon=13.405',
    );

    expect(response.headers.get('x-cache')).toBe('HIT');
    await expect(response.json()).resolves.toMatchObject({ location: { name: 'Berlin' } });
    expect(getDashboard).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('caches successful public weather responses for five minutes', async () => {
    const getDashboard = vi.fn(
      new MockWeatherProvider().getDashboard.bind(new MockWeatherProvider()),
    );
    const cache = {
      match: vi.fn(async () => undefined),
      put: vi.fn(async (request: Request, response: Response) => {
        void request;
        void response;
      }),
    };
    const weatherApp = createApp({ getDashboard }, cache);

    const response = await weatherApp.request(
      'http://localhost/api/v1/weather/dashboard?lat=52.52&lon=13.405&__atmos_cache_tier=stale',
    );

    expect(response.headers.get('x-cache')).toBe('MISS');
    expect(response.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=300');
    expect(cache.put).toHaveBeenCalledTimes(2);
    expect(cache.put.mock.calls[0]?.[0].url).not.toContain('__atmos_cache_tier');
    expect(cache.put.mock.calls[1]?.[0].url).toContain('__atmos_cache_tier=stale');
    await expect(cache.put.mock.calls[0]?.[1].clone().json()).resolves.toMatchObject({
      meta: { cached: true, stale: false },
    });
    await expect(cache.put.mock.calls[1]?.[1].clone().json()).resolves.toMatchObject({
      meta: { cached: true, stale: true },
    });
  });

  it('returns live weather when cache writes fail', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const weatherApp = createApp(new MockWeatherProvider(), {
      match: vi.fn(async () => undefined),
      put: vi.fn(async () => Promise.reject(new Error('cache unavailable'))),
    });

    const response = await weatherApp.request(
      'http://localhost/api/v1/weather/dashboard?lat=52.52&lon=13.405',
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-cache')).toBe('MISS');
    expect(JSON.parse(String(warning.mock.calls[0]?.[0]))).toMatchObject({
      event: 'weather_cache_write_failed',
      error_type: 'Error',
    });
  });
});
