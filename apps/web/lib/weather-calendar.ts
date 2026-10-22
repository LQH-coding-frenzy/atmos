import type { AlertRuleRecord, HourlyForecast } from '@atmos/contracts';
import type { Weekday } from '@atmos/domain';

const weekdays: readonly Weekday[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

export function calendarDateInTimezone(value: string, timezone: string): string | undefined {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: timezone,
    }).formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    return year && month && day ? `${year}-${month}-${day}` : undefined;
  } catch {
    return undefined;
  }
}

export function hourlyForecastForDate(
  hourly: readonly HourlyForecast[],
  date: string,
  timezone: string,
) {
  return hourly.filter((hour) => calendarDateInTimezone(hour.time, timezone) === date);
}

function weekdayForCalendarDate(date: string): Weekday | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const timestamp = Date.parse(`${date}T12:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) {
    return undefined;
  }
  return weekdays[new Date(timestamp).getUTCDay()];
}

export function alertRuleScheduledForDate(
  rule: Pick<AlertRuleRecord, 'schedule'>,
  date: string,
  timezone: string,
  hourly: readonly HourlyForecast[],
) {
  const weekday = weekdayForCalendarDate(date);
  if (!weekday || !rule.schedule.weekdays.includes(weekday)) return false;

  const start = rule.schedule.startsAt ? Date.parse(rule.schedule.startsAt) : undefined;
  const end = rule.schedule.endsAt ? Date.parse(rule.schedule.endsAt) : undefined;
  if (
    (start !== undefined && !Number.isFinite(start)) ||
    (end !== undefined && !Number.isFinite(end))
  ) {
    return false;
  }
  if (start === undefined && end === undefined) return true;

  const dayHours = hourlyForecastForDate(hourly, date, timezone);
  if (dayHours.length) {
    return dayHours.some((hour) => {
      const timestamp = Date.parse(hour.time);
      return (
        Number.isFinite(timestamp) &&
        (start === undefined || timestamp >= start) &&
        (end === undefined || timestamp < end)
      );
    });
  }

  const startDate =
    start === undefined ? undefined : calendarDateInTimezone(rule.schedule.startsAt!, timezone);
  const endDate =
    end === undefined ? undefined : calendarDateInTimezone(rule.schedule.endsAt!, timezone);
  return (
    (startDate === undefined || date >= startDate) && (endDate === undefined || date <= endDate)
  );
}
