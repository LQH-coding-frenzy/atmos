import type { UnitSystem } from '@atmos/contracts';

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

export type PlannerActivity = { kind: PlannerActivityKind } | { kind: 'custom'; name: string };

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
    }
  | {
      metric: AlertOccurrenceMetric;
      expected: true;
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
