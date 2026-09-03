import { describe, expect, it } from 'vitest';
import {
  MockWeatherProvider,
  OpenMeteoProvider,
  OpenMeteoQuotaError,
  OpenMeteoUsageGuard,
  openMeteoAttribution,
} from './index';

describe('weather providers', () => {
  it('returns deterministic mock dashboard data', async () => {
    const dashboard = await new MockWeatherProvider().getDashboard({
      latitude: 52.52,
      longitude: 13.405,
      timezone: 'Europe/Berlin',
      units: 'metric',
    });

    expect(dashboard.location.name).toBe('Berlin');
    expect(dashboard.hourly).toHaveLength(9);
    expect(dashboard.meta.provider).toBe('mock');
  });

  it('normalizes the Open-Meteo response without exposing upstream fields', async () => {
    const provider = new OpenMeteoProvider(
      async () =>
        new Response(
          JSON.stringify({
            timezone: 'Europe/Berlin',
            current: {
              time: '2026-09-01T10:00',
              temperature_2m: 20,
              apparent_temperature: 19,
              relative_humidity_2m: 64,
              surface_pressure: 1017,
              wind_speed_10m: 13,
              weather_code: 2,
            },
            hourly: {
              time: ['2026-09-01T10:00'],
              temperature_2m: [20],
              precipitation_probability: [5],
              weather_code: [2],
            },
            daily: {
              time: ['2026-09-01'],
              temperature_2m_max: [23],
              temperature_2m_min: [14],
              precipitation_probability_max: [5],
              weather_code: [2],
            },
          }),
        ),
    );

    const dashboard = await provider.getDashboard({
      latitude: 52.52,
      longitude: 13.405,
      timezone: 'Europe/Berlin',
      units: 'metric',
    });

    expect(dashboard.current.condition).toBe('partly-cloudy');
    expect(dashboard.daily[0]?.highC).toBe(23);
  });

  it('reports warnings and rejects requests beyond a quota', () => {
    const guard = new OpenMeteoUsageGuard({ minute: 2, hour: 10, day: 10, month: 10 });

    expect(guard.reserve(1_000).warnings).toEqual([]);
    expect(guard.reserve(2_000).warnings).toEqual(['minute']);
    expect(() => guard.reserve(3_000)).toThrow(new OpenMeteoQuotaError('minute'));
  });

  it('publishes the required attribution metadata', () => {
    expect(openMeteoAttribution).toEqual({
      name: 'Open-Meteo',
      url: 'https://open-meteo.com/',
      license: 'CC BY 4.0',
    });
  });
});
