import { describe, expect, it } from 'vitest';
import type { WeatherSnapshot } from '@atmos/contracts';
import {
  aggregateWeatherHistory,
  createWeatherHistoryChartPoints,
  customHistoryRangeIsValid,
  dateInTimeZone,
  historyApiDays,
  recordedConditionCounts,
  selectRecordedHistory,
} from './weather-history-analytics';

function snapshot(
  id: number,
  observedAt: string,
  values: Partial<WeatherSnapshot['payload']> = {},
): WeatherSnapshot {
  return {
    id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    latitude: 52.52,
    longitude: 13.405,
    observed_at: observedAt,
    provider: 'open-meteo',
    payload: {
      location_name: 'Berlin',
      temperature_c: 20,
      apparent_temperature_c: 19,
      humidity_percent: 55,
      wind_speed_kph: 10,
      pressure_hpa: 1012,
      condition: 'clear',
      ...values,
    },
    created_at: '2026-10-18T12:01:00.000Z',
  };
}

describe('recorded weather history analytics', () => {
  const now = Date.parse('2026-10-18T12:00:00.000Z');
  const samples = [
    snapshot(1, '2026-10-18T11:00:00.000Z', { temperature_c: 20, condition: 'rain' }),
    snapshot(2, '2026-10-17T22:30:00.000Z', { temperature_c: 10, condition: 'clear' }),
    snapshot(3, '2026-10-17T11:59:00.000Z', { temperature_c: 15, condition: 'cloudy' }),
    snapshot(4, '2026-10-12T12:00:00.000Z', { temperature_c: 5, condition: 'clear' }),
  ];

  it('filters elapsed 24 hours and location-local custom dates without filling gaps', () => {
    expect(selectRecordedHistory(samples, '24h', now, 'UTC', { start: '', end: '' })).toEqual(
      samples.slice(0, 2),
    );
    expect(dateInTimeZone(new Date('2026-10-17T22:30:00.000Z'), 'Europe/Berlin')).toBe(
      '2026-10-18',
    );
    expect(
      selectRecordedHistory(samples, 'custom', now, 'Europe/Berlin', {
        start: '2026-10-18',
        end: '2026-10-18',
      }).map((item) => item.id),
    ).toEqual([samples[0]!.id, samples[1]!.id]);
    expect(selectRecordedHistory(samples, '7d', now, 'UTC', { start: '', end: '' })).toHaveLength(
      4,
    );
  });

  it('bounds custom dates to the latest 90 days and existing server query windows', () => {
    expect(
      customHistoryRangeIsValid({ start: '2026-10-12', end: '2026-10-18' }, '2026-10-18'),
    ).toBe(true);
    expect(
      customHistoryRangeIsValid({ start: '2026-10-19', end: '2026-10-18' }, '2026-10-18'),
    ).toBe(false);
    expect(
      customHistoryRangeIsValid({ start: '2026-05-01', end: '2026-05-10' }, '2026-10-18'),
    ).toBe(false);
    expect(historyApiDays('24h', { start: '', end: '' })).toBe(7);
    expect(historyApiDays('custom', { start: '2026-10-12', end: '2026-10-18' }, '2026-10-18')).toBe(
      7,
    );
    expect(historyApiDays('custom', { start: '2026-09-01', end: '2026-09-03' }, '2026-10-18')).toBe(
      90,
    );
  });

  it('computes observed-value aggregates in selected units without inventing empty values', () => {
    const stats = aggregateWeatherHistory(samples.slice(0, 2), 'temperature', 'imperial');
    expect(stats).toEqual({ count: 2, minimum: 50, average: 59, maximum: 68 });
    expect(aggregateWeatherHistory([], 'temperature', 'metric')).toBeUndefined();
  });

  it('plots one discrete point per snapshot and counts only recorded condition rows', () => {
    const chart = createWeatherHistoryChartPoints(samples, 'humidity', 'metric');
    expect(chart.points).toHaveLength(samples.length);
    expect(chart.points.map((point) => point.snapshot.observed_at)).toEqual(
      samples.map((item) => item.observed_at).sort(),
    );
    expect(chart.points[0]!.x).toBeLessThan(chart.points.at(-1)!.x);
    expect(recordedConditionCounts(samples)).toEqual([
      { condition: 'clear', count: 2 },
      { condition: 'cloudy', count: 1 },
      { condition: 'rain', count: 1 },
    ]);
  });
});
