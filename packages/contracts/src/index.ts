import { z } from 'zod';

export const unitSystemSchema = z.enum(['metric', 'imperial']);
export type UnitSystem = z.infer<typeof unitSystemSchema>;

export const locationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  country: z.string().min(1),
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  timezone: z.string().min(1),
});
export type Location = z.infer<typeof locationSchema>;

export const locationSearchResultSchema = locationSchema;
export type LocationSearchResult = z.infer<typeof locationSearchResultSchema>;

export const weatherRadarFrameSchema = z.object({
  timestamp: z.number().int().positive(),
  path: z.string().regex(/^\/v2\/radar\/[A-Za-z0-9_-]{1,64}$/),
});

export const weatherRadarTimelineSchema = z
  .object({
    generatedAt: z.number().int().positive().nullable(),
    tileHost: z.literal('https://tilecache.rainviewer.com'),
    frames: z.array(weatherRadarFrameSchema).max(13),
  })
  .superRefine(({ frames }, context) => {
    for (let index = 1; index < frames.length; index += 1) {
      const previous = frames[index - 1];
      const current = frames[index];
      if (previous && current && current.timestamp <= previous.timestamp) {
        context.addIssue({
          code: 'custom',
          message: 'Radar frames must be unique and sorted from oldest to newest.',
          path: ['frames', index, 'timestamp'],
        });
      }
    }
  });
export type WeatherRadarTimeline = z.infer<typeof weatherRadarTimelineSchema>;

export const openWeatherMapLayerSchema = z.enum([
  'precipitation_new',
  'clouds_new',
  'pressure_new',
  'wind_new',
  'temp_new',
]);
export type OpenWeatherMapLayer = z.infer<typeof openWeatherMapLayerSchema>;

export const weatherMapConfigurationSchema = z.object({
  openWeatherAvailable: z.boolean(),
});
export type WeatherMapConfiguration = z.infer<typeof weatherMapConfigurationSchema>;

export const savedLocationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});
export type SavedLocation = z.infer<typeof savedLocationSchema>;

export const savedLocationsResponseSchema = z.object({
  locations: z.array(savedLocationSchema),
});

export const savedLocationResponseSchema = z.object({
  location: savedLocationSchema,
});

export interface LocationSearchProvider {
  searchLocations(query: string): Promise<LocationSearchResult[]>;
}

export interface AirQualityProvider {
  getAirQuality(input: AirQualityInput): Promise<AirQuality>;
}

export const weatherConditionSchema = z.enum([
  'clear',
  'partly-cloudy',
  'cloudy',
  'rain',
  'thunderstorm',
  'snow',
]);
export type WeatherCondition = z.infer<typeof weatherConditionSchema>;

export const alertThresholdMetricSchema = z.enum([
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
]);

export const alertOccurrenceMetricSchema = z.enum([
  'thunderstorm',
  'freeze-risk',
  'extreme-heat',
  'provider-severe-weather-alert',
]);

const alertThresholdRanges: Record<
  (typeof alertThresholdMetricSchema.options)[number],
  [number, number]
> = {
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

const alertThresholdConditionSchema = z
  .object({
    metric: alertThresholdMetricSchema,
    comparison: z.enum(['above', 'below']),
    value: z.number(),
  })
  .superRefine((condition, context) => {
    const [minimum, maximum] = alertThresholdRanges[condition.metric];
    if (condition.value < minimum || condition.value > maximum) {
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'Alert threshold is out of range.',
      });
    }
  });

export const alertConditionSchema = z.union([
  alertThresholdConditionSchema,
  z.object({ metric: alertOccurrenceMetricSchema, expected: z.literal(true) }),
]);
export type AlertCondition = z.infer<typeof alertConditionSchema>;

export const alertWeekdaySchema = z.enum([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);

export const alertScheduleSchema = z.object({
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  weekdays: z.array(alertWeekdaySchema).max(7),
  cooldownMinutes: z.number().int().min(1).max(10080),
});

export const alertRuleSchema = z.object({
  id: z.string().uuid(),
  location_id: z.string().min(1).max(120),
  latitude: z.number().gte(-90).lte(90).nullable(),
  longitude: z.number().gte(-180).lte(180).nullable(),
  conditions: z.array(alertConditionSchema).min(1).max(10),
  schedule: alertScheduleSchema,
  notification_channels: z
    .array(z.enum(['in-app', 'email', 'push']))
    .min(1)
    .max(3),
  enabled: z.boolean(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});
export type AlertRuleRecord = z.infer<typeof alertRuleSchema>;

export const alertRulesResponseSchema = z.object({
  rules: z.array(alertRuleSchema),
});

export const alertRuleResponseSchema = z.object({
  rule: alertRuleSchema,
});

export const createAlertRuleRequestSchema = z.object({
  location_id: z.string().min(1).max(120),
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  condition: alertConditionSchema,
});

export const updateAlertRuleRequestSchema = z.object({
  enabled: z.boolean(),
});

export const currentWeatherSchema = z.object({
  observedAt: z.string().datetime(),
  temperatureC: z.number(),
  apparentTemperatureC: z.number(),
  humidityPercent: z.number().min(0).max(100),
  windSpeedKph: z.number().nonnegative(),
  pressureHpa: z.number().positive(),
  condition: weatherConditionSchema,
  windDirectionDegrees: z.number().min(0).max(360).nullable().optional(),
  windGustKph: z.number().nonnegative().nullable().optional(),
  cloudCoverPercent: z.number().min(0).max(100).nullable().optional(),
  precipitationMm: z.number().nonnegative().nullable().optional(),
  rainMm: z.number().nonnegative().nullable().optional(),
  snowfallCm: z.number().nonnegative().nullable().optional(),
  isDay: z.boolean().nullable().optional(),
  // These variables are hourly estimates, not 15-minute current observations.
  hourlyEstimates: z
    .object({
      time: z.string().datetime(),
      visibilityM: z.number().nonnegative().nullable().optional(),
      uvIndex: z.number().nonnegative().nullable().optional(),
    })
    .optional(),
});
export type CurrentWeather = z.infer<typeof currentWeatherSchema>;

const nullablePollutantValue = z.number().nonnegative().nullable();

export const airQualityPollutantsSchema = z.object({
  pm25: nullablePollutantValue,
  pm10: nullablePollutantValue,
  carbonMonoxide: nullablePollutantValue,
  nitrogenDioxide: nullablePollutantValue,
  sulphurDioxide: nullablePollutantValue,
  ozone: nullablePollutantValue,
});

export const airQualityHourSchema = z.object({
  time: z.string().datetime(),
  usAqi: nullablePollutantValue,
  europeanAqi: nullablePollutantValue,
  pollutants: airQualityPollutantsSchema,
});
export type AirQualityHour = z.infer<typeof airQualityHourSchema>;

export const airQualityTimelineSchema = z
  .object({
    kind: z.literal('model'),
    requestedPastDays: z.literal(7),
    requestedForecastDays: z.literal(5),
    hours: z.array(airQualityHourSchema).min(1).max(288),
  })
  .superRefine(({ hours }, context) => {
    for (let index = 1; index < hours.length; index++) {
      if (Date.parse(hours[index]!.time) <= Date.parse(hours[index - 1]!.time)) {
        context.addIssue({
          code: 'custom',
          path: ['hours', index, 'time'],
          message: 'AQI timeline hours must be unique and chronological.',
        });
      }
    }
  });

export const airQualitySchema = z.object({
  observedAt: z.string().datetime(),
  usAqi: z.number().nonnegative().nullable(),
  europeanAqi: z.number().nonnegative().nullable(),
  pollutants: airQualityPollutantsSchema,
  timeline: airQualityTimelineSchema.optional(),
  meta: z.object({
    provider: z.literal('open-meteo'),
    cached: z.boolean(),
    stale: z.boolean(),
    updatedAt: z.string().datetime(),
  }),
});
export type AirQuality = z.infer<typeof airQualitySchema>;

export const airQualityInputSchema = z.object({
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  includeTimeline: z.boolean().optional(),
});
export type AirQualityInput = z.infer<typeof airQualityInputSchema>;

export const weatherSnapshotPayloadSchema = z.object({
  location_name: z.string().min(1).max(80),
  temperature_c: z.number().gte(-150).lte(100),
  apparent_temperature_c: z.number().gte(-150).lte(100),
  humidity_percent: z.number().min(0).max(100),
  wind_speed_kph: z.number().nonnegative().max(500),
  pressure_hpa: z.number().positive().max(1500),
  condition: weatherConditionSchema,
});
export type WeatherSnapshotPayload = z.infer<typeof weatherSnapshotPayloadSchema>;

export const createWeatherSnapshotRequestSchema = z.object({
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  observed_at: z.string().datetime(),
  location_name: z.string().min(1).max(80),
  temperatureC: z.number(),
  apparentTemperatureC: z.number(),
  humidityPercent: z.number().min(0).max(100),
  windSpeedKph: z.number().nonnegative(),
  pressureHpa: z.number().positive(),
  condition: weatherConditionSchema,
});

export const weatherSnapshotSchema = z.object({
  id: z.string().uuid(),
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  observed_at: z.string().datetime({ offset: true }),
  provider: z.string().min(1).max(80),
  payload: weatherSnapshotPayloadSchema,
  created_at: z.string().datetime({ offset: true }),
});
export type WeatherSnapshot = z.infer<typeof weatherSnapshotSchema>;

export const weatherSnapshotsResponseSchema = z.object({
  snapshots: z.array(weatherSnapshotSchema),
});

export const weatherSnapshotResponseSchema = z.object({
  snapshot: weatherSnapshotSchema,
});

export const hourlyForecastSchema = z.object({
  time: z.string().datetime(),
  temperatureC: z.number(),
  precipitationProbability: z.number().min(0).max(100),
  condition: weatherConditionSchema,
  apparentTemperatureC: z.number().nullable().optional(),
  humidityPercent: z.number().min(0).max(100).nullable().optional(),
  pressureHpa: z.number().positive().nullable().optional(),
  windSpeedKph: z.number().nonnegative().nullable().optional(),
  windDirectionDegrees: z.number().min(0).max(360).nullable().optional(),
  windGustKph: z.number().nonnegative().nullable().optional(),
  cloudCoverPercent: z.number().min(0).max(100).nullable().optional(),
  precipitationMm: z.number().nonnegative().nullable().optional(),
  rainMm: z.number().nonnegative().nullable().optional(),
  snowfallCm: z.number().nonnegative().nullable().optional(),
  visibilityM: z.number().nonnegative().nullable().optional(),
  uvIndex: z.number().nonnegative().nullable().optional(),
  isDay: z.boolean().nullable().optional(),
});
export type HourlyForecast = z.infer<typeof hourlyForecastSchema>;

export const dailyForecastSchema = z.object({
  date: z.string().date(),
  highC: z.number(),
  lowC: z.number(),
  precipitationProbability: z.number().min(0).max(100),
  condition: weatherConditionSchema,
  sunrise: z.string().datetime().nullable().optional(),
  sunset: z.string().datetime().nullable().optional(),
  daylightSeconds: z.number().min(0).max(86400).nullable().optional(),
  precipitationMm: z.number().nonnegative().nullable().optional(),
  rainMm: z.number().nonnegative().nullable().optional(),
  snowfallCm: z.number().nonnegative().nullable().optional(),
  uvIndexMax: z.number().nonnegative().nullable().optional(),
  windSpeedMaxKph: z.number().nonnegative().nullable().optional(),
  windGustMaxKph: z.number().nonnegative().nullable().optional(),
});
export type DailyForecast = z.infer<typeof dailyForecastSchema>;

// Long-range model runs can lack rain probability. Preserve the legacy seven-day
// contract and expose this separately for compatible mixed-version rollouts.
export const extendedDailyForecastSchema = dailyForecastSchema.extend({
  precipitationProbability: z.number().min(0).max(100).nullable(),
  apparentTemperatureMaxC: z.number().nullable().optional(),
  humidityMeanPercent: z.number().min(0).max(100).nullable().optional(),
  pressureMeanHpa: z.number().positive().nullable().optional(),
  cloudCoverMeanPercent: z.number().min(0).max(100).nullable().optional(),
  visibilityMeanM: z.number().nonnegative().nullable().optional(),
});
export type ExtendedDailyForecast = z.infer<typeof extendedDailyForecastSchema>;

export const dashboardSchema = z.object({
  location: locationSchema,
  current: currentWeatherSchema,
  hourly: z.array(hourlyForecastSchema).min(1),
  daily: z.array(dailyForecastSchema).min(1),
  extendedDaily: z.array(extendedDailyForecastSchema).min(1).max(16).optional(),
  meta: z.object({
    provider: z.string().min(1),
    cached: z.boolean(),
    stale: z.boolean(),
    updatedAt: z.string().datetime(),
  }),
});
export type Dashboard = z.infer<typeof dashboardSchema>;

export const locationInputSchema = z.object({
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  timezone: z.string().min(1).default('auto'),
  units: unitSystemSchema.default('metric'),
});
export type LocationInput = z.infer<typeof locationInputSchema>;

export interface WeatherProvider {
  getDashboard(input: LocationInput): Promise<Dashboard>;
}
