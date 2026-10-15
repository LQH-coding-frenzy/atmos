import type { UnitSystem } from '@atmos/contracts';

export function formatOptionalNumber(value: number | null | undefined, unit = '', digits = 0) {
  return value == null || !Number.isFinite(value)
    ? 'Unavailable'
    : `${new Intl.NumberFormat('en', { maximumFractionDigits: digits }).format(value)}${unit}`;
}

export function formatPrecipitation(value: number | null | undefined, units: UnitSystem) {
  return formatOptionalNumber(
    value == null ? value : units === 'imperial' ? value / 25.4 : value,
    units === 'imperial' ? ' in' : ' mm',
    units === 'imperial' ? 2 : 1,
  );
}

export function formatSnowfall(valueCm: number | null | undefined, units: UnitSystem) {
  return formatOptionalNumber(
    valueCm == null ? valueCm : units === 'imperial' ? valueCm / 2.54 : valueCm,
    units === 'imperial' ? ' in' : ' cm',
    units === 'imperial' ? 2 : 1,
  );
}

export function formatVisibility(valueM: number | null | undefined, units: UnitSystem) {
  return formatOptionalNumber(
    valueM == null ? valueM : valueM / (units === 'imperial' ? 1609.344 : 1000),
    units === 'imperial' ? ' mi' : ' km',
    1,
  );
}

export function formatDirection(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return 'Unavailable';
  const direction = [
    'N',
    'NNE',
    'NE',
    'ENE',
    'E',
    'ESE',
    'SE',
    'SSE',
    'S',
    'SSW',
    'SW',
    'WSW',
    'W',
    'WNW',
    'NW',
    'NNW',
  ][Math.round(value / 22.5) % 16];
  return `${direction} · ${Math.round(value)}°`;
}

export function formatDaylight(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return 'Unavailable';
  const minutes = Math.round(seconds / 60);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

export function formatSunTime(value: string | null | undefined, timezone: string) {
  if (value === null) return 'No event';
  if (value === undefined || !Number.isFinite(Date.parse(value))) return 'Unavailable';
  return new Intl.DateTimeFormat('en', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(value));
}

export function formatUv(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return 'Unavailable';
  const category =
    value < 3
      ? 'Low'
      : value < 6
        ? 'Moderate'
        : value < 8
          ? 'High'
          : value < 11
            ? 'Very high'
            : 'Extreme';
  return `${formatOptionalNumber(value, '', 1)} · ${category}`;
}
