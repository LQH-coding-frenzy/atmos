type RecordValue = Record<string, unknown>;

const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

type SupportedThresholdMetric =
  | 'temperature'
  | 'feels-like'
  | 'rain-probability'
  | 'rainfall'
  | 'snowfall'
  | 'wind'
  | 'gust'
  | 'uv'
  | 'aqi'
  | 'pm2.5'
  | 'visibility';
type SupportedOccurrenceMetric =
  'thunderstorm' | 'freeze-risk' | 'extreme-heat' | 'provider-severe-weather-alert';
type AlertRuleConditionInsert =
  | { metric: SupportedOccurrenceMetric; expected: true }
  | {
      metric: SupportedThresholdMetric;
      comparison: 'above' | 'below';
      value: number;
    };

const thresholdRanges: Record<SupportedThresholdMetric, readonly [number, number]> = {
  temperature: [-150, 100],
  'feels-like': [-150, 100],
  'rain-probability': [0, 100],
  rainfall: [0, 1000],
  snowfall: [0, 1000],
  wind: [0, 500],
  gust: [0, 500],
  uv: [0, 30],
  aqi: [0, 1000],
  'pm2.5': [0, 10000],
  visibility: [0, 1000],
};
const occurrenceMetrics: readonly SupportedOccurrenceMetric[] = [
  'thunderstorm',
  'freeze-risk',
  'extreme-heat',
  'provider-severe-weather-alert',
];

export type AlertRuleLocation = { latitude: number; longitude: number };
export type AlertRuleSchedule = {
  startsAt?: string;
  endsAt?: string;
  weekdays: string[];
  cooldownMinutes: number;
};

export type AlertRuleInsert = AlertRuleLocation & {
  user_id: string;
  location_id: string;
  conditions: AlertRuleConditionInsert[];
  schedule: AlertRuleSchedule;
  notification_channels: string[];
  enabled: true;
};

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validOffsetDateTime(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 64 &&
    value.includes('T') &&
    /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

export function parseAlertRuleSchedule(value: unknown): AlertRuleSchedule | undefined {
  if (!isRecord(value)) return undefined;
  const allowedKeys = new Set(['startsAt', 'endsAt', 'weekdays', 'cooldownMinutes']);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return undefined;
  if (
    !Array.isArray(value.weekdays) ||
    value.weekdays.length < 1 ||
    value.weekdays.length > weekdays.length ||
    value.weekdays.some((day) => typeof day !== 'string' || !weekdays.includes(day)) ||
    new Set(value.weekdays).size !== value.weekdays.length ||
    !Number.isInteger(value.cooldownMinutes) ||
    (value.cooldownMinutes as number) < 1 ||
    (value.cooldownMinutes as number) > 10080
  ) {
    return undefined;
  }

  if (value.startsAt !== undefined && !validOffsetDateTime(value.startsAt)) return undefined;
  if (value.endsAt !== undefined && !validOffsetDateTime(value.endsAt)) return undefined;
  if (
    value.startsAt !== undefined &&
    value.endsAt !== undefined &&
    Date.parse(value.startsAt as string) >= Date.parse(value.endsAt as string)
  ) {
    return undefined;
  }

  return {
    ...(value.startsAt === undefined ? {} : { startsAt: value.startsAt as string }),
    ...(value.endsAt === undefined ? {} : { endsAt: value.endsAt as string }),
    weekdays: value.weekdays as string[],
    cooldownMinutes: value.cooldownMinutes as number,
  };
}

const defaultSchedule: AlertRuleSchedule = {
  weekdays: [...weekdays],
  cooldownMinutes: 60,
};

export function parseAlertRuleLocation(
  latitudeValue: string | undefined,
  longitudeValue: string | undefined,
): AlertRuleLocation | undefined {
  if (!latitudeValue?.trim() || !longitudeValue?.trim()) return undefined;
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return undefined;
  }
  return { latitude, longitude };
}

export function parseAlertRuleInsert(value: unknown, userId: string): AlertRuleInsert | undefined {
  if (!isRecord(value)) return undefined;
  const { location_id: locationId, latitude, longitude, condition } = value;
  const schedule =
    value.schedule === undefined
      ? { ...defaultSchedule, weekdays: [...defaultSchedule.weekdays] }
      : parseAlertRuleSchedule(value.schedule);
  if (
    typeof locationId !== 'string' ||
    locationId.trim().length < 1 ||
    locationId.trim().length > 120 ||
    !finiteNumber(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !finiteNumber(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !isRecord(condition) ||
    typeof condition.metric !== 'string' ||
    !schedule
  ) {
    return undefined;
  }

  if (occurrenceMetrics.includes(condition.metric as SupportedOccurrenceMetric)) {
    if (condition.expected !== true) return undefined;
    return {
      user_id: userId,
      location_id: locationId.trim(),
      latitude,
      longitude,
      conditions: [{ metric: condition.metric as SupportedOccurrenceMetric, expected: true }],
      schedule,
      notification_channels: ['in-app'],
      enabled: true,
    };
  }

  const metric = condition.metric as SupportedThresholdMetric;
  const range = thresholdRanges[metric];
  if (
    !range ||
    (condition.comparison !== 'above' && condition.comparison !== 'below') ||
    !finiteNumber(condition.value) ||
    condition.value < range[0] ||
    condition.value > range[1]
  ) {
    return undefined;
  }

  return {
    user_id: userId,
    location_id: locationId.trim(),
    latitude,
    longitude,
    conditions: [
      {
        metric,
        comparison: condition.comparison,
        value: condition.value,
      },
    ],
    schedule,
    notification_channels: ['in-app'],
    enabled: true,
  };
}

export function parseAlertRuleEnabledUpdate(value: unknown): { enabled: boolean } | undefined {
  if (!isRecord(value) || typeof value.enabled !== 'boolean') return undefined;
  return { enabled: value.enabled };
}
