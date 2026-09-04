import { describe, expect, it } from 'vitest';
import { createForecastTrend } from './forecast-trend';

const daily = [
  {
    date: '2026-09-02',
    highC: 22.4,
    lowC: 15,
    precipitationProbability: 10,
    condition: 'partly-cloudy' as const,
  },
  {
    date: '2026-09-03',
    highC: 20,
    lowC: 14,
    precipitationProbability: 70,
    condition: 'rain' as const,
  },
];

describe('createForecastTrend', () => {
  it('maps normalized daily dashboard data into a temperature series', () => {
    expect(createForecastTrend(daily, 'temperature')).toEqual({
      labels: ['Wed', 'Thu'],
      values: [22, 20],
      unit: 'C',
      label: 'Daily high temperature',
    });
  });

  it('uses forecast precipitation probability without fabricating rainfall data', () => {
    expect(createForecastTrend(daily, 'rain-chance')).toMatchObject({
      values: [10, 70],
      unit: '%',
      label: 'Rain chance',
    });
  });
});
