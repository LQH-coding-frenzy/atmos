import { describe, expect, it } from 'vitest';
import {
  createForecastTrend,
  forecastTrendAvailable,
  formatForecastTrendValue,
} from './forecast-trend';
import type { ExtendedDailyForecast, HourlyForecast } from '@atmos/contracts';

const day = (overrides: Partial<ExtendedDailyForecast> = {}): ExtendedDailyForecast => ({
  date: '2026-09-02',
  highC: 22.4,
  lowC: 15,
  precipitationProbability: 10,
  condition: 'partly-cloudy',
  apparentTemperatureMaxC: 24,
  humidityMeanPercent: 61,
  pressureMeanHpa: 1014,
  precipitationMm: 12,
  rainMm: 10,
  snowfallCm: 0,
  uvIndexMax: 5,
  windSpeedMaxKph: 30,
  windGustMaxKph: 42,
  cloudCoverMeanPercent: 50,
  visibilityMeanM: 10000,
  sunrise: '2026-09-02T05:00:00Z',
  sunset: '2026-09-02T18:00:00Z',
  daylightSeconds: 46800,
  ...overrides,
});
const hour = (overrides: Partial<HourlyForecast> = {}): HourlyForecast => ({
  time: '2026-09-02T12:00:00Z',
  temperatureC: 20,
  precipitationProbability: 5,
  condition: 'clear',
  apparentTemperatureC: 21,
  humidityPercent: 60,
  pressureHpa: 1010,
  windSpeedKph: 10,
  windGustKph: 20,
  cloudCoverPercent: 25,
  precipitationMm: 1,
  rainMm: 0.5,
  snowfallCm: 0,
  visibilityM: 8000,
  uvIndex: 4,
  isDay: true,
  ...overrides,
});

describe('weather trend series', () => {
  it('preserves the original daily-high and rain-probability mappings', () => {
    const trend = createForecastTrend(
      [day(), day({ date: '2026-09-03', highC: 20, precipitationProbability: 70 })],
      'temperature',
      'metric',
    );
    expect(trend.labels).toEqual(['Sep 2', 'Sep 3']);
    expect(trend.values).toEqual([22.4, 20]);
    expect(
      createForecastTrend([day({ precipitationProbability: null })], 'rain-chance', 'metric')
        .values,
    ).toEqual([null]);
  });
  it('converts every physical series explicitly to imperial units', () => {
    const daily = [day()];
    expect(createForecastTrend(daily, 'temperature', 'imperial').values[0]).toBeCloseTo(72.32);
    expect(createForecastTrend(daily, 'feels-like', 'imperial').values[0]).toBeCloseTo(75.2);
    expect(createForecastTrend(daily, 'precipitation', 'imperial').values[0]).toBeCloseTo(
      12 / 25.4,
    );
    expect(createForecastTrend(daily, 'wind', 'imperial').values[0]).toBeCloseTo(30 * 0.621371);
    expect(createForecastTrend(daily, 'visibility', 'imperial').values[0]).toBeCloseTo(
      10000 / 1609.344,
    );
    expect(createForecastTrend(daily, 'humidity', 'imperial').values[0]).toBe(61);
    expect(createForecastTrend(daily, 'pressure', 'metric').unit).toBe('hPa');
    expect(createForecastTrend(daily, 'uv', 'metric').unit).toBe('index');
  });
  it('provides all available daily metrics, marks probability as bars, and accumulates rainfall only while complete', () => {
    const days = [
      day({ rainMm: 10 }),
      day({ date: '2026-09-03', rainMm: 5 }),
      day({ date: '2026-09-04', rainMm: null }),
      day({ date: '2026-09-05', rainMm: 2 }),
    ];
    expect(createForecastTrend(days, 'accumulated-rainfall', 'metric', '16d').values).toEqual([
      10,
      15,
      null,
      null,
    ]);
    expect(createForecastTrend(days, 'rain-chance', 'metric').series).toBe('bar');
    expect(createForecastTrend(days, 'precipitation', 'metric').series).toBe('bar');
    for (const metric of [
      'temperature',
      'feels-like',
      'humidity',
      'precipitation',
      'rain-chance',
      'pressure',
      'wind',
      'gusts',
      'uv',
      'visibility',
      'clouds',
    ] as const)
      expect(createForecastTrend(days, metric, 'metric', '16d').values).toHaveLength(4);
    expect(
      createForecastTrend([day({ humidityMeanPercent: null })], 'humidity', 'metric').values,
    ).toEqual([null]);
  });
  it('uses the location timezone and exposes day/night and precipitation annotations for hourly charts', () => {
    const hours = [
      hour({ time: '2026-09-02T06:00:00Z', isDay: false, precipitationProbability: 5 }),
      hour({ time: '2026-09-02T07:00:00Z', isDay: true }),
    ];
    const trend = createForecastTrend(
      [day()],
      'temperature',
      'metric',
      '12h',
      hours,
      'Europe/Berlin',
    );
    expect(trend.labels).toEqual(['8 AM', '9 AM']);
    expect(trend.points.map((point) => point.isDay)).toEqual([false, true]);
    expect(trend.points[0]?.rainProbability).toBe(5);
    expect(forecastTrendAvailable('temperature', '12h', hours)).toBe(true);
    expect(forecastTrendAvailable('accumulated-rainfall', '12h', hours)).toBe(false);
  });
  it('reports truthful extrema and units without inventing values', () => {
    const trend = createForecastTrend(
      [day({ highC: 10 }), day({ date: '2026-09-03', highC: 20 })],
      'temperature',
      'metric',
      '7d',
    );
    expect(trend.minimum).toBe(10);
    expect(trend.maximum).toBe(20);
    expect(formatForecastTrendValue(null, trend)).toBe('Unavailable');
    expect(formatForecastTrendValue(20, trend)).toBe('20 °C');
    const empty = createForecastTrend([day({ visibilityMeanM: null })], 'visibility', 'metric');
    expect(empty.minimum).toBeNull();
    expect(empty.maximum).toBeNull();
  });
});
