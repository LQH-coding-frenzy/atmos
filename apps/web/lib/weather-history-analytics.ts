import type { CurrentWeather, UnitSystem, WeatherSnapshot } from '@atmos/contracts';

const millisecondsPerDay = 24 * 60 * 60 * 1000;

export type WeatherHistoryRange = '24h' | '7d' | '30d' | '90d' | 'custom';
export type WeatherHistoryMetric = 'temperature' | 'feels-like' | 'humidity' | 'wind' | 'pressure';
export type CustomHistoryRange = { start: string; end: string };
export const minimumAnomalySnapshots = 12;
export const minimumAnomalyDates = 7;

export type RecordedWeatherAnomaly = {
  metric: WeatherHistoryMetric;
  currentValue: number;
  baselineAverage: number;
  baselineStandardDeviation: number;
  threshold: number;
  deviation: number;
  direction: 'above' | 'below';
  sampleCount: number;
};

export type RecordedConditionAnomaly = {
  condition: 'rain' | 'snow' | 'thunderstorm';
  observedCount: number;
  sampleCount: number;
};

export type RecordedWeatherAnomalyAnalysis = {
  eligible: boolean;
  sampleCount: number;
  distinctDates: number;
  requiredSamples: number;
  requiredDates: number;
  anomalies: RecordedWeatherAnomaly[];
  unusualConditions: RecordedConditionAnomaly[];
};

const minimumAnomalyDeviation: Record<WeatherHistoryMetric, number> = {
  temperature: 3,
  'feels-like': 3,
  humidity: 15,
  wind: 12,
  pressure: 8,
};

export const weatherHistoryMetrics: ReadonlyArray<{
  value: WeatherHistoryMetric;
  label: string;
}> = [
  { value: 'temperature', label: 'Temperature' },
  { value: 'feels-like', label: 'Feels like' },
  { value: 'humidity', label: 'Humidity' },
  { value: 'wind', label: 'Wind speed' },
  { value: 'pressure', label: 'Pressure' },
];

export function dateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function shiftIsoDate(value: string, offsetDays: number) {
  const parts = value.split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return '';
  const date = new Date(Date.UTC(parts[0]!, parts[1]! - 1, parts[2]! + offsetDays));
  return date.toISOString().slice(0, 10);
}

function validIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!)).toISOString().slice(0, 10) === value;
}

export function customHistoryRangeIsValid(
  range: CustomHistoryRange,
  today: string,
  maximumDays = 90,
) {
  if (!validIsoDate(range.start) || !validIsoDate(range.end) || !validIsoDate(today)) return false;
  if (
    range.start > range.end ||
    range.start < shiftIsoDate(today, -(maximumDays - 1)) ||
    range.end > today
  ) {
    return false;
  }
  const spanDays =
    Math.floor(
      (Date.parse(`${range.end}T00:00:00.000Z`) - Date.parse(`${range.start}T00:00:00.000Z`)) /
        millisecondsPerDay,
    ) + 1;
  return spanDays <= maximumDays;
}

export function historyApiDays(
  range: WeatherHistoryRange,
  customRange: CustomHistoryRange,
  today = customRange.end,
): 7 | 30 | 90 {
  if (range === '24h' || range === '7d') return 7;
  if (range === '30d') return 30;
  if (range === '90d') return 90;
  if (!validIsoDate(customRange.start) || !validIsoDate(customRange.end) || !validIsoDate(today)) {
    return 7;
  }
  const spanDays =
    Math.floor(
      (Date.parse(`${today}T00:00:00.000Z`) - Date.parse(`${customRange.start}T00:00:00.000Z`)) /
        millisecondsPerDay,
    ) + 1;
  if (spanDays <= 7) return 7;
  if (spanDays <= 30) return 30;
  return 90;
}

export function selectRecordedHistory(
  snapshots: readonly WeatherSnapshot[],
  range: WeatherHistoryRange,
  now: number,
  timeZone: string,
  customRange: CustomHistoryRange,
): WeatherSnapshot[] {
  if (
    range === 'custom' &&
    !customHistoryRangeIsValid(customRange, dateInTimeZone(new Date(now), timeZone))
  ) {
    return [];
  }
  if (range === 'custom') {
    return snapshots.filter((snapshot) => {
      const observedDate = dateInTimeZone(new Date(snapshot.observed_at), timeZone);
      return observedDate >= customRange.start && observedDate <= customRange.end;
    });
  }
  const duration =
    range === '24h' ? millisecondsPerDay : Number(range.slice(0, -1)) * millisecondsPerDay;
  const start = now - duration;
  return snapshots.filter((snapshot) => {
    const observedAt = Date.parse(snapshot.observed_at);
    return observedAt >= start && observedAt <= now;
  });
}

export function weatherHistoryMetricValue(
  snapshot: WeatherSnapshot,
  metric: WeatherHistoryMetric,
  units: UnitSystem,
) {
  const { payload } = snapshot;
  const value = (() => {
    switch (metric) {
      case 'temperature':
        return payload.temperature_c;
      case 'feels-like':
        return payload.apparent_temperature_c;
      case 'humidity':
        return payload.humidity_percent;
      case 'wind':
        return payload.wind_speed_kph;
      case 'pressure':
        return payload.pressure_hpa;
    }
  })();
  return convertHistoryMetricValue(value, metric, units);
}

export function convertHistoryMetricValue(
  value: number,
  metric: WeatherHistoryMetric,
  units: UnitSystem,
) {
  switch (metric) {
    case 'temperature':
    case 'feels-like':
      return units === 'imperial' ? (value * 9) / 5 + 32 : value;
    case 'humidity':
      return value;
    case 'wind':
      return units === 'imperial' ? value / 1.60934 : value;
    case 'pressure':
      return units === 'imperial' ? value * 0.0295299830714 : value;
  }
}

export function weatherHistoryMetricUnit(metric: WeatherHistoryMetric, units: UnitSystem) {
  switch (metric) {
    case 'temperature':
    case 'feels-like':
      return units === 'imperial' ? '°F' : '°C';
    case 'humidity':
      return '%';
    case 'wind':
      return units === 'imperial' ? 'mph' : 'km/h';
    case 'pressure':
      return units === 'imperial' ? 'inHg' : 'hPa';
  }
}

export function formatWeatherHistoryMetric(
  value: number,
  metric: WeatherHistoryMetric,
  units: UnitSystem,
) {
  const formatted = new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value);
  const unit = weatherHistoryMetricUnit(metric, units);
  return unit === '%' ? `${formatted}%` : `${formatted} ${unit}`;
}

export function formatWeatherHistoryDifference(
  value: number,
  metric: WeatherHistoryMetric,
  units: UnitSystem,
) {
  if (metric === 'humidity') {
    return `${new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value)} percentage points`;
  }
  const converted =
    metric === 'temperature' || metric === 'feels-like'
      ? units === 'imperial'
        ? (value * 9) / 5
        : value
      : metric === 'wind'
        ? units === 'imperial'
          ? value / 1.60934
          : value
        : units === 'imperial'
          ? value * 0.0295299830714
          : value;
  return formatWeatherHistoryMetric(converted, metric, units);
}

export function aggregateWeatherHistory(
  snapshots: readonly WeatherSnapshot[],
  metric: WeatherHistoryMetric,
  units: UnitSystem,
) {
  const values = snapshots.map((snapshot) => weatherHistoryMetricValue(snapshot, metric, units));
  if (values.length === 0) return undefined;
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    count: values.length,
    minimum: Math.min(...values),
    average: sum / values.length,
    maximum: Math.max(...values),
  };
}

export function createWeatherHistoryChartPoints(
  snapshots: readonly WeatherSnapshot[],
  metric: WeatherHistoryMetric,
  units: UnitSystem,
) {
  const ordered = [...snapshots].sort((left, right) =>
    left.observed_at.localeCompare(right.observed_at),
  );
  const values = ordered.map((snapshot) => weatherHistoryMetricValue(snapshot, metric, units));
  const minimum = values.length ? Math.min(...values) : null;
  const maximum = values.length ? Math.max(...values) : null;
  const valueSpan = Math.max(1, (maximum ?? 0) - (minimum ?? 0));
  const firstTime = ordered[0] ? Date.parse(ordered[0].observed_at) : 0;
  const lastTime = ordered.at(-1) ? Date.parse(ordered.at(-1)!.observed_at) : firstTime;
  const timeSpan = Math.max(1, lastTime - firstTime);
  return {
    minimum,
    maximum,
    unit: weatherHistoryMetricUnit(metric, units),
    points: ordered.map((snapshot, index) => ({
      snapshot,
      value: values[index]!,
      x:
        ordered.length === 1
          ? 150
          : 10 + ((Date.parse(snapshot.observed_at) - firstTime) / timeSpan) * 280,
      y: maximum === minimum ? 50 : 90 - ((values[index]! - (minimum ?? 0)) / valueSpan) * 80,
    })),
  };
}

const conditionOrder = [
  'clear',
  'partly-cloudy',
  'cloudy',
  'rain',
  'snow',
  'thunderstorm',
] as const;

export function recordedConditionCounts(snapshots: readonly WeatherSnapshot[]) {
  const counts = new Map<string, number>();
  for (const snapshot of snapshots) {
    const condition = snapshot.payload.condition;
    counts.set(condition, (counts.get(condition) ?? 0) + 1);
  }
  return conditionOrder.flatMap((condition) => {
    const count = counts.get(condition);
    return count ? [{ condition, count }] : [];
  });
}

function currentHistoryMetricValue(current: CurrentWeather, metric: WeatherHistoryMetric) {
  switch (metric) {
    case 'temperature':
      return current.temperatureC;
    case 'feels-like':
      return current.apparentTemperatureC;
    case 'humidity':
      return current.humidityPercent;
    case 'wind':
      return current.windSpeedKph;
    case 'pressure':
      return current.pressureHpa;
  }
}

export function analyzeRecordedWeatherAnomalies(
  snapshots: readonly WeatherSnapshot[],
  current: CurrentWeather,
  timeZone: string,
): RecordedWeatherAnomalyAnalysis {
  const distinctDates = new Set(
    snapshots.map((snapshot) => dateInTimeZone(new Date(snapshot.observed_at), timeZone)),
  ).size;
  const eligible =
    snapshots.length >= minimumAnomalySnapshots && distinctDates >= minimumAnomalyDates;
  if (!eligible) {
    return {
      eligible: false,
      sampleCount: snapshots.length,
      distinctDates,
      requiredSamples: minimumAnomalySnapshots,
      requiredDates: minimumAnomalyDates,
      anomalies: [],
      unusualConditions: [],
    };
  }

  const anomalies = weatherHistoryMetrics.flatMap(({ value: metric }) => {
    const values = snapshots.map((snapshot) =>
      weatherHistoryMetricValue(snapshot, metric, 'metric'),
    );
    const currentValue = currentHistoryMetricValue(current, metric);
    if (!Number.isFinite(currentValue) || values.length < minimumAnomalySnapshots) return [];
    const baselineAverage = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance =
      values.reduce((sum, value) => sum + (value - baselineAverage) ** 2, 0) / values.length;
    const baselineStandardDeviation = Math.sqrt(variance);
    const deviation = currentValue - baselineAverage;
    const threshold = Math.max(minimumAnomalyDeviation[metric], baselineStandardDeviation * 2);
    if (Math.abs(deviation) < threshold) return [];
    return [
      {
        metric,
        currentValue,
        baselineAverage,
        baselineStandardDeviation,
        threshold,
        deviation,
        direction: deviation > 0 ? ('above' as const) : ('below' as const),
        sampleCount: values.length,
      },
    ];
  });

  const conditionCounts = recordedConditionCounts(snapshots);
  const unusualConditions = (['rain', 'snow', 'thunderstorm'] as const)
    .flatMap((condition) => {
      const observedCount =
        conditionCounts.find((item) => item.condition === condition)?.count ?? 0;
      return observedCount / snapshots.length <= 0.1
        ? [{ condition, observedCount, sampleCount: snapshots.length }]
        : [];
    })
    .filter((item) => current.condition === item.condition);

  return {
    eligible: true,
    sampleCount: snapshots.length,
    distinctDates,
    requiredSamples: minimumAnomalySnapshots,
    requiredDates: minimumAnomalyDates,
    anomalies,
    unusualConditions,
  };
}
