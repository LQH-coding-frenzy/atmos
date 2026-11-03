import type { UnitSystem, WeatherCondition } from '@atmos/contracts';
import { formatTemperature } from '@atmos/domain';

export function conditionLabel(condition: WeatherCondition): string {
  return condition.replace('-', ' ');
}

export function temperature(value: number, units: UnitSystem): string {
  return formatTemperature(value, units).replace(' deg', '');
}

export function temperatureWithDegree(value: number, units: UnitSystem): string {
  return `${temperature(value, units)}°`;
}

export function formatHour(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('en', { hour: 'numeric', timeZone: timezone }).format(
    new Date(value),
  );
}

export function formatDashboardDate(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('en', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: timezone,
  }).format(new Date(value));
}

export function formatForecastDate(value: string): string {
  const [year = 0, month = 1, day = 1] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatTimestamp(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(value));
}
