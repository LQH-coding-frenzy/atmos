import { describe, expect, it, vi } from 'vitest';
import {
  backendReleaseFromUrl,
  canonicalReleaseId,
  recordRequestAnalytics,
  requestRouteGroup,
} from './request-analytics';

describe('request analytics', () => {
  it('writes the bounded release dataset contract in positional order', () => {
    const writeDataPoint = vi.fn();

    recordRequestAnalytics(
      { writeDataPoint },
      {
        workerVersionId: '7cf6db10-8f5e-4cb2-a70c-34a1d3f28193',
        releaseId: 'abcdef012345',
        routeGroup: 'weather_dashboard',
        status: 200,
        cacheStatus: 'stale',
        backendRelease: 'none',
        provider: 'open-meteo',
        wallDurationMs: 42.5,
        providerDurationMs: 12.25,
      },
    );

    expect(writeDataPoint).toHaveBeenCalledWith({
      indexes: ['7cf6db10-8f5e-4cb2-a70c-34a1d3f28193'],
      blobs: ['abcdef012345', 'weather_dashboard', '2xx', 'STALE', 'none', 'open-meteo'],
      doubles: [42.5, 0, 12.25],
    });
  });

  it('normalizes route groups and extracts only versioned backend identifiers', () => {
    expect(requestRouteGroup('GET', '/api/v1/weather/dashboard')).toBe('weather_dashboard');
    expect(requestRouteGroup('POST', '/api/v1/locations')).toBe('api_proxy');
    expect(requestRouteGroup('GET', '/users/private-value')).toBe('not_found');
    expect(backendReleaseFromUrl('https://project.supabase.co/functions/v1/api-abcdef012345')).toBe(
      'abcdef012345',
    );
    expect(backendReleaseFromUrl('https://project.supabase.co/functions/v1/api-v1')).toBe('v1');
    expect(backendReleaseFromUrl('not a url')).toBe('unknown');
    expect(canonicalReleaseId('invalid', 'abcdef012345')).toBe('abcdef012345');
    expect(canonicalReleaseId('ABCDEF012345', undefined)).toBeUndefined();
  });

  it('contains dataset failures and logs no provider message', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const dataset = {
      writeDataPoint: () => {
        throw new Error('sensitive provider response');
      },
    };

    expect(() =>
      recordRequestAnalytics(dataset, {
        routeGroup: 'health',
        status: 200,
        backendRelease: 'none',
        provider: 'none',
        wallDurationMs: 1,
      }),
    ).not.toThrow();
    expect(warning).toHaveBeenCalledOnce();
    expect(warning.mock.calls[0]?.[0]).not.toContain('sensitive provider response');
    warning.mockRestore();
  });
});
