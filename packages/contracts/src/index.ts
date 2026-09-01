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

export const weatherConditionSchema = z.enum([
  'clear',
  'partly-cloudy',
  'cloudy',
  'rain',
  'thunderstorm',
  'snow',
]);
export type WeatherCondition = z.infer<typeof weatherConditionSchema>;

export const currentWeatherSchema = z.object({
  observedAt: z.string().datetime(),
  temperatureC: z.number(),
  apparentTemperatureC: z.number(),
  humidityPercent: z.number().min(0).max(100),
  windSpeedKph: z.number().nonnegative(),
  pressureHpa: z.number().positive(),
  condition: weatherConditionSchema,
});
export type CurrentWeather = z.infer<typeof currentWeatherSchema>;

export const hourlyForecastSchema = z.object({
  time: z.string().datetime(),
  temperatureC: z.number(),
  precipitationProbability: z.number().min(0).max(100),
  condition: weatherConditionSchema,
});
export type HourlyForecast = z.infer<typeof hourlyForecastSchema>;

export const dailyForecastSchema = z.object({
  date: z.string().date(),
  highC: z.number(),
  lowC: z.number(),
  precipitationProbability: z.number().min(0).max(100),
  condition: weatherConditionSchema,
});
export type DailyForecast = z.infer<typeof dailyForecastSchema>;

export const dashboardSchema = z.object({
  location: locationSchema,
  current: currentWeatherSchema,
  hourly: z.array(hourlyForecastSchema).min(1),
  daily: z.array(dailyForecastSchema).min(1),
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
