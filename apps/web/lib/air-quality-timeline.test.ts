import { describe, expect, it } from 'vitest';
import type { AirQuality, AirQualityHour } from '@atmos/contracts';
import {
  airQualityMetricValue,
  createAirQualityPlot,
  selectAirQualityHours,
} from './air-quality-timeline';

function hour(time: string, value: number | null): AirQualityHour {
  return {
    time,
    usAqi: value,
    europeanAqi: value,
    pollutants: {
      pm25: value,
      pm10: value,
      carbonMonoxide: value,
      nitrogenDioxide: value,
      sulphurDioxide: value,
      ozone: value,
    },
  };
}
describe('AQI model timelines', () => {
  it('partitions at the model reference hour rather than the browser clock', () => {
    const hours = Array.from({ length: 288 }, (_, index) =>
      hour(new Date(Date.parse('2026-10-01T00:00:00Z') + index * 3600000).toISOString(), index),
    );
    const data = {
      observedAt: '2026-10-08T10:15:00.000Z',
      timeline: { kind: 'model', requestedPastDays: 7, requestedForecastDays: 5, hours },
    } as AirQuality;
    const past = selectAirQualityHours(data, 'history', '24h');
    expect(past).toHaveLength(24);
    expect(past[0]?.time).toBe('2026-10-07T10:00:00.000Z');
    expect(past.at(-1)?.time).toBe('2026-10-08T09:00:00.000Z');
    const forecast = selectAirQualityHours(data, 'forecast', '24h');
    expect(forecast[0]?.time).toBe('2026-10-08T10:00:00.000Z');
    expect(forecast).toHaveLength(24);
    expect(selectAirQualityHours(data, 'history', 'full')).toHaveLength(168);
    expect(selectAirQualityHours(data, 'forecast', 'full')).toHaveLength(110);
  });
  it('preserves nulls and breaks lines across missing hours and missing values', () => {
    const hours = [
      hour('2026-10-01T00:00:00.000Z', 10),
      hour('2026-10-01T01:00:00.000Z', null),
      hour('2026-10-01T02:00:00.000Z', 30),
      hour('2026-10-01T04:00:00.000Z', 40),
    ];
    const plot = createAirQualityPlot(hours, 'usAqi');
    expect(plot.available).toBe(3);
    expect(plot.paths).toHaveLength(3);
    expect(plot.points[1]?.y).toBeNull();
    expect(plot.points[1]?.value).toBeNull();
    expect(plot.minimum).toBe(10);
    expect(plot.peak).toBe(40);
  });
  it('supports pollutant selection, zero, a single point, and entirely missing data', () => {
    expect(airQualityMetricValue(hour('2026-10-01T00:00:00.000Z', 0), 'pm25')).toBe(0);
    const zero = createAirQualityPlot([hour('2026-10-01T00:00:00.000Z', 0)], 'pm25');
    expect(zero.available).toBe(1);
    expect(zero.points[0]?.x).toBe(320);
    expect(Number.isFinite(zero.points[0]!.y!)).toBe(true);
    const empty = createAirQualityPlot([hour('2026-10-01T00:00:00.000Z', null)], 'usAqi');
    expect(empty.paths).toEqual([]);
    expect(empty.minimum).toBeNull();
    expect(empty.peak).toBeNull();
  });
});
