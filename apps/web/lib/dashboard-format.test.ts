import { describe, expect, it } from 'vitest';
import {
  conditionLabel,
  formatDashboardDate,
  formatForecastDate,
  formatHour,
  formatTimestamp,
  temperature,
  temperatureWithDegree,
} from './dashboard-format';

describe('dashboard display formatting', () => {
  it('formats conditions and temperatures in the selected units', () => {
    expect(conditionLabel('partly-cloudy')).toBe('partly cloudy');
    expect(temperature(20, 'metric')).toBe('20');
    expect(temperature(20, 'imperial')).toBe('68');
    expect(temperatureWithDegree(20, 'metric')).toBe('20°');
    expect(temperatureWithDegree(20, 'imperial')).toBe('68°');
    expect(temperatureWithDegree(-40, 'imperial')).toBe('-40°');
  });

  it('uses the selected timezone for observed timestamps', () => {
    const time = '2026-09-01T23:30:00Z';
    expect(formatHour(time, 'UTC')).toBe('11 PM');
    expect(formatHour(time, 'Europe/Berlin')).toBe('1 AM');
    expect(formatDashboardDate(time, 'Europe/Berlin')).toBe('Wednesday, September 2');
    expect(formatTimestamp(time, 'Europe/Berlin')).toBe('Sep 2, 1:30 AM');
  });

  it('formats a forecast calendar date without shifting the day by timezone', () => {
    expect(formatForecastDate('2026-09-01')).toBe('Tue, Sep 1');
  });
});
