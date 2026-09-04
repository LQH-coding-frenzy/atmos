import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from './index';

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
});
