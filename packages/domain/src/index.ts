import type { HourlyForecast, UnitSystem } from '@atmos/contracts';

export const plannerActivityKinds = [
  'running',
  'cycling',
  'hiking',
  'football',
  'photography',
  'beach',
  'commuting',
  'sightseeing',
  'picnic',
] as const;
export type PlannerActivityKind = (typeof plannerActivityKinds)[number];

export type PlannerActivity =
  { kind: PlannerActivityKind; name?: never } | { kind: 'custom'; name: string };

export const plannerDimensions = [
  'temperature',
  'feels-like',
  'humidity',
  'rain',
  'wind',
  'uv',
  'aqi',
] as const;
export type PlannerDimension = (typeof plannerDimensions)[number];

export interface PlannerFactor {
  dimension: PlannerDimension;
  impact: 'positive' | 'negative';
  explanation: string;
}

export interface PlannerTimeWindow {
  startsAt: string;
  endsAt: string;
  score: number;
  factors: readonly PlannerFactor[];
}

export interface PlannerResult {
  activity: PlannerActivity;
  score: number;
  rankedWindows: readonly PlannerTimeWindow[];
  factors: readonly PlannerFactor[];
}

export const supportedPlannerActivities = ['running', 'cycling', 'hiking', 'photography'] as const;
export type SupportedPlannerActivity = (typeof supportedPlannerActivities)[number];

function scoreActivityHour(
  activity: SupportedPlannerActivity,
  hour: HourlyForecast,
): PlannerTimeWindow {
  let score = 55;
  const factors: PlannerFactor[] = [];
  const [minimum, maximum] = activity === 'photography' ? [8, 28] : [7, 23];
  if (hour.temperatureC >= minimum && hour.temperatureC <= maximum) {
    score += 20;
    factors.push({
      dimension: 'temperature',
      impact: 'positive',
      explanation: 'Comfortable temperature.',
    });
  } else {
    score -= 15;
    factors.push({
      dimension: 'temperature',
      impact: 'negative',
      explanation: 'Temperature is outside the comfortable range.',
    });
  }
  if (hour.precipitationProbability <= 20) {
    score += 20;
    factors.push({ dimension: 'rain', impact: 'positive', explanation: 'Low chance of rain.' });
  } else if (hour.precipitationProbability >= 50) {
    score -= 35;
    factors.push({ dimension: 'rain', impact: 'negative', explanation: 'High chance of rain.' });
  }
  if (hour.condition === 'thunderstorm' || hour.condition === 'snow') {
    score -= 40;
    factors.push({
      dimension: 'rain',
      impact: 'negative',
      explanation: 'Severe or winter conditions expected.',
    });
  }
  if (activity === 'photography' && hour.condition === 'partly-cloudy') {
    score += 10;
    factors.push({
      dimension: 'temperature',
      impact: 'positive',
      explanation: 'Partly cloudy light can add visual interest.',
    });
  }
  return {
    startsAt: hour.time,
    endsAt: new Date(new Date(hour.time).getTime() + 60 * 60_000).toISOString(),
    score: Math.max(0, Math.min(100, score)),
    factors,
  };
}

export function planActivity(
  activity: SupportedPlannerActivity,
  hourly: readonly HourlyForecast[],
): PlannerResult {
  const rankedWindows = hourly
    .map((hour) => scoreActivityHour(activity, hour))
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);
  return {
    activity: { kind: activity },
    score: rankedWindows[0]?.score ?? 0,
    rankedWindows,
    factors: rankedWindows[0]?.factors ?? [],
  };
}

export const alertThresholdMetrics = [
  'temperature',
  'feels-like',
  'rain-probability',
  'rainfall',
  'snowfall',
  'wind',
  'gust',
  'uv',
  'aqi',
  'pm2.5',
  'visibility',
] as const;
export type AlertThresholdMetric = (typeof alertThresholdMetrics)[number];

export const alertOccurrenceMetrics = [
  'thunderstorm',
  'freeze-risk',
  'extreme-heat',
  'provider-severe-weather-alert',
] as const;
export type AlertOccurrenceMetric = (typeof alertOccurrenceMetrics)[number];

export type AlertCondition =
  | {
      metric: AlertThresholdMetric;
      comparison: 'above' | 'below';
      value: number;
      expected?: never;
    }
  | {
      metric: AlertOccurrenceMetric;
      expected: true;
      comparison?: never;
      value?: never;
    };

export type Weekday =
  'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface AlertSchedule {
  startsAt?: string;
  endsAt?: string;
  weekdays: readonly Weekday[];
  cooldownMinutes: number;
}

export type AlertNotificationChannel = 'in-app' | 'email' | 'push';

export interface AlertRule {
  id: string;
  locationId: string;
  conditions: readonly AlertCondition[];
  schedule: AlertSchedule;
  notificationChannels: readonly AlertNotificationChannel[];
  enabled: boolean;
}

export function formatTemperature(temperatureC: number, units: UnitSystem): string {
  if (units === 'imperial') {
    return `${Math.round((temperatureC * 9) / 5 + 32)} deg`;
  }

  return `${Math.round(temperatureC)} deg`;
}

export function formatWindSpeed(windKph: number, units: UnitSystem): string {
  if (units === 'imperial') {
    return `${Math.round(windKph * 0.621371)} mph`;
  }

  return `${Math.round(windKph)} km/h`;
}
