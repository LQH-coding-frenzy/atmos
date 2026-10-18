import { describe, expect, it } from 'vitest';
import {
  comparisonLocationKey,
  maximumComparedDestinations,
  runWithComparisonConcurrency,
  temperatureDifference,
} from './weather-comparison';

describe('temperatureDifference', () => {
  it('reports a signed metric difference without changing units', () => {
    expect(temperatureDifference(15.25, 10, 'metric')).toEqual({
      value: 5.3,
      label: '+5.3°C',
      direction: 'warmer',
    });
    expect(temperatureDifference(4, 10, 'metric')).toEqual({
      value: -6,
      label: '-6.0°C',
      direction: 'cooler',
    });
  });

  it('converts a temperature delta by scale only for Fahrenheit', () => {
    expect(temperatureDifference(15, 10, 'imperial')).toEqual({
      value: 9,
      label: '+9.0°F',
      direction: 'warmer',
    });
    expect(temperatureDifference(10, 10, 'imperial')).toEqual({
      value: 0,
      label: '0.0°F',
      direction: 'the same temperature',
    });
  });
});

describe('bounded multi-city comparison helpers', () => {
  it('deduplicates coordinates without depending on city labels', () => {
    expect(comparisonLocationKey({ latitude: 52.52001, longitude: 13.40501 })).toBe(
      comparisonLocationKey({ latitude: 52.52, longitude: 13.405 }),
    );
    expect(maximumComparedDestinations).toBe(3);
  });

  it('runs opt-in AQI requests within the configured concurrency limit', async () => {
    let inFlight = 0;
    let maximumInFlight = 0;
    await runWithComparisonConcurrency(
      Array.from({ length: 4 }, (_, index) => index),
      2,
      async () => {
        inFlight += 1;
        maximumInFlight = Math.max(maximumInFlight, inFlight);
        await Promise.resolve();
        inFlight -= 1;
      },
    );
    expect(maximumInFlight).toBe(2);
  });
});
