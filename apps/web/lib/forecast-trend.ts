import type { Dashboard, UnitSystem } from '@atmos/contracts';

export const forecastTrendMetrics = ['temperature', 'rain-chance'] as const;
export type ForecastTrendMetric = (typeof forecastTrendMetrics)[number];

export function createForecastTrend(
  daily: Dashboard['daily'],
  metric: ForecastTrendMetric,
  units: UnitSystem,
): { labels: string[]; values: number[]; unit: string; label: string } {
  return {
    labels: daily.map((day) =>
      new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' }).format(
        new Date(`${day.date}T00:00:00Z`),
      ),
    ),
    values: daily.map((day) =>
      metric === 'temperature'
        ? Math.round(units === 'imperial' ? (day.highC * 9) / 5 + 32 : day.highC)
        : day.precipitationProbability,
    ),
    unit: metric === 'temperature' ? (units === 'imperial' ? 'F' : 'C') : '%',
    label: metric === 'temperature' ? 'Daily high temperature' : 'Rain chance',
  };
}
