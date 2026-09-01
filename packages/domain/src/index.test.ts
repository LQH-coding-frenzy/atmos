import { describe, expect, it } from 'vitest';
import { formatTemperature, formatWindSpeed } from './index';

describe('weather formatting', () => {
  it('formats metric and imperial values deterministically', () => {
    expect(formatTemperature(20, 'metric')).toBe('20 deg');
    expect(formatTemperature(20, 'imperial')).toBe('68 deg');
    expect(formatWindSpeed(13, 'metric')).toBe('13 km/h');
    expect(formatWindSpeed(13, 'imperial')).toBe('8 mph');
  });
});
