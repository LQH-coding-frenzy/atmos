import type { WeatherSnapshot } from '@atmos/contracts';

const columns = [
  'location',
  'observed_at',
  'temperature_c',
  'feels_like_c',
  'humidity_percent',
  'wind_speed_kph',
  'pressure_hpa',
  'condition',
  'provider',
] as const;

function csvCell(value: string | number) {
  const text = String(value);
  const safeText = typeof value === 'string' && /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

export function weatherHistoryToCsv(snapshots: WeatherSnapshot[]) {
  const rows = [...snapshots]
    .sort((left, right) => left.observed_at.localeCompare(right.observed_at))
    .map((snapshot) => [
      snapshot.payload.location_name,
      snapshot.observed_at,
      snapshot.payload.temperature_c,
      snapshot.payload.apparent_temperature_c,
      snapshot.payload.humidity_percent,
      snapshot.payload.wind_speed_kph,
      snapshot.payload.pressure_hpa,
      snapshot.payload.condition,
      snapshot.provider,
    ]);
  return [columns, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
