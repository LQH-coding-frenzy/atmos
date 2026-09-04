import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockWeatherProvider } from '@atmos/provider-openmeteo';
import { app, createApp } from './index';

describe('gateway', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('returns cheap health and version responses with a request ID', async () => {
    const health = await app.request('http://localhost/health');
    const version = await app.request('http://localhost/version', undefined, {
      RELEASE_ID: 'abc123',
    });

    expect(health.status).toBe(200);
    expect(health.headers.get('x-request-id')).toBeTruthy();
    await expect(health.json()).resolves.toEqual({ status: 'ok' });
    await expect(version.json()).resolves.toEqual({ release: 'abc123' });
  });

  it('returns stable sanitized errors for unknown routes', async () => {
    const response = await app.request('http://localhost/nope');
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'NOT_FOUND', message: 'Route not found.' },
    });
  });

  it('proxies API requests to the configured versioned function', async () => {
    const fetcher = vi.fn(async (request: Request) => {
      void request;
      return new Response('ok');
    });
    vi.stubGlobal('fetch', fetcher);

    const response = await app.request('http://localhost/api/v1/me?detail=full', undefined, {
      SUPABASE_FUNCTION_URL: 'https://project.supabase.co/functions/v1/api-v1',
    });

    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0].url).toBe(
      'https://project.supabase.co/functions/v1/api-v1/api/v1/me?detail=full',
    );
  });

  it('returns a sanitized response when no function is configured', async () => {
    const response = await app.request('http://localhost/api/v1/me');

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'API_UNAVAILABLE', message: 'API is temporarily unavailable.' },
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
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'INVALID_LOCATION',
        message: 'Valid latitude and longitude query parameters are required.',
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
    await expect(response.json()).resolves.toEqual({
      error: { code: 'WEATHER_UNAVAILABLE', message: 'Weather is temporarily unavailable.' },
    });
  });
});
