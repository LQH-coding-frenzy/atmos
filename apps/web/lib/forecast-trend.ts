import type { ExtendedDailyForecast, HourlyForecast, UnitSystem } from '@atmos/contracts';

export const forecastTrendMetrics = [
  'temperature',
  'feels-like',
  'humidity',
  'precipitation',
  'rain-chance',
  'accumulated-rainfall',
  'pressure',
  'wind',
  'gusts',
  'uv',
  'visibility',
  'clouds',
] as const;
export type ForecastTrendMetric = (typeof forecastTrendMetrics)[number];
export type ForecastTrendRange = '12h' | '7d' | '16d';
export type ForecastTrendPoint = {
  label: string;
  time: string;
  value: number | null;
  isDay?: boolean | null;
  rainProbability?: number | null;
  sunrise?: string | null;
  sunset?: string | null;
};
export type ForecastTrend = {
  labels: string[];
  values: Array<number | null>;
  points: ForecastTrendPoint[];
  unit: string;
  label: string;
  series: 'line' | 'bar';
  minimum: number | null;
  maximum: number | null;
};

export const forecastTrendMetricLabels: Record<ForecastTrendMetric, string> = {
  temperature: 'Temperature',
  'feels-like': 'Feels like',
  humidity: 'Humidity',
  precipitation: 'Precipitation',
  'rain-chance': 'Rain probability',
  'accumulated-rainfall': 'Accumulated rainfall',
  pressure: 'Pressure',
  wind: 'Wind speed',
  gusts: 'Wind gusts',
  uv: 'UV index',
  visibility: 'Visibility',
  clouds: 'Cloud cover',
};

function convert(value: number | null | undefined, metric: ForecastTrendMetric, units: UnitSystem) {
  if (value == null || !Number.isFinite(value)) return null;
  switch (metric) {
    case 'temperature':
    case 'feels-like':
      return units === 'imperial' ? (value * 9) / 5 + 32 : value;
    case 'precipitation':
    case 'accumulated-rainfall':
      return units === 'imperial' ? value / 25.4 : value;
    case 'wind':
    case 'gusts':
      return units === 'imperial' ? value * 0.621371 : value;
    case 'visibility':
      return value / (units === 'imperial' ? 1609.344 : 1000);
    default:
      return value;
  }
}

function unit(metric: ForecastTrendMetric, units: UnitSystem) {
  switch (metric) {
    case 'temperature':
    case 'feels-like':
      return units === 'imperial' ? '°F' : '°C';
    case 'humidity':
    case 'rain-chance':
    case 'clouds':
      return '%';
    case 'precipitation':
    case 'accumulated-rainfall':
      return units === 'imperial' ? 'in' : 'mm';
    case 'pressure':
      return 'hPa';
    case 'wind':
    case 'gusts':
      return units === 'imperial' ? 'mph' : 'km/h';
    case 'uv':
      return 'index';
    case 'visibility':
      return units === 'imperial' ? 'mi' : 'km';
  }
}

function dailyValue(day: ExtendedDailyForecast, metric: ForecastTrendMetric): number | null {
  switch (metric) {
    case 'temperature':
      return day.highC;
    case 'feels-like':
      return day.apparentTemperatureMaxC ?? null;
    case 'humidity':
      return day.humidityMeanPercent ?? null;
    case 'precipitation':
      return day.precipitationMm ?? null;
    case 'rain-chance':
      return day.precipitationProbability;
    case 'pressure':
      return day.pressureMeanHpa ?? null;
    case 'wind':
      return day.windSpeedMaxKph ?? null;
    case 'gusts':
      return day.windGustMaxKph ?? null;
    case 'uv':
      return day.uvIndexMax ?? null;
    case 'visibility':
      return day.visibilityMeanM ?? null;
    case 'clouds':
      return day.cloudCoverMeanPercent ?? null;
    case 'accumulated-rainfall':
      return day.rainMm ?? null;
  }
}

function hourlyValue(hour: HourlyForecast, metric: ForecastTrendMetric): number | null {
  switch (metric) {
    case 'temperature':
      return hour.temperatureC;
    case 'feels-like':
      return hour.apparentTemperatureC ?? null;
    case 'humidity':
      return hour.humidityPercent ?? null;
    case 'precipitation':
      return hour.precipitationMm ?? null;
    case 'rain-chance':
      return hour.precipitationProbability;
    case 'pressure':
      return hour.pressureHpa ?? null;
    case 'wind':
      return hour.windSpeedKph ?? null;
    case 'gusts':
      return hour.windGustKph ?? null;
    case 'uv':
      return hour.uvIndex ?? null;
    case 'visibility':
      return hour.visibilityM ?? null;
    case 'clouds':
      return hour.cloudCoverPercent ?? null;
    case 'accumulated-rainfall':
      return null;
  }
}

function dailyLabel(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

export function createForecastTrend(
  daily: readonly ExtendedDailyForecast[],
  metric: ForecastTrendMetric,
  units: UnitSystem,
  range: ForecastTrendRange = '7d',
  hourly: readonly HourlyForecast[] = [],
  timezone = 'UTC',
): ForecastTrend {
  const points: ForecastTrendPoint[] = [];
  if (range === '12h') {
    for (const hour of hourly) {
      points.push({
        label: new Intl.DateTimeFormat('en', { hour: 'numeric', timeZone: timezone }).format(
          new Date(hour.time),
        ),
        time: hour.time,
        value: convert(hourlyValue(hour, metric), metric, units),
        isDay: hour.isDay,
        rainProbability: hour.precipitationProbability,
      });
    }
  } else {
    let accumulated = 0;
    let complete = true;
    for (const day of daily.slice(0, range === '7d' ? 7 : 16)) {
      let raw: number | null;
      if (metric === 'accumulated-rainfall') {
        if (!complete || day.rainMm == null) {
          complete = false;
          raw = null;
        } else {
          accumulated += day.rainMm;
          raw = accumulated;
        }
      } else {
        raw = dailyValue(day, metric);
      }
      points.push({
        label: dailyLabel(day.date),
        time: `${day.date}T12:00:00.000Z`,
        value: convert(raw, metric, units),
        rainProbability: day.precipitationProbability,
        sunrise: day.sunrise,
        sunset: day.sunset,
      });
    }
  }
  const values = points.map((point) => point.value);
  const available = values.filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  const barSeries = metric === 'precipitation' || metric === 'rain-chance';
  return {
    labels: points.map((point) => point.label),
    values,
    points,
    unit: unit(metric, units),
    label: forecastTrendMetricLabels[metric],
    series: barSeries ? 'bar' : 'line',
    minimum: available.length ? Math.min(...available) : null,
    maximum: available.length ? Math.max(...available) : null,
  };
}

export function forecastTrendAvailable(
  metric: ForecastTrendMetric,
  range: ForecastTrendRange,
  hourly: readonly HourlyForecast[],
) {
  return range !== '12h'
    ? true
    : metric !== 'accumulated-rainfall' &&
        hourly.some((point) => hourlyValue(point, metric) !== null);
}

export function formatForecastTrendValue(value: number | null, trend: Pick<ForecastTrend, 'unit'>) {
  return value === null
    ? 'Unavailable'
    : `${new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value)} ${trend.unit}`;
}
