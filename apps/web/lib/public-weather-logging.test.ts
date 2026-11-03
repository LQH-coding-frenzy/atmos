import { describe, expect, it } from 'vitest';
import { dashboardProviderFailureLogLine } from './public-weather-logging';

describe('public weather homepage failure logs', () => {
  it('serializes only the bounded failure class and safe correlation fields', () => {
    const logLine = dashboardProviderFailureLogLine('homepage_test-1', 'timeout', 'MISS');

    expect(JSON.parse(logLine)).toEqual({
      event: 'weather_dashboard_provider_failed',
      request_id: 'homepage_test-1',
      cache_status: 'MISS',
      failure_class: 'timeout',
    });
    for (const sensitiveValue of [
      'https://api.open-meteo.com',
      '52.52',
      '13.405',
      'provider payload',
      'provider-secret',
    ]) {
      expect(logLine).not.toContain(sensitiveValue);
    }
  });

  it('retains stale cache state without exposing an exception message', () => {
    const logLine = dashboardProviderFailureLogLine('homepage_test-2', 'upstream_5xx', 'STALE');

    expect(JSON.parse(logLine)).toMatchObject({
      event: 'weather_dashboard_provider_failed',
      request_id: 'homepage_test-2',
      cache_status: 'STALE',
      failure_class: 'upstream_5xx',
    });
  });
});
