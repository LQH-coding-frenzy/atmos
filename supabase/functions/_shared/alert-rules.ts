type RecordValue = Record<string, unknown>;

const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

type SupportedThresholdMetric = 'temperature' | 'feels-like' | 'rain-probability' | 'wind';
type AlertRuleConditionInsert =
  | { metric: 'thunderstorm'; expected: true }
  | {
      metric: SupportedThresholdMetric;
      comparison: 'above' | 'below';
      value: number;
    };

const thresholdRanges: Record<SupportedThresholdMetric, readonly [number, number]> = {
  temperature: [-150, 100],
  'feels-like': [-150, 100],
  'rain-probability': [0, 100],
  wind: [0, 500],
};

export type AlertRuleLocation = { latitude: number; longitude: number };

export type AlertRuleInsert = AlertRuleLocation & {
  user_id: string;
  location_id: string;
  conditions: AlertRuleConditionInsert[];
  schedule: { weekdays: string[]; cooldownMinutes: number };
  notification_channels: string[];
  enabled: true;
};

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

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
    typeof condition.metric !== 'string'
  ) {
    return undefined;
  }

  if (condition.metric === 'thunderstorm') {
    if (condition.expected !== true) return undefined;
    return {
      user_id: userId,
      location_id: locationId.trim(),
      latitude,
      longitude,
      conditions: [{ metric: 'thunderstorm', expected: true }],
      schedule: { weekdays, cooldownMinutes: 60 },
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
    schedule: { weekdays, cooldownMinutes: 60 },
    notification_channels: ['in-app'],
    enabled: true,
  };
}

export function parseAlertRuleEnabledUpdate(value: unknown): { enabled: boolean } | undefined {
  if (!isRecord(value) || typeof value.enabled !== 'boolean') return undefined;
  return { enabled: value.enabled };
}
