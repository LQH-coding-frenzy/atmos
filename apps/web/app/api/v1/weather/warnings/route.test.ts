import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

function request(body: string, requestId?: string) {
  return new Request('http://localhost/api/v1/weather/warnings', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(requestId ? { 'x-request-id': requestId } : {}),
    },
    body,
  });
}

describe('official warning Next.js route', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns unsupported coverage without contacting either provider', async () => {
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetcher);

    const response = await POST(
      request(JSON.stringify({ latitude: 52.52, longitude: 13.405, country: 'Germany' })),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toMatchObject({
      coverage: 'unsupported',
      source: null,
      alerts: [],
      meta: { cached: false, stale: false },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects malformed, oversized, and out-of-range request bodies', async () => {
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetcher);

    const malformed = await POST(request('{not json'));
    const outOfRange = await POST(
      request(JSON.stringify({ latitude: 91, longitude: 0, country: 'Canada' })),
    );
    const oversized = await POST(
      request(JSON.stringify({ latitude: 0, longitude: 0, country: 'x'.repeat(3_000) })),
    );

    expect(malformed.status).toBe(400);
    expect(outOfRange.status).toBe(400);
    expect(oversized.status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('resolves a supported NWS point server-side with the bounded Next data cache', async () => {
    let providerCalls = 0;
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      providerCalls += 1;
      const url = new URL(String(input));
      expect(new Headers(init?.headers).get('user-agent')).toContain('AtmosWeather');
      expect(init?.cache).toBe('force-cache');
      expect((init as RequestInit & { next?: { revalidate?: number } }).next?.revalidate).toBe(60);
      if (url.pathname.startsWith('/points/')) {
        expect(url.pathname).toBe('/points/38.889,-77.035');
        return Response.json({ properties: { cwa: 'LWX' } });
      }
      expect(url.origin).toBe('https://api.weather.gov');
      expect(url.pathname).toBe('/alerts/active');
      return Response.json({ type: 'FeatureCollection', features: [] });
    });
    vi.stubGlobal('fetch', fetcher);

    const response = await POST(
      request(
        JSON.stringify({ latitude: 38.8894, longitude: -77.0352, country: 'United States' }),
        'warn-route-test-1',
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-request-id')).toBe('warn-route-test-1');
    await expect(response.json()).resolves.toMatchObject({
      coverage: 'supported',
      source: 'nws',
      alerts: [],
      meta: { cached: false, stale: false },
    });
    expect(providerCalls).toBe(2);
  });

  it('sanitizes provider failures and logs only a bounded failure code', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => {
        throw new Error('secret=private-upstream-detail');
      }),
    );

    const response = await POST(
      request(JSON.stringify({ latitude: 50, longitude: -100, country: 'Canada' })),
    );
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toContain('WARNINGS_UNAVAILABLE');
    expect(body).not.toContain('private-upstream-detail');
    expect(warning).toHaveBeenCalledOnce();
    expect(warning.mock.calls[0]?.[0]).not.toContain('private-upstream-detail');
    expect(JSON.parse(warning.mock.calls[0]?.[0] ?? '{}')).toMatchObject({
      event: 'weather_warning_provider_failed',
      provider: 'eccc',
      failure_code: 'provider_error',
    });
  });
});
