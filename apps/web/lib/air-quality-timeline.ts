import type { AirQuality, AirQualityHour } from '@atmos/contracts';

export const airQualityMetrics = [
  { value: 'usAqi', label: 'U.S. AQI', unit: 'index' },
  { value: 'europeanAqi', label: 'European AQI', unit: 'index' },
  { value: 'pm25', label: 'PM2.5', unit: 'µg/m³' },
  { value: 'pm10', label: 'PM10', unit: 'µg/m³' },
  { value: 'nitrogenDioxide', label: 'NO₂', unit: 'µg/m³' },
  { value: 'ozone', label: 'O₃', unit: 'µg/m³' },
  { value: 'sulphurDioxide', label: 'SO₂', unit: 'µg/m³' },
  { value: 'carbonMonoxide', label: 'CO', unit: 'µg/m³' },
] as const;
export type AirQualityMetric = (typeof airQualityMetrics)[number]['value'];
export type AirQualityPeriod = 'forecast' | 'history';

export function airQualityMetricValue(hour: AirQualityHour, metric: AirQualityMetric) {
  return metric === 'usAqi' || metric === 'europeanAqi' ? hour[metric] : hour.pollutants[metric];
}

export function selectAirQualityHours(
  data: AirQuality,
  period: AirQualityPeriod,
  range: '24h' | 'full',
) {
  const anchor = Math.floor(Date.parse(data.observedAt) / 3600000) * 3600000;
  const duration = (range === '24h' ? 24 : period === 'history' ? 7 * 24 : 5 * 24) * 3600000;
  return (data.timeline?.hours ?? []).filter((hour) => {
    const time = Date.parse(hour.time);
    return period === 'history'
      ? time >= anchor - duration && time < anchor
      : time >= anchor && time < anchor + duration;
  });
}

export function createAirQualityPlot(hours: readonly AirQualityHour[], metric: AirQualityMetric) {
  const available = hours.flatMap((hour) => {
    const value = airQualityMetricValue(hour, metric);
    return value === null ? [] : [value];
  });
  const maximum = Math.max(1, ...available);
  const start = hours[0] ? Date.parse(hours[0].time) : 0;
  const end = hours.at(-1) ? Date.parse(hours.at(-1)!.time) : start;
  const span = Math.max(3600000, end - start);
  const points = hours.map((hour) => {
    const value = airQualityMetricValue(hour, metric);
    return {
      time: hour.time,
      value,
      x: hours.length === 1 ? 320 : 40 + ((Date.parse(hour.time) - start) / span) * 580,
      y: value === null ? null : 170 - (value / maximum) * 140,
    };
  });
  const paths: string[] = [];
  let current = '';
  let previousTime: number | undefined;
  for (const point of points) {
    const time = Date.parse(point.time);
    if (point.value === null || (previousTime !== undefined && time - previousTime > 3600000)) {
      if (current) paths.push(current);
      current = '';
    }
    if (point.y !== null)
      current += `${current ? ' L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`;
    previousTime = time;
  }
  if (current) paths.push(current);
  return {
    points,
    paths,
    maximum,
    available: available.length,
    minimum: available.length ? Math.min(...available) : null,
    peak: available.length ? Math.max(...available) : null,
  };
}
