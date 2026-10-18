import type { AirQualityHour, CurrentWeather, HourlyForecast, UnitSystem } from '@atmos/contracts';

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

export const plannerActivityLabels: Record<PlannerActivityKind, string> = {
  running: 'Running',
  cycling: 'Cycling',
  hiking: 'Hiking',
  football: 'Football',
  photography: 'Photography',
  beach: 'Beach day',
  commuting: 'Commuting',
  sightseeing: 'Sightseeing',
  picnic: 'Picnic',
};

export type PlannerThresholds = {
  temperatureMinC: number;
  temperatureMaxC: number;
  feelsLikeMinC: number;
  feelsLikeMaxC: number;
  humidityMaxPercent: number;
  rainProbabilityMax: number;
  precipitationMmMax: number;
  windSpeedKphMax: number;
  windGustKphMax: number;
  uvIndexMax: number;
  usAqiMax: number;
};

export const defaultCustomPlannerThresholds: PlannerThresholds = {
  temperatureMinC: 10,
  temperatureMaxC: 28,
  feelsLikeMinC: 8,
  feelsLikeMaxC: 30,
  humidityMaxPercent: 80,
  rainProbabilityMax: 25,
  precipitationMmMax: 1,
  windSpeedKphMax: 30,
  windGustKphMax: 45,
  uvIndexMax: 7,
  usAqiMax: 100,
};

export const plannerActivityProfiles: Record<PlannerActivityKind, PlannerThresholds> = {
  running: {
    temperatureMinC: 5,
    temperatureMaxC: 24,
    feelsLikeMinC: 3,
    feelsLikeMaxC: 26,
    humidityMaxPercent: 80,
    rainProbabilityMax: 20,
    precipitationMmMax: 0.8,
    windSpeedKphMax: 30,
    windGustKphMax: 45,
    uvIndexMax: 7,
    usAqiMax: 100,
  },
  cycling: {
    temperatureMinC: 8,
    temperatureMaxC: 26,
    feelsLikeMinC: 6,
    feelsLikeMaxC: 28,
    humidityMaxPercent: 78,
    rainProbabilityMax: 15,
    precipitationMmMax: 0.5,
    windSpeedKphMax: 24,
    windGustKphMax: 38,
    uvIndexMax: 7,
    usAqiMax: 100,
  },
  hiking: {
    temperatureMinC: 4,
    temperatureMaxC: 23,
    feelsLikeMinC: 2,
    feelsLikeMaxC: 26,
    humidityMaxPercent: 85,
    rainProbabilityMax: 25,
    precipitationMmMax: 1,
    windSpeedKphMax: 35,
    windGustKphMax: 50,
    uvIndexMax: 7,
    usAqiMax: 100,
  },
  football: {
    temperatureMinC: 8,
    temperatureMaxC: 25,
    feelsLikeMinC: 6,
    feelsLikeMaxC: 27,
    humidityMaxPercent: 80,
    rainProbabilityMax: 15,
    precipitationMmMax: 0.5,
    windSpeedKphMax: 28,
    windGustKphMax: 40,
    uvIndexMax: 6,
    usAqiMax: 100,
  },
  photography: {
    temperatureMinC: 6,
    temperatureMaxC: 29,
    feelsLikeMinC: 4,
    feelsLikeMaxC: 31,
    humidityMaxPercent: 90,
    rainProbabilityMax: 35,
    precipitationMmMax: 1.5,
    windSpeedKphMax: 35,
    windGustKphMax: 50,
    uvIndexMax: 9,
    usAqiMax: 150,
  },
  beach: {
    temperatureMinC: 23,
    temperatureMaxC: 36,
    feelsLikeMinC: 22,
    feelsLikeMaxC: 38,
    humidityMaxPercent: 85,
    rainProbabilityMax: 15,
    precipitationMmMax: 0.3,
    windSpeedKphMax: 25,
    windGustKphMax: 38,
    uvIndexMax: 8,
    usAqiMax: 100,
  },
  commuting: {
    temperatureMinC: -5,
    temperatureMaxC: 30,
    feelsLikeMinC: -10,
    feelsLikeMaxC: 33,
    humidityMaxPercent: 95,
    rainProbabilityMax: 55,
    precipitationMmMax: 2.5,
    windSpeedKphMax: 45,
    windGustKphMax: 65,
    uvIndexMax: 10,
    usAqiMax: 150,
  },
  sightseeing: {
    temperatureMinC: 10,
    temperatureMaxC: 30,
    feelsLikeMinC: 8,
    feelsLikeMaxC: 32,
    humidityMaxPercent: 82,
    rainProbabilityMax: 25,
    precipitationMmMax: 1,
    windSpeedKphMax: 35,
    windGustKphMax: 50,
    uvIndexMax: 7,
    usAqiMax: 100,
  },
  picnic: {
    temperatureMinC: 17,
    temperatureMaxC: 29,
    feelsLikeMinC: 16,
    feelsLikeMaxC: 31,
    humidityMaxPercent: 76,
    rainProbabilityMax: 15,
    precipitationMmMax: 0.4,
    windSpeedKphMax: 20,
    windGustKphMax: 32,
    uvIndexMax: 6,
    usAqiMax: 100,
  },
};

export const plannerDimensions = [
  'temperature',
  'feels-like',
  'humidity',
  'rain',
  'precipitation',
  'wind',
  'uv',
  'aqi',
  'conditions',
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
  coveragePercent: number;
  missingDimensions: readonly PlannerDimension[];
  factors: readonly PlannerFactor[];
}

export interface PlannerResult {
  activity: PlannerActivity;
  score: number;
  coveragePercent: number;
  missingDimensions: readonly PlannerDimension[];
  rankedWindows: readonly PlannerTimeWindow[];
  factors: readonly PlannerFactor[];
}

export const supportedPlannerActivities = plannerActivityKinds;
export type SupportedPlannerActivity = PlannerActivityKind;

export type PlannerOptions = {
  customThresholds?: PlannerThresholds;
  aqiHours?: readonly Pick<AirQualityHour, 'time' | 'usAqi'>[];
};

const plannerDimensionWeights: Record<PlannerDimension, number> = {
  temperature: 1.1,
  'feels-like': 1,
  humidity: 0.8,
  rain: 1.4,
  precipitation: 0.8,
  wind: 1.1,
  uv: 0.8,
  aqi: 1.2,
  conditions: 1.2,
};
const totalPlannerWeight = plannerDimensions.reduce(
  (sum, dimension) => sum + plannerDimensionWeights[dimension],
  0,
);

function boundedScore(value: number) {
  return Math.round(Math.max(0, Math.min(100, value)));
}

function scoreRange(value: number, minimum: number, maximum: number, penaltyPerDegree = 9) {
  const distance = value < minimum ? minimum - value : value > maximum ? value - maximum : 0;
  return { score: boundedScore(100 - distance * penaltyPerDegree), favorable: distance === 0 };
}

function scoreMaximum(value: number, maximum: number, penaltyPerUnit: number) {
  const excess = Math.max(0, value - maximum);
  return { score: boundedScore(100 - excess * penaltyPerUnit), favorable: excess === 0 };
}

function finiteValue(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function scoreActivityHour(
  hour: HourlyForecast,
  thresholds: PlannerThresholds,
  aqiByHour: ReadonlyMap<number, number | null>,
): PlannerTimeWindow {
  const checks: Array<{
    dimension: PlannerDimension;
    score: number;
    favorable: boolean;
    explanation: string;
  }> = [];
  const addCheck = (
    dimension: PlannerDimension,
    value: number,
    maximum: number,
    penaltyPerUnit: number,
    explanation: (favorable: boolean) => string,
  ) => {
    const result = scoreMaximum(value, maximum, penaltyPerUnit);
    checks.push({
      dimension,
      ...result,
      explanation: explanation(result.favorable),
    });
  };

  const temperature = scoreRange(
    hour.temperatureC,
    thresholds.temperatureMinC,
    thresholds.temperatureMaxC,
  );
  checks.push({
    dimension: 'temperature',
    ...temperature,
    explanation: temperature.favorable
      ? "Temperature is within this profile's preferred range."
      : "Temperature is outside this profile's preferred range.",
  });

  if (finiteValue(hour.apparentTemperatureC)) {
    const feelsLike = scoreRange(
      hour.apparentTemperatureC,
      thresholds.feelsLikeMinC,
      thresholds.feelsLikeMaxC,
    );
    checks.push({
      dimension: 'feels-like',
      ...feelsLike,
      explanation: feelsLike.favorable
        ? 'Feels-like temperature is within the profile range.'
        : 'Feels-like temperature is outside the profile range.',
    });
  }

  if (finiteValue(hour.humidityPercent)) {
    addCheck('humidity', hour.humidityPercent, thresholds.humidityMaxPercent, 1.5, (favorable) =>
      favorable
        ? `Humidity ${Math.round(hour.humidityPercent!)}% is within the profile limit.`
        : `Humidity ${Math.round(hour.humidityPercent!)}% is above the profile limit.`,
    );
  }

  const rainProbability = scoreMaximum(
    hour.precipitationProbability,
    thresholds.rainProbabilityMax,
    1.5,
  );
  checks.push({
    dimension: 'rain',
    score: rainProbability.score,
    favorable: rainProbability.favorable,
    explanation: rainProbability.favorable
      ? `Rain probability is within this profile's ${thresholds.rainProbabilityMax}% limit.`
      : `Rain probability exceeds this profile's ${thresholds.rainProbabilityMax}% limit.`,
  });

  if (finiteValue(hour.precipitationMm)) {
    const precipitation = scoreMaximum(hour.precipitationMm, thresholds.precipitationMmMax, 30);
    checks.push({
      dimension: 'precipitation',
      ...precipitation,
      explanation: precipitation.favorable
        ? 'Expected hourly precipitation is within this profile’s limit.'
        : 'Expected hourly precipitation is above this profile’s limit.',
    });
  }

  const windScore = [
    finiteValue(hour.windSpeedKph)
      ? scoreMaximum(hour.windSpeedKph, thresholds.windSpeedKphMax, 2.5)
      : undefined,
    finiteValue(hour.windGustKph)
      ? scoreMaximum(hour.windGustKph, thresholds.windGustKphMax, 2.5)
      : undefined,
  ].filter((result) => result !== undefined);
  if (windScore.length > 0) {
    const favorable = windScore.every((result) => result.favorable);
    checks.push({
      dimension: 'wind',
      score: Math.min(...windScore.map((result) => result.score)),
      favorable,
      explanation: favorable
        ? 'Wind and any available gusts are within the profile limits.'
        : 'Wind or gusts exceed this profile’s preferred limit.',
    });
  }

  if (finiteValue(hour.uvIndex)) {
    addCheck('uv', hour.uvIndex, thresholds.uvIndexMax, 12, (favorable) =>
      favorable
        ? `UV index ${hour.uvIndex!.toFixed(1)} is within the profile limit.`
        : `UV index ${hour.uvIndex!.toFixed(1)} is above the profile limit.`,
    );
  }

  const aqi = aqiByHour.get(Math.floor(Date.parse(hour.time) / 3_600_000));
  if (finiteValue(aqi)) {
    addCheck('aqi', aqi, thresholds.usAqiMax, 0.6, (favorable) =>
      favorable
        ? `Modeled U.S. AQI ${Math.round(aqi)} is within the profile limit.`
        : `Modeled U.S. AQI ${Math.round(aqi)} is above the profile limit.`,
    );
  }

  const conditionScore: Record<HourlyForecast['condition'], number> = {
    clear: 100,
    'partly-cloudy': 92,
    cloudy: 82,
    rain: 50,
    snow: 20,
    thunderstorm: 0,
  };
  const conditionValue = conditionScore[hour.condition];
  checks.push({
    dimension: 'conditions',
    score: conditionValue,
    favorable: conditionValue >= 70,
    explanation:
      hour.condition === 'thunderstorm' || hour.condition === 'snow'
        ? `${hour.condition === 'snow' ? 'Snow' : 'Thunderstorm'} conditions reduce this outdoor suitability estimate.`
        : `Forecast conditions: ${hour.condition.replace('-', ' ')}.`,
  });

  const availableWeight = checks.reduce(
    (sum, check) => sum + plannerDimensionWeights[check.dimension],
    0,
  );
  const weightedScore = checks.reduce(
    (sum, check) => sum + check.score * plannerDimensionWeights[check.dimension],
    0,
  );
  const rawScore = availableWeight > 0 ? weightedScore / availableWeight : 50;
  const coveragePercent = boundedScore((availableWeight / totalPlannerWeight) * 100);
  const missingDimensions = plannerDimensions.filter(
    (dimension) => !checks.some((check) => check.dimension === dimension),
  );
  const score = boundedScore(50 + ((rawScore - 50) * coveragePercent) / 100);
  const factors: PlannerFactor[] = checks.map((check) => ({
    dimension: check.dimension,
    impact: check.favorable ? 'positive' : 'negative',
    explanation: check.explanation,
  }));

  return {
    startsAt: hour.time,
    endsAt: new Date(Date.parse(hour.time) + 60 * 60_000).toISOString(),
    score,
    coveragePercent,
    missingDimensions,
    factors,
  };
}

export function planActivity(
  activityInput: PlannerActivity | PlannerActivityKind,
  hourly: readonly HourlyForecast[],
  options: PlannerOptions = {},
): PlannerResult {
  const activity: PlannerActivity =
    typeof activityInput === 'string' ? { kind: activityInput } : activityInput;
  const thresholds =
    activity.kind === 'custom'
      ? (options.customThresholds ?? defaultCustomPlannerThresholds)
      : plannerActivityProfiles[activity.kind];
  const aqiByHour = new Map<number, number | null>();
  for (const point of options.aqiHours ?? []) {
    const timestamp = Date.parse(point.time);
    if (Number.isFinite(timestamp)) aqiByHour.set(Math.floor(timestamp / 3_600_000), point.usAqi);
  }
  const rankedWindows = hourly
    .map((hour) => scoreActivityHour(hour, thresholds, aqiByHour))
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.coveragePercent - left.coveragePercent ||
        Date.parse(left.startsAt) - Date.parse(right.startsAt),
    )
    .slice(0, 3);
  const best = rankedWindows[0];
  const resultActivity: PlannerActivity =
    activity.kind === 'custom'
      ? { kind: 'custom', name: activity.name.trim().slice(0, 60) || 'Custom activity' }
      : { kind: activity.kind };
  return {
    activity: resultActivity,
    score: best?.score ?? 50,
    coveragePercent: best?.coveragePercent ?? 0,
    missingDimensions: best?.missingDimensions ?? plannerDimensions,
    rankedWindows,
    factors: best?.factors ?? [],
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

export type InAppAlertStatus =
  'disabled' | 'outside-schedule' | 'triggered' | 'monitoring' | 'unsupported';

export type InAppAlertWeather = {
  current: Pick<
    CurrentWeather,
    'temperatureC' | 'apparentTemperatureC' | 'windSpeedKph' | 'condition'
  >;
  hourly: readonly Pick<HourlyForecast, 'precipitationProbability' | 'condition'>[];
  timezone: string;
};

function inAppConditionMatches(
  condition: AlertCondition,
  weather: InAppAlertWeather,
): boolean | undefined {
  if ('expected' in condition) {
    const occurred = (() => {
      switch (condition.metric) {
        case 'thunderstorm':
          return (
            weather.current.condition === 'thunderstorm' ||
            weather.hourly.some((hour) => hour.condition === 'thunderstorm')
          );
        case 'freeze-risk':
          return weather.current.temperatureC <= 0 || weather.current.apparentTemperatureC <= 0;
        case 'extreme-heat':
          return weather.current.temperatureC >= 35;
        case 'provider-severe-weather-alert':
          return undefined;
      }
    })();
    return occurred === condition.expected;
  }

  let value: number | undefined;
  switch (condition.metric) {
    case 'temperature':
      value = weather.current.temperatureC;
      break;
    case 'feels-like':
      value = weather.current.apparentTemperatureC;
      break;
    case 'rain-probability':
      value = weather.hourly.length
        ? Math.max(...weather.hourly.map((hour) => hour.precipitationProbability))
        : undefined;
      break;
    case 'wind':
      value = weather.current.windSpeedKph;
      break;
    default:
      return undefined;
  }
  if (value === undefined) return undefined;
  return condition.comparison === 'above' ? value > condition.value : value < condition.value;
}

export function evaluateInAppAlertStatus(
  rule: Pick<AlertRule, 'conditions' | 'enabled' | 'schedule'>,
  weather: InAppAlertWeather,
  now = new Date(),
): InAppAlertStatus {
  if (!rule.enabled) return 'disabled';
  const weekday = new Intl.DateTimeFormat('en', {
    weekday: 'long',
    timeZone: weather.timezone,
  })
    .format(now)
    .toLowerCase() as Weekday;
  if (!rule.schedule.weekdays.includes(weekday)) return 'outside-schedule';
  const matches = rule.conditions.map((condition) => inAppConditionMatches(condition, weather));
  if (matches.some((match) => match === undefined)) return 'unsupported';
  return matches.every((match) => match) ? 'triggered' : 'monitoring';
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
