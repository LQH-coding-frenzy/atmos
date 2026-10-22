import { describe, expect, it } from 'vitest';
import type { AlertRuleRecord } from '@atmos/contracts';
import {
  alertRuleScheduledForDate,
  calendarDateInTimezone,
  hourlyForecastForDate,
} from './weather-calendar';

const hourly = [
  {
    time: '2026-09-01T21:30:00.000Z',
    temperatureC: 19,
    precipitationProbability: 10,
    condition: 'clear' as const,
  },
  {
    time: '2026-09-01T22:30:00.000Z',
    temperatureC: 18,
    precipitationProbability: 15,
    condition: 'clear' as const,
  },
  {
    time: '2026-09-02T06:00:00.000Z',
    temperatureC: 16,
    precipitationProbability: 20,
    condition: 'cloudy' as const,
  },
];

describe('weather calendar date and rule helpers', () => {
  it('groups hourly timestamps by the selected location timezone', () => {
    expect(calendarDateInTimezone('2026-09-01T21:30:00.000Z', 'Europe/Berlin')).toBe('2026-09-01');
    expect(calendarDateInTimezone('2026-09-01T22:30:00.000Z', 'Europe/Berlin')).toBe('2026-09-02');
    expect(hourlyForecastForDate(hourly, '2026-09-02', 'Europe/Berlin')).toHaveLength(2);
    expect(calendarDateInTimezone('not-a-date', 'UTC')).toBeUndefined();
    expect(calendarDateInTimezone('2026-09-01T12:00:00.000Z', 'invalid-zone')).toBeUndefined();
  });

  it("matches a user's weekday mask and optional active window for the selected date", () => {
    const rule = {
      schedule: {
        weekdays: ['wednesday'] as const,
        startsAt: '2026-09-01T22:00:00.000Z',
        endsAt: '2026-09-02T08:00:00.000Z',
        cooldownMinutes: 120,
      },
    } satisfies Pick<AlertRuleRecord, 'schedule'>;

    expect(alertRuleScheduledForDate(rule, '2026-09-02', 'Europe/Berlin', hourly)).toBe(true);
    expect(alertRuleScheduledForDate(rule, '2026-09-01', 'Europe/Berlin', hourly)).toBe(false);
    expect(
      alertRuleScheduledForDate(
        { schedule: { ...rule.schedule, startsAt: '2026-09-02T08:00:00.000Z' } },
        '2026-09-02',
        'Europe/Berlin',
        hourly,
      ),
    ).toBe(false);
  });
});
