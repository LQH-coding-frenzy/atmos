import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenMeteoProviderError } from '@atmos/provider-openmeteo';

const { getDashboard } = vi.hoisted(() => ({ getDashboard: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('./public-weather-cache', () => ({
  publicWeatherCache: {
    getDashboard,
    getAirQuality: vi.fn(),
  },
}));

import { getPublicDashboard } from './public-weather-runtime';

describe('public weather server runtime failure logging', () => {
  afterEach(() => {
    getDashboard.mockReset();
    vi.restoreAllMocks();
  });

  it('logs a sanitized failure class before rethrowing a homepage hard miss', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    getDashboard.mockRejectedValueOnce(
      new OpenMeteoProviderError('timeout', 'private URL, coordinates, payload, and token'),
    );

    await expect(
      getPublicDashboard({
        latitude: 52.52,
        longitude: 13.405,
        timezone: 'Europe/Berlin',
        units: 'metric',
      }),
    ).rejects.toMatchObject({ failureClass: 'timeout' });

    expect(warning).toHaveBeenCalledOnce();
    const logLine = String(warning.mock.calls[0]?.[0]);
    const logEntry = JSON.parse(logLine) as Record<string, unknown>;
    expect(logEntry).toMatchObject({
      event: 'weather_dashboard_provider_failed',
      cache_status: 'MISS',
      failure_class: 'timeout',
    });
    for (const sensitiveValue of [
      '52.52',
      '13.405',
      'private URL',
      'coordinates',
      'payload',
      'token',
    ]) {
      expect(logLine).not.toContain(sensitiveValue);
    }
  });
});
