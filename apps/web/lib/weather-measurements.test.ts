import { describe, expect, it } from 'vitest';
import {
  formatPrecipitation,
  formatSnowfall,
  formatVisibility,
  formatDirection,
  formatDaylight,
  formatSunTime,
  formatUv,
} from './weather-measurements';

describe('normalized weather presentation', () => {
  it('converts precipitation in mm and snowfall in cm independently', () => {
    expect(formatPrecipitation(25.4, 'imperial')).toBe('1 in');
    expect(formatSnowfall(2.54, 'imperial')).toBe('1 in');
    expect(formatPrecipitation(1.26, 'metric')).toBe('1.3 mm');
    expect(formatSnowfall(1.26, 'metric')).toBe('1.3 cm');
    expect(formatPrecipitation(0, 'metric')).toBe('0 mm');
  });
  it('shows unavailable data honestly rather than manufacturing zero', () => {
    expect(formatPrecipitation(null, 'metric')).toBe('Unavailable');
    expect(formatVisibility(undefined, 'imperial')).toBe('Unavailable');
    expect(formatUv(null)).toBe('Unavailable');
    expect(formatDaylight(undefined)).toBe('Unavailable');
    expect(formatSunTime(undefined, 'UTC')).toBe('Unavailable');
    expect(formatSunTime(null, 'UTC')).toBe('No event');
  });
  it('formats directional and range boundary values', () => {
    expect(formatDirection(0)).toBe('N · 0°');
    expect(formatDirection(360)).toBe('N · 360°');
    expect(formatDirection(225)).toBe('SW · 225°');
    expect(formatVisibility(1609.344, 'imperial')).toBe('1 mi');
    expect(formatVisibility(10000, 'metric')).toBe('10 km');
    expect(formatDaylight(86400)).toBe('24h 00m');
    expect(formatDaylight(0)).toBe('0h 00m');
    expect(formatDaylight(3599)).toBe('1h 00m');
    expect(formatUv(0)).toBe('0 · Low');
    expect(formatUv(3)).toBe('3 · Moderate');
    expect(formatUv(6)).toBe('6 · High');
    expect(formatUv(8)).toBe('8 · Very high');
    expect(formatUv(11)).toBe('11 · Extreme');
  });
  it('uses the selected location timezone, including DST and half-hour offsets', () => {
    expect(formatSunTime('2026-07-01T04:00:00.000Z', 'Europe/Berlin')).toBe('6:00 AM');
    expect(formatSunTime('2026-12-01T04:00:00.000Z', 'Europe/Berlin')).toBe('5:00 AM');
    expect(formatSunTime('2026-07-01T04:00:00.000Z', 'Asia/Kolkata')).toBe('9:30 AM');
  });
});
