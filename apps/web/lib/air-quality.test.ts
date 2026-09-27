import { describe, expect, it } from 'vitest';
import { classifyEuropeanAqi, classifyUsAqi, formatAqiValue } from './air-quality';

describe('air-quality index categories', () => {
  it('classifies United States AQI interval boundaries', () => {
    expect(classifyUsAqi(50)?.label).toBe('Good');
    expect(classifyUsAqi(51)?.label).toBe('Moderate');
    expect(classifyUsAqi(101)?.label).toBe('Unhealthy for sensitive groups');
    expect(classifyUsAqi(151)?.label).toBe('Unhealthy');
    expect(classifyUsAqi(201)?.label).toBe('Very unhealthy');
    expect(classifyUsAqi(301)?.label).toBe('Hazardous');
  });

  it('classifies European AQI interval boundaries', () => {
    expect(classifyEuropeanAqi(20)?.label).toBe('Good');
    expect(classifyEuropeanAqi(21)?.label).toBe('Fair');
    expect(classifyEuropeanAqi(41)?.label).toBe('Moderate');
    expect(classifyEuropeanAqi(61)?.label).toBe('Poor');
    expect(classifyEuropeanAqi(81)?.label).toBe('Very poor');
    expect(classifyEuropeanAqi(101)?.label).toBe('Extremely poor');
  });

  it('represents missing or invalid AQI without inventing a value', () => {
    expect(classifyUsAqi(null)).toBeNull();
    expect(classifyEuropeanAqi(Number.NaN)).toBeNull();
    expect(formatAqiValue(null)).toBe('Unavailable');
    expect(formatAqiValue(42.4)).toBe('42');
  });
});
