import { describe, expect, it } from 'vitest';
import { compareWeather, mockComparisonLocation } from './weather-comparison';

describe('compareWeather', () => {
  it('calculates deterministic dashboard deltas against the documented comparison fixture', () => {
    expect(
      compareWeather(mockComparisonLocation, {
        observedAt: '2026-09-01T10:00:00.000Z',
        temperatureC: 20,
        apparentTemperatureC: 19,
        humidityPercent: 64,
        windSpeedKph: 13,
        pressureHpa: 1017,
        condition: 'partly-cloudy',
      }),
    ).toMatchObject({ temperatureDeltaC: -6, windDeltaKph: 4 });
  });
});
