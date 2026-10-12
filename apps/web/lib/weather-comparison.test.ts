import { describe, expect, it } from 'vitest';
import { temperatureDifference } from './weather-comparison';

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
