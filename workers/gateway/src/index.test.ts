import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockWeatherProvider } from '@atmos/provider-openmeteo';
import { app, createApp } from './index';

const testWeatherTransformToken = 'test-only-'.repeat(4);

describe('gateway', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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

  it('does not expose the retired notification publish route', async () => {
    const response = await app.request('http://localhost/internal/notifications/publish', {
      method: 'POST',
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'NOT_FOUND', message: 'Route not found.', request_id: expect.any(String) },
    });
  });

  it('returns coarse dependency health from the configured Supabase function', async () => {
    const fetcher = vi.fn(async (request: Request) => {
      void request;
      return Response.json({ status: 'ok', database: 'ok' });
    });
    const writeDataPoint = vi.fn();
    vi.stubGlobal('fetch', fetcher);

    const response = await app.request(
      'http://localhost/health/dependencies',
      {
        headers: {
          authorization: 'Bearer private-user-token',
          cookie: 'private=session',
          'x-request-id': 'dependency_request-1',
          traceparent: '00-1234567890abcdef1234567890abcdef-1234567890abcdef-01',
        },
      },
      {
        SUPABASE_FUNCTION_URL: 'https://project.supabase.co/functions/v1/api-abcdef012345',
        REQUEST_ANALYTICS: { writeDataPoint },
        RELEASE_ID: 'abcdef012345',
        CF_VERSION_METADATA: {
          id: '7cf6db10-8f5e-4cb2-a70c-34a1d3f28193',
          tag: 'abcdef012345',
          timestamp: '2026-09-12T00:00:00.000Z',
        },
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ status: 'ok', database: 'ok' });
    expect(fetcher).toHaveBeenCalledOnce();
    const request = fetcher.mock.calls[0]?.[0];
    if (!request) throw new Error('Expected dependency request');
    expect(request.url).toBe(
      'https://project.supabase.co/functions/v1/api-abcdef012345/health/dependencies',
    );
    expect(request.headers.get('x-request-id')).toBe('dependency_request-1');
    expect(request.headers.get('traceparent')).toBe(
      '00-1234567890abcdef1234567890abcdef-1234567890abcdef-01',
    );
    expect(request.headers.get('authorization')).toBeNull();
    expect(request.headers.get('cookie')).toBeNull();
    expect(writeDataPoint.mock.calls[0]?.[0]).toMatchObject({
      indexes: ['7cf6db10-8f5e-4cb2-a70c-34a1d3f28193'],
      blobs: ['abcdef012345', 'health_dependencies', '2xx', 'BYPASS', 'abcdef012345', 'supabase'],
    });
  });

  it('checks Next.js transform connectivity without invoking a weather provider', async () => {
    const provider = new MockWeatherProvider();
    const getDashboard = vi.fn(provider.getDashboard.bind(provider));
    const proxy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      expect(request.url).toBe('https://rainify.dpdns.org/api/v1/weather/transform-health');
      expect(request.method).toBe('POST');
      expect(request.headers.get('authorization')).toBe(`Bearer ${testWeatherTransformToken}`);
      expect(request.headers.get('cookie')).toBeNull();
      await expect(request.clone().json()).resolves.toEqual({});
      return Response.json({ status: 'ok' });
    });
    vi.stubGlobal('fetch', proxy);
    const writeDataPoint = vi.fn();
    const app = createApp({ getDashboard });

    const response = await app.request('http://localhost/health/transform', undefined, {
      WEATHER_TRANSFORM_ORIGIN: 'https://rainify.dpdns.org',
      WEATHER_TRANSFORM_TOKEN: testWeatherTransformToken,
      REQUEST_ANALYTICS: { writeDataPoint },
      CF_VERSION_METADATA: {
        id: '7cf6db10-8f5e-4cb2-a70c-34a1d3f28193',
        tag: 'abcdef012345',
        timestamp: '2026-10-23T00:00:00.000Z',
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
    expect(proxy).toHaveBeenCalledOnce();
    expect(getDashboard).not.toHaveBeenCalled();
    expect(writeDataPoint.mock.calls[0]?.[0]).toMatchObject({
      blobs: ['abcdef012345', 'health_transform', '2xx', 'BYPASS', 'none', 'none'],
    });
  });

  it('fails dependency health closed without exposing upstream diagnostics', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ error: 'sensitive database failure' }, { status: 503 }),
      )
      .mockRejectedValueOnce(new Error('sensitive network failure'));
    vi.stubGlobal('fetch', fetcher);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await app.request('http://localhost/health/dependencies', undefined, {
        SUPABASE_FUNCTION_URL: 'https://project.supabase.co/functions/v1/api-v1',
      });
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        status: 'degraded',
        database: 'degraded',
      });
    }
  });

  it('fails dependency health closed when the Supabase function is not configured', async () => {
    for (const env of [{}, { SUPABASE_FUNCTION_URL: 'not a url' }]) {
      const response = await app.request('http://localhost/health/dependencies', undefined, env);

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        status: 'degraded',
        database: 'degraded',
      });
    }
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
          'access-control-request-headers':
            'authorization,traceparent,x-request-id,x-atmos-version-key,cloudflare-workers-version-key',
        },
      },
      { CORS_ORIGIN: 'https://rainify.dpdns.org' },
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://rainify.dpdns.org');
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
    expect(response.headers.get('access-control-allow-headers')).toContain('Traceparent');
    expect(response.headers.get('access-control-allow-headers')).toContain('X-Atmos-Version-Key');
    expect(response.headers.get('access-control-allow-headers')).toContain(
      'Cloudflare-Workers-Version-Key',
    );

    const deleteResponse = await app.request(
      'http://localhost/api/v1/weather/history/00000000-0000-4000-8000-000000000001',
      {
        method: 'OPTIONS',
        headers: {
          origin: 'https://rainify.dpdns.org',
          'access-control-request-method': 'DELETE',
          'access-control-request-headers': 'authorization',
        },
      },
      { CORS_ORIGIN: 'https://rainify.dpdns.org' },
    );

    expect(deleteResponse.status).toBe(204);
    expect(deleteResponse.headers.get('access-control-allow-methods')).toContain('DELETE');

    const patchResponse = await app.request(
      'http://localhost/api/v1/alerts/00000000-0000-4000-8000-000000000001',
      {
        method: 'OPTIONS',
        headers: {
          origin: 'https://rainify.dpdns.org',
          'access-control-request-method': 'PATCH',
          'access-control-request-headers': 'authorization,content-type',
        },
      },
      { CORS_ORIGIN: 'https://rainify.dpdns.org' },
    );
    expect(patchResponse.status).toBe(204);
    expect(patchResponse.headers.get('access-control-allow-methods')).toContain('PATCH');
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

  it('forwards authenticated profile updates without changing the caller payload', async () => {
    const fetcher = vi.fn(async (request: Request) => {
      expect(request.method).toBe('PATCH');
      expect(request.headers.get('authorization')).toBe('Bearer user-token');
      expect(request.headers.get('content-type')).toContain('application/json');
      await expect(request.json()).resolves.toEqual({
        display_name: 'Weather user',
        timezone: 'Europe/Paris',
      });
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', fetcher);

    const response = await app.request(
      'http://localhost/api/v1/me',
      {
        method: 'PATCH',
        headers: {
          authorization: 'Bearer user-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ display_name: 'Weather user', timezone: 'Europe/Paris' }),
      },
      { SUPABASE_FUNCTION_URL: 'https://project.supabase.co/functions/v1/api-v1' },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledOnce();
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

  it('sanitizes malformed and failed Supabase proxy targets', async () => {
    const malformed = await app.request('http://localhost/api/v1/me', undefined, {
      SUPABASE_FUNCTION_URL: 'not a URL',
    });
    expect(malformed.status).toBe(503);
    await expect(malformed.json()).resolves.toMatchObject({
      error: { code: 'API_UNAVAILABLE', request_id: expect.any(String) },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('upstream details'))),
    );
    const failed = await app.request('http://localhost/api/v1/me', undefined, {
      SUPABASE_FUNCTION_URL: 'https://project.supabase.co/functions/v1/api-v1',
    });
    expect(failed.status).toBe(503);
    await expect(failed.json()).resolves.toMatchObject({
      error: { code: 'API_UNAVAILABLE', request_id: expect.any(String) },
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

  it('moves versioned dashboard normalization to the configured Next.js runtime', async () => {
    const getDashboard = vi.fn(
      new MockWeatherProvider().getDashboard.bind(new MockWeatherProvider()),
    );
    const proxy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      expect(request.url).toBe('https://rainify.dpdns.org/api/v1/weather/dashboard');
      expect(request.method).toBe('POST');
      expect(request.headers.get('content-type')).toBe('application/json');
      expect(request.headers.get('authorization')).toBe(`Bearer ${testWeatherTransformToken}`);
      expect(request.headers.get('cookie')).toBeNull();
      expect(request.headers.get('x-request-id')).toBe('worker_proxy_test-1');
      expect(request.headers.get('traceparent')).toBe(
        '00-1234567890abcdef1234567890abcdef-1234567890abcdef-01',
      );
      await expect(request.clone().json()).resolves.toEqual({
        latitude: 52.52,
        longitude: 13.405,
        timezone: 'Europe/Berlin',
        units: 'metric',
      });
      const dashboard = await new MockWeatherProvider().getDashboard({
        latitude: 52.52,
        longitude: 13.405,
        timezone: 'Europe/Berlin',
        units: 'metric',
      });
      return Response.json({
        ...dashboard,
        meta: { ...dashboard.meta, provider: 'open-meteo' },
      });
    });
    vi.stubGlobal('fetch', proxy);
    const weatherApp = createApp({ getDashboard });

    const response = await weatherApp.request(
      'http://localhost/api/v1/weather/dashboard?lat=52.52&lon=13.405&timezone=Europe%2FBerlin&units=metric',
      {
        headers: {
          authorization: 'Bearer private-user-token',
          cookie: 'private=session',
          'x-request-id': 'worker_proxy_test-1',
          traceparent: '00-1234567890abcdef1234567890abcdef-1234567890abcdef-01',
        },
      },
      {
        WEATHER_TRANSFORM_ORIGIN: 'https://rainify.dpdns.org',
        WEATHER_TRANSFORM_TOKEN: testWeatherTransformToken,
        CF_VERSION_METADATA: {
          id: '7cf6db10-8f5e-4cb2-a70c-34a1d3f28193',
          tag: 'abcdef012345',
          timestamp: '2026-10-23T00:00:00.000Z',
        },
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-cache')).toBe('MISS');
    await expect(response.json()).resolves.toMatchObject({
      location: { name: 'Berlin', latitude: 52.52, longitude: 13.405 },
      meta: { provider: 'open-meteo', cached: false },
    });
    expect(proxy).toHaveBeenCalledOnce();
    expect(getDashboard).not.toHaveBeenCalled();
  });

  it('fails closed when a versioned transform release lacks its service token', async () => {
    const getDashboard = vi.fn(
      new MockWeatherProvider().getDashboard.bind(new MockWeatherProvider()),
    );
    const weatherApp = createApp({ getDashboard });

    const response = await weatherApp.request(
      'http://localhost/api/v1/weather/dashboard?lat=52.52&lon=13.405',
      undefined,
      {
        WEATHER_TRANSFORM_ORIGIN: 'https://rainify.dpdns.org',
        CF_VERSION_METADATA: {
          id: '7cf6db10-8f5e-4cb2-a70c-34a1d3f28193',
          tag: 'abcdef012345',
          timestamp: '2026-10-23T00:00:00.000Z',
        },
      },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'WEATHER_UNAVAILABLE' },
    });
    expect(getDashboard).not.toHaveBeenCalled();
  });

  it('logs only the coarse upstream status class for transform failures', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const provider = new MockWeatherProvider();
    const getDashboard = vi.fn(provider.getDashboard.bind(provider));
    let requestIndex = 0;
    const proxy = vi.fn(async () =>
      Response.json(
        { error: 'private provider details and token' },
        { status: requestIndex++ === 0 ? 401 : 503 },
      ),
    );
    vi.stubGlobal('fetch', proxy);
    const weatherApp = createApp({ getDashboard });
    const env = {
      WEATHER_TRANSFORM_ORIGIN: 'https://rainify.dpdns.org',
      WEATHER_TRANSFORM_TOKEN: testWeatherTransformToken,
      CF_VERSION_METADATA: {
        id: '7cf6db10-8f5e-4cb2-a70c-34a1d3f28193',
        tag: 'abcdef012345',
        timestamp: '2026-10-23T00:00:00.000Z',
      },
    };
    for (const lat of ['52.52', '52.53']) {
      const response = await weatherApp.request(
        `http://localhost/api/v1/weather/dashboard?lat=${lat}&lon=13.405`,
        undefined,
        env,
      );
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'WEATHER_UNAVAILABLE' },
      });
    }

    expect(proxy).toHaveBeenCalledTimes(2);
    expect(getDashboard).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledTimes(2);
    const events = warning.mock.calls.map(([value]) => JSON.parse(value ?? '{}'));
    expect(events.map((event) => event.failure_class)).toEqual(['upstream_4xx', 'upstream_5xx']);
    for (const event of events) {
      expect(event.event).toBe('weather_provider_failed');
      expect(JSON.stringify(event)).not.toContain('private provider details');
      expect(JSON.stringify(event)).not.toContain(testWeatherTransformToken);
    }
  });

  it('moves only versioned AQI timeline normalization to Next.js', async () => {
    const airQuality = {
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
    const provider = new MockWeatherProvider();
    const getAirQuality = vi.fn();
    const proxy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      expect(request.url).toBe('https://rainify.dpdns.org/api/v1/weather/air-quality');
      expect(request.method).toBe('POST');
      await expect(request.json()).resolves.toEqual({
        latitude: 52.52,
        longitude: 13.405,
        includeTimeline: true,
      });
      return Response.json(airQuality);
    });
    vi.stubGlobal('fetch', proxy);
    const airQualityApp = createApp({
      getDashboard: provider.getDashboard.bind(provider),
      getAirQuality,
    });

    const response = await airQualityApp.request(
      'http://localhost/api/v1/weather/air-quality?lat=52.52&lon=13.405&view=timeline',
      undefined,
      {
        WEATHER_TRANSFORM_ORIGIN: 'https://rainify.dpdns.org',
        WEATHER_TRANSFORM_TOKEN: testWeatherTransformToken,
        CF_VERSION_METADATA: {
          id: '7cf6db10-8f5e-4cb2-a70c-34a1d3f28193',
          tag: 'abcdef012345',
          timestamp: '2026-10-23T00:00:00.000Z',
        },
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-cache')).toBe('MISS');
    await expect(response.json()).resolves.toMatchObject({
      timeline: { kind: 'model', requestedPastDays: 7, requestedForecastDays: 5 },
      meta: { cached: false, stale: false },
    });
    expect(proxy).toHaveBeenCalledOnce();
    expect(getAirQuality).not.toHaveBeenCalled();
  });

  it('normalizes and caches recent RainViewer frames behind the gateway contract', async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      version: '2.0',
      generated: now,
      host: 'https://tilecache.rainviewer.com',
      radar: {
        past: [now - 600, now - 300, now].map((timestamp, index) => ({
          time: timestamp,
          path: `/v2/radar/frame-${index}`,
        })),
      },
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return Response.json(payload);
    });
    vi.stubGlobal('fetch', fetcher);

    const cachedResponses = new Map<string, Response>();
    const cache = {
      match: vi.fn(async (request: Request) => cachedResponses.get(request.url)?.clone()),
      put: vi.fn(async (request: Request, response: Response) => {
        cachedResponses.set(request.url, response.clone());
      }),
    };
    const weatherApp = createApp(new MockWeatherProvider(), cache);

    const first = await weatherApp.request('http://localhost/api/v1/weather/radar/frames');
    expect(first.status).toBe(200);
    expect(first.headers.get('x-cache')).toBe('MISS');
    expect(first.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=300');
    await expect(first.json()).resolves.toEqual({
      generatedAt: now,
      tileHost: 'https://tilecache.rainviewer.com',
      frames: [
        { timestamp: now - 600, path: '/v2/radar/frame-0' },
        { timestamp: now - 300, path: '/v2/radar/frame-1' },
        { timestamp: now, path: '/v2/radar/frame-2' },
      ],
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.rainviewer.com/public/weather-maps.json');

    const second = await weatherApp.request('http://localhost/api/v1/weather/radar/frames');
    expect(second.headers.get('x-cache')).toBe('HIT');
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('fails closed when RainViewer returns an unexpected tile host', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          generated: Math.floor(Date.now() / 1000),
          host: 'https://tiles.attacker.example',
          radar: { past: [] },
        }),
      ),
    );

    const response = await app.request('http://localhost/api/v1/weather/radar/frames');

    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain('RADAR_UNAVAILABLE');
    expect(body).not.toContain('attacker.example');
    expect(warn).toHaveBeenCalledOnce();
  });

  it('reports OpenWeather map availability without exposing the configured key', async () => {
    const available = await app.request('http://localhost/api/v1/weather/map/layers', undefined, {
      OPENWEATHER_API_KEY: 'server-only-test-key',
    });
    const unavailable = await app.request('http://localhost/api/v1/weather/map/layers');

    expect(available.headers.get('cache-control')).toBe('no-store');
    await expect(available.json()).resolves.toEqual({ openWeatherAvailable: true });
    await expect(unavailable.json()).resolves.toEqual({ openWeatherAvailable: false });
  });

  it('proxies only allowed OpenWeather current tiles and caches the image', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: { 'content-type': 'image/png', 'content-length': '4' },
      });
    });
    vi.stubGlobal('fetch', fetcher);

    const cachedResponses = new Map<string, Response>();
    const cache = {
      match: vi.fn(async (request: Request) => cachedResponses.get(request.url)?.clone()),
      put: vi.fn(async (request: Request, response: Response) => {
        cachedResponses.set(request.url, response.clone());
      }),
    };
    const weatherApp = createApp(new MockWeatherProvider(), cache);
    const url =
      'http://localhost/api/v1/weather/maps/openweather/precipitation_new/2/2/1?appid=untrusted';
    const first = await weatherApp.request(url, undefined, {
      OPENWEATHER_API_KEY: 'server-only-test-key',
    });

    expect(first.status).toBe(200);
    expect(first.headers.get('content-type')).toBe('image/png');
    expect(first.headers.get('x-cache')).toBe('MISS');
    expect(first.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=300');
    expect(await first.arrayBuffer()).toEqual(Uint8Array.from([137, 80, 78, 71]).buffer);
    expect(fetcher.mock.calls[0]?.[0].toString()).toBe(
      'https://tile.openweathermap.org/map/precipitation_new/2/2/1.png?appid=server-only-test-key',
    );
    expect(fetcher.mock.calls[0]?.[0].toString()).not.toContain('untrusted');

    const second = await weatherApp.request(url, undefined, {
      OPENWEATHER_API_KEY: 'server-only-test-key',
    });
    expect(second.headers.get('x-cache')).toBe('HIT');
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('rejects OpenWeather tile injection and fails closed without a key', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const invalid = await app.request(
      'http://localhost/api/v1/weather/maps/openweather/other/2/2/1',
      undefined,
      { OPENWEATHER_API_KEY: 'server-only-test-key' },
    );
    const disabled = await app.request(
      'http://localhost/api/v1/weather/maps/openweather/precipitation_new/2/2/1',
    );

    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({
      error: { code: 'INVALID_MAP_TILE' },
    });
    expect(disabled.status).toBe(503);
    await expect(disabled.json()).resolves.toMatchObject({
      error: { code: 'OPENWEATHER_MAPS_UNAVAILABLE' },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('serves cached, bounded Open-Meteo air-quality responses', async () => {
    const airQuality = {
      observedAt: '2026-09-27T10:00:00.000Z',
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
      meta: {
        provider: 'open-meteo',
        cached: false,
        stale: false,
        updatedAt: '2026-09-27T10:02:00.000Z',
      },
    } as const;
    const provider = new MockWeatherProvider();
    const getAirQuality = vi.fn(async () => airQuality);
    const cachedResponses = new Map<string, Response>();
    const cache = {
      match: vi.fn(async (request: Request) => cachedResponses.get(request.url)?.clone()),
      put: vi.fn(async (request: Request, response: Response) => {
        cachedResponses.set(request.url, response.clone());
      }),
    };
    const airQualityApp = createApp(
      { getDashboard: provider.getDashboard.bind(provider), getAirQuality },
      cache,
    );

    const first = await airQualityApp.request(
      'http://localhost/api/v1/weather/air-quality?lat=52.520&lon=13.4050&ignored=private',
    );
    expect(first.status).toBe(200);
    expect(first.headers.get('x-cache')).toBe('MISS');
    expect(getAirQuality).toHaveBeenCalledWith({ latitude: 52.52, longitude: 13.405 });
    expect(cache.match.mock.calls[0]?.[0].url).toBe(
      'http://localhost/api/v1/weather/air-quality?lat=52.52&lon=13.405',
    );

    const second = await airQualityApp.request(
      'http://localhost/api/v1/weather/air-quality?lat=52.52&lon=13.405',
    );
    expect(second.headers.get('x-cache')).toBe('HIT');
    await expect(second.json()).resolves.toMatchObject({
      usAqi: 42,
      europeanAqi: 18,
      meta: { cached: true, stale: false },
    });
    expect(getAirQuality).toHaveBeenCalledOnce();
  });

  it('coalesces concurrent AQI cache misses for the same coordinates', async () => {
    const provider = new MockWeatherProvider();
    const result = {
      observedAt: '2026-09-27T10:00:00.000Z',
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
      meta: {
        provider: 'open-meteo' as const,
        cached: false,
        stale: false,
        updatedAt: '2026-09-27T10:02:00.000Z',
      },
    };
    let resolveAirQuality!: (value: typeof result) => void;
    const getAirQuality = vi.fn(
      () => new Promise<typeof result>((resolve) => (resolveAirQuality = resolve)),
    );
    const weatherApp = createApp(
      { getDashboard: provider.getDashboard.bind(provider), getAirQuality },
      { match: vi.fn(async () => undefined), put: vi.fn(async () => undefined) },
    );

    const first = weatherApp.request(
      'http://localhost/api/v1/weather/air-quality?lat=52.52&lon=13.405',
    );
    const second = weatherApp.request(
      'http://localhost/api/v1/weather/air-quality?lat=52.5200&lon=13.4050',
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getAirQuality).toHaveBeenCalledOnce();
    resolveAirQuality(result);
    const responses = await Promise.all([first, second]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
  });

  it('rejects invalid AQI coordinates before calling the provider', async () => {
    const provider = new MockWeatherProvider();
    const getAirQuality = vi.fn();
    const airQualityApp = createApp({
      getDashboard: provider.getDashboard.bind(provider),
      getAirQuality,
    });

    const response = await airQualityApp.request(
      'http://localhost/api/v1/weather/air-quality?lat=91&lon=13',
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INVALID_LOCATION' },
    });
    expect(getAirQuality).not.toHaveBeenCalled();
  });

  it('serves the bounded stale AQI cache after an upstream failure', async () => {
    const provider = new MockWeatherProvider();
    const getAirQuality = vi.fn(async () => Promise.reject(new Error('private provider details')));
    const cached = {
      observedAt: '2026-09-27T10:00:00.000Z',
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
      meta: {
        provider: 'open-meteo',
        cached: true,
        stale: true,
        updatedAt: '2026-09-27T10:02:00.000Z',
      },
    };
    const cache = {
      match: vi.fn(async (request: Request) =>
        request.url.includes('__atmos_cache_tier=stale')
          ? Response.json(cached, {
              headers: { 'cache-control': 'public, max-age=0, s-maxage=3600' },
            })
          : undefined,
      ),
      put: vi.fn(async () => undefined),
    };
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const weatherApp = createApp(
      { getDashboard: provider.getDashboard.bind(provider), getAirQuality },
      cache,
    );

    const response = await weatherApp.request(
      'http://localhost/api/v1/weather/air-quality?lat=52.52&lon=13.405',
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-cache')).toBe('STALE');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toMatchObject({ meta: { stale: true } });
    expect(String(warning.mock.calls[0]?.[0])).not.toContain('private provider details');
    warning.mockRestore();
  });

  it('serves bounded cached location-search results', async () => {
    const searchLocations = vi.fn(async () => [
      {
        id: '2950159',
        name: 'Berlin',
        country: 'Germany',
        latitude: 52.52437,
        longitude: 13.41053,
        timezone: 'Europe/Berlin',
      },
    ]);
    const cache = {
      match: vi.fn(async (request: Request) => {
        void request;
        return undefined;
      }),
      put: vi.fn(async () => undefined),
    };
    const searchApp = createApp(
      {
        getDashboard: new MockWeatherProvider().getDashboard.bind(new MockWeatherProvider()),
        searchLocations,
      },
      cache,
    );

    const response = await searchApp.request(
      'http://localhost/api/v1/locations/search?q=Berlin&ignored=value',
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: [
        {
          id: '2950159',
          name: 'Berlin',
          country: 'Germany',
          latitude: 52.52437,
          longitude: 13.41053,
          timezone: 'Europe/Berlin',
        },
      ],
    });
    expect(searchLocations).toHaveBeenCalledWith('Berlin');
    expect(cache.match.mock.calls[0]?.[0].url).toBe(
      'http://localhost/api/v1/locations/search?q=berlin',
    );
  });

  it('rejects invalid location searches before calling a provider', async () => {
    const searchLocations = vi.fn();
    const searchApp = createApp({
      getDashboard: new MockWeatherProvider().getDashboard.bind(new MockWeatherProvider()),
      searchLocations,
    });

    const response = await searchApp.request('http://localhost/api/v1/locations/search?q=%20');
    expect(response.status).toBe(400);
    expect(searchLocations).not.toHaveBeenCalled();
  });

  it('rejects invalid or blank location input before calling the provider', async () => {
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

    const blankResponse = await weatherApp.request(
      'http://localhost/api/v1/weather/dashboard?lat=&lon=',
    );
    expect(blankResponse.status).toBe(400);
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

  it('uses one cache key for equivalent weather requests', async () => {
    const cache = {
      match: vi.fn(async (request: Request) => {
        void request;
        return undefined;
      }),
      put: vi.fn(async () => undefined),
    };
    const weatherApp = createApp(new MockWeatherProvider(), cache);

    await weatherApp.request(
      'http://localhost/api/v1/weather/dashboard?lat=52.520&lon=13.4050&timezone=Europe%2FBerlin&units=metric&nonce=one',
    );

    expect(cache.match.mock.calls[0]?.[0].url).toBe(
      'http://localhost/api/v1/weather/dashboard?lat=52.52&lon=13.405&timezone=Europe%2FBerlin&units=metric',
    );
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
