import {
  airQualitySchema,
  dashboardSchema,
  type AirQuality,
  type AirQualityInput,
  type AirQualityProvider,
  type Dashboard,
  type LocationInput,
  type LocationSearchProvider,
  type LocationSearchResult,
  type WeatherCondition,
  type WeatherProvider,
} from '@atmos/contracts';

const openMeteoBaseUrl = 'https://api.open-meteo.com/v1/forecast';
const openMeteoAirQualityBaseUrl = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const openMeteoGeocodingBaseUrl = 'https://geocoding-api.open-meteo.com/v1/search';
const airQualityVariables = [
  'us_aqi',
  'european_aqi',
  'pm2_5',
  'pm10',
  'carbon_monoxide',
  'nitrogen_dioxide',
  'sulphur_dioxide',
  'ozone',
] as const;
export const openMeteoAqiTimelineCallUnits = 2;

const currentVariables = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'surface_pressure',
  'wind_speed_10m',
  'weather_code',
  'wind_direction_10m',
  'wind_gusts_10m',
  'cloud_cover',
  'precipitation',
  'rain',
  'snowfall',
  'is_day',
] as const;
const hourlyVariables = [
  'temperature_2m',
  'precipitation_probability',
  'weather_code',
  'apparent_temperature',
  'relative_humidity_2m',
  'surface_pressure',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'cloud_cover',
  'precipitation',
  'rain',
  'snowfall',
  'visibility',
  'uv_index',
  'is_day',
] as const;
const dailyVariables = [
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_probability_max',
  'weather_code',
  'sunrise',
  'sunset',
  'daylight_duration',
  'precipitation_sum',
  'rain_sum',
  'snowfall_sum',
  'uv_index_max',
  'wind_speed_10m_max',
  'wind_gusts_10m_max',
] as const;
export const openMeteoForecastDays = 16;
// Conservatively count duplicates across temporal groups too. Provider calls are
// weighted above 10 variables or 14 days; this is a per-isolate estimate, not a
// globally enforced allowance (https://open-meteo.com/en/pricing).
export const openMeteoDashboardCallUnits = Math.ceil(
  ((currentVariables.length + hourlyVariables.length + dailyVariables.length) / 10) *
    (openMeteoForecastDays / 14),
);

export const openMeteoAttribution = {
  name: 'Open-Meteo',
  url: 'https://open-meteo.com/',
  license: 'CC BY 4.0',
} as const;

export interface OpenMeteoQuotaLimits {
  minute: number;
  hour: number;
  day: number;
  month: number;
}

export const openMeteoQuotaLimits: OpenMeteoQuotaLimits = {
  minute: 600,
  hour: 5_000,
  day: 10_000,
  month: 300_000,
};

export type OpenMeteoQuotaWindow = keyof OpenMeteoQuotaLimits;

const quotaWindowDurations: Record<OpenMeteoQuotaWindow, number> = {
  minute: 60_000,
  hour: 60 * 60_000,
  day: 24 * 60 * 60_000,
  month: 0,
};

export interface OpenMeteoUsageSnapshot {
  requests: Record<OpenMeteoQuotaWindow, number>;
  warnings: readonly OpenMeteoQuotaWindow[];
}

export class OpenMeteoQuotaError extends Error {
  constructor(readonly window: OpenMeteoQuotaWindow) {
    super(`Open-Meteo ${window} quota exceeded`);
  }
}

export class OpenMeteoUsageGuard {
  private requestTimestamps: number[] = [];

  constructor(
    private readonly limits: OpenMeteoQuotaLimits = openMeteoQuotaLimits,
    private readonly warningRatio = 0.7,
  ) {}

  reserve(now = Date.now(), callUnits = 1): OpenMeteoUsageSnapshot {
    if (!Number.isInteger(callUnits) || callUnits < 1 || callUnits > 100) {
      throw new Error('Invalid provider call weight');
    }
    this.prune(now);
    const nextTimestamps = [...this.requestTimestamps, ...Array<number>(callUnits).fill(now)];
    const requests = this.countRequests(nextTimestamps, now);

    for (const window of Object.keys(this.limits) as OpenMeteoQuotaWindow[]) {
      if (requests[window] > this.limits[window]) {
        throw new OpenMeteoQuotaError(window);
      }
    }

    this.requestTimestamps = nextTimestamps;
    return this.createSnapshot(requests);
  }

  snapshot(now = Date.now()): OpenMeteoUsageSnapshot {
    this.prune(now);
    const requests = this.countRequests(this.requestTimestamps, now);
    return this.createSnapshot(requests);
  }

  private createSnapshot(requests: Record<OpenMeteoQuotaWindow, number>): OpenMeteoUsageSnapshot {
    const warnings = (Object.keys(this.limits) as OpenMeteoQuotaWindow[]).filter(
      (window) => requests[window] >= this.limits[window] * this.warningRatio,
    );

    return { requests, warnings };
  }

  private prune(now: number) {
    this.requestTimestamps = this.requestTimestamps.filter((timestamp) =>
      this.isCurrentMonth(timestamp, now),
    );
  }

  private countRequests(timestamps: readonly number[], now: number) {
    return Object.fromEntries(
      (Object.keys(this.limits) as OpenMeteoQuotaWindow[]).map((window) => [
        window,
        timestamps.filter((timestamp) =>
          window === 'month'
            ? this.isCurrentMonth(timestamp, now)
            : timestamp > now - quotaWindowDurations[window],
        ).length,
      ]),
    ) as Record<OpenMeteoQuotaWindow, number>;
  }

  private isCurrentMonth(timestamp: number, now: number) {
    const requestDate = new Date(timestamp);
    const currentDate = new Date(now);
    return (
      requestDate.getUTCFullYear() === currentDate.getUTCFullYear() &&
      requestDate.getUTCMonth() === currentDate.getUTCMonth()
    );
  }
}

type OpenMeteoResponse = {
  timezone: string;
  current: Partial<Record<(typeof currentVariables)[number], number | null>> & {
    time: number;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    surface_pressure: number;
    wind_speed_10m: number;
    weather_code: number;
  };
  hourly: Partial<Record<(typeof hourlyVariables)[number], Array<number | null>>> & {
    time: number[];
    temperature_2m: number[];
    precipitation_probability: Array<number | null>;
    weather_code: number[];
  };
  daily: Partial<Record<(typeof dailyVariables)[number], Array<number | null>>> & {
    time: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: Array<number | null>;
    weather_code: number[];
  };
};

type OpenMeteoGeocodingResponse = {
  results?: Array<{
    id: number;
    name: string;
    latitude: number;
    longitude: number;
    timezone: string;
    country: string;
  }>;
};

type OpenMeteoAirQualityResponse = {
  hourly?: unknown;
  current: {
    time: number;
    us_aqi: number | null;
    european_aqi: number | null;
    pm2_5: number | null;
    pm10: number | null;
    carbon_monoxide: number | null;
    nitrogen_dioxide: number | null;
    sulphur_dioxide: number | null;
    ozone: number | null;
  };
};

function conditionFromCode(code: number): WeatherCondition {
  if (code === 0) return 'clear';
  if ([1, 2].includes(code)) return 'partly-cloudy';
  if (code === 3 || code === 45 || code === 48) return 'cloudy';
  if ([95, 96, 99].includes(code)) return 'thunderstorm';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  return 'rain';
}

function toIso(time: number): string {
  return new Date(time * 1_000).toISOString();
}

function localDateFormatter(timezone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function localDate(time: number, formatter: Intl.DateTimeFormat): string {
  let year = '';
  let month = '';
  let day = '';
  for (const part of formatter.formatToParts(new Date(time * 1_000))) {
    if (part.type === 'year') year = part.value;
    else if (part.type === 'month') month = part.value;
    else if (part.type === 'day') day = part.value;
  }
  return `${year}-${month}-${day}`;
}

function forecastDate(firstDate: string, index: number) {
  // Daily Unix values are spaced at 86400 seconds using the run's initial
  // offset. Reapplying DST to every entry duplicates/skips calendar dates.
  // Anchor the first local date, then advance calendar days (not local instants).
  const date = new Date(`${firstDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + index);
  return date.toISOString().slice(0, 10);
}

function dailyHourlyMeans(
  times: readonly number[],
  fromIndex: number,
  formatter: Intl.DateTimeFormat,
  series: Readonly<Record<string, readonly (number | null)[] | undefined>>,
) {
  const samples = new Map<
    string,
    Record<string, { sum: number; count: number; maximum: number }>
  >();
  const seriesEntries = Object.entries(series);
  for (let index = fromIndex; index < times.length; index++) {
    const date = localDate(times[index]!, formatter);
    let values = samples.get(date);
    if (!values) {
      values = {};
      samples.set(date, values);
    }
    for (const [name, array] of seriesEntries) {
      const value = array?.[index];
      if (value === null || value === undefined) continue;
      const aggregate = values[name] ?? { sum: 0, count: 0, maximum: -Infinity };
      aggregate.sum += value;
      aggregate.count++;
      aggregate.maximum = Math.max(aggregate.maximum, value);
      values[name] = aggregate;
    }
  }
  return samples;
}

function aggregateMean(value: { sum: number; count: number; maximum: number } | undefined) {
  return value?.count ? value.sum / value.count : null;
}

function isNumberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isFinite(item))
  );
}

function isOpenMeteoResponse(value: unknown): value is OpenMeteoResponse {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<OpenMeteoResponse>;
  const current = data.current;
  const hourly = data.hourly;
  const daily = data.daily;
  return (
    typeof data.timezone === 'string' &&
    typeof current?.time === 'number' &&
    [
      current.temperature_2m,
      current.apparent_temperature,
      current.relative_humidity_2m,
      current.surface_pressure,
      current.wind_speed_10m,
      current.weather_code,
    ].every((item) => typeof item === 'number' && Number.isFinite(item)) &&
    isNumberArray(hourly?.time) &&
    hourly.time.length > 0 &&
    hourly.time.length <= 400 &&
    isNumberArray(hourly.temperature_2m) &&
    validOptionalSeries(hourly.precipitation_probability, hourly.time.length) &&
    Array.isArray(hourly.precipitation_probability) &&
    isNumberArray(hourly.weather_code) &&
    hourly.time.length === hourly.temperature_2m.length &&
    hourly.time.length === hourly.precipitation_probability.length &&
    hourly.time.length === hourly.weather_code.length &&
    isNumberArray(daily?.time) &&
    daily.time.length > 0 &&
    daily.time.length <= openMeteoForecastDays &&
    isNumberArray(daily.temperature_2m_max) &&
    isNumberArray(daily.temperature_2m_min) &&
    validOptionalSeries(daily.precipitation_probability_max, daily.time.length) &&
    Array.isArray(daily.precipitation_probability_max) &&
    isNumberArray(daily.weather_code) &&
    daily.time.length === daily.temperature_2m_max.length &&
    daily.time.length === daily.temperature_2m_min.length &&
    daily.time.length === daily.precipitation_probability_max.length &&
    daily.time.length === daily.weather_code.length &&
    currentVariables.every(
      (key) => current[key] === undefined || isAirQualityValue(current[key]),
    ) &&
    hourlyVariables.every((key) => validOptionalSeries(hourly[key], hourly.time.length)) &&
    dailyVariables.every((key) => validOptionalSeries(daily[key], daily.time.length))
  );
}

function validOptionalSeries(value: unknown, length: number) {
  return (
    value === undefined ||
    (Array.isArray(value) && value.length === length && value.every(isAirQualityValue))
  );
}

function sunlightTime(value: number | null | undefined) {
  // Polar-night/day feeds can omit events or use zero; never render 1970 as sunrise.
  return typeof value === 'number' && value > 0 ? toIso(value) : null;
}

function dayFlag(value: number | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value !== 0 && value !== 1) throw new Error('Invalid provider day flag');
  return value === 1;
}

function isAirQualityValue(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isOpenMeteoAirQualityResponse(value: unknown): value is OpenMeteoAirQualityResponse {
  if (!value || typeof value !== 'object') return false;
  const current = (value as Partial<OpenMeteoAirQualityResponse>).current;
  return (
    typeof current?.time === 'number' &&
    Number.isFinite(current.time) &&
    [
      current.us_aqi,
      current.european_aqi,
      current.pm2_5,
      current.pm10,
      current.carbon_monoxide,
      current.nitrogen_dioxide,
      current.sulphur_dioxide,
      current.ozone,
    ].every(isAirQualityValue)
  );
}

function normalizeAirQualityTimeline(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('Air-quality timeline is unavailable');
  const series = value as Record<string, unknown>;
  const times = series.time;
  if (
    !isNumberArray(times) ||
    !times.length ||
    times.length > 288 ||
    !airQualityVariables.every(
      (key) =>
        Array.isArray(series[key]) &&
        series[key].length === times.length &&
        series[key].every(isAirQualityValue),
    )
  ) {
    throw new Error('Air-quality timeline has an invalid shape');
  }
  const values = series as Record<(typeof airQualityVariables)[number], Array<number | null>>;
  return {
    kind: 'model' as const,
    requestedPastDays: 7 as const,
    requestedForecastDays: 5 as const,
    hours: times.map((time, index) => ({
      time: toIso(time),
      usAqi: values.us_aqi[index],
      europeanAqi: values.european_aqi[index],
      pollutants: {
        pm25: values.pm2_5[index],
        pm10: values.pm10[index],
        carbonMonoxide: values.carbon_monoxide[index],
        nitrogenDioxide: values.nitrogen_dioxide[index],
        sulphurDioxide: values.sulphur_dioxide[index],
        ozone: values.ozone[index],
      },
    })),
  };
}

export class OpenMeteoProvider
  implements WeatherProvider, LocationSearchProvider, AirQualityProvider
{
  constructor(
    private readonly fetcher: typeof fetch = fetch.bind(globalThis),
    private readonly usageGuard = new OpenMeteoUsageGuard(),
  ) {}

  async getDashboard(input: LocationInput): Promise<Dashboard> {
    this.usageGuard.reserve(Date.now(), openMeteoDashboardCallUnits);
    const url = new URL(openMeteoBaseUrl);
    url.searchParams.set('latitude', String(input.latitude));
    url.searchParams.set('longitude', String(input.longitude));
    url.searchParams.set('timezone', input.timezone);
    url.searchParams.set('timeformat', 'unixtime');
    url.searchParams.set('current', currentVariables.join(','));
    url.searchParams.set('hourly', hourlyVariables.join(','));
    url.searchParams.set('daily', dailyVariables.join(','));
    url.searchParams.set('forecast_days', String(openMeteoForecastDays));
    url.searchParams.set('temperature_unit', 'celsius');
    url.searchParams.set('wind_speed_unit', 'kmh');
    url.searchParams.set('precipitation_unit', 'mm');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let response: Response;
    try {
      response = await this.fetcher(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      throw new Error(`Open-Meteo request failed with ${response.status}`);
    }

    const data: unknown = await response.json();
    if (!isOpenMeteoResponse(data)) throw new Error('Open-Meteo response has an invalid shape');
    const firstForecastHour = data.hourly.time.findIndex((time) => time >= data.current.time);
    if (firstForecastHour < 0) throw new Error('Open-Meteo response has no future hourly forecast');
    const locationName = `${input.latitude.toFixed(2)}, ${input.longitude.toFixed(2)}`;
    const currentHour = data.hourly.time.findIndex(
      (time) => time <= data.current.time && data.current.time < time + 3600,
    );
    const currentHourlyEstimates =
      currentHour < 0
        ? undefined
        : {
            time: toIso(data.hourly.time[currentHour]!),
            visibilityM: data.hourly.visibility?.[currentHour],
            uvIndex: data.hourly.uv_index?.[currentHour],
          };
    // Reuse one formatter across the hourly samples; constructing an Intl formatter inside
    // the per-hour loop made extended-forecast cache misses needlessly CPU-heavy on Workers.
    const dateFormatter = localDateFormatter(data.timezone);
    const hourlyByLocalDate = dailyHourlyMeans(data.hourly.time, firstForecastHour, dateFormatter, {
      apparentTemperature: data.hourly.apparent_temperature,
      humidity: data.hourly.relative_humidity_2m,
      pressure: data.hourly.surface_pressure,
      clouds: data.hourly.cloud_cover,
      visibility: data.hourly.visibility,
    });
    const firstForecastDate = localDate(data.daily.time[0]!, dateFormatter);
    const days = Array.from(data.daily.time.keys(), (index) => {
      const date = forecastDate(firstForecastDate, index);
      const aggregate = hourlyByLocalDate.get(date);
      return {
        date,
        highC: data.daily.temperature_2m_max[index],
        lowC: data.daily.temperature_2m_min[index],
        precipitationProbability: data.daily.precipitation_probability_max[index],
        condition: conditionFromCode(data.daily.weather_code[index]!),
        sunrise:
          data.daily.sunrise === undefined ? undefined : sunlightTime(data.daily.sunrise[index]),
        sunset:
          data.daily.sunset === undefined ? undefined : sunlightTime(data.daily.sunset[index]),
        daylightSeconds: data.daily.daylight_duration?.[index],
        precipitationMm: data.daily.precipitation_sum?.[index],
        rainMm: data.daily.rain_sum?.[index],
        snowfallCm: data.daily.snowfall_sum?.[index],
        uvIndexMax: data.daily.uv_index_max?.[index],
        windSpeedMaxKph: data.daily.wind_speed_10m_max?.[index],
        windGustMaxKph: data.daily.wind_gusts_10m_max?.[index],
        apparentTemperatureMaxC: aggregate?.apparentTemperature?.maximum ?? null,
        humidityMeanPercent: aggregateMean(aggregate?.humidity),
        pressureMeanHpa: aggregateMean(aggregate?.pressure),
        cloudCoverMeanPercent: aggregateMean(aggregate?.clouds),
        visibilityMeanM: aggregateMean(aggregate?.visibility),
      };
    });
    const dashboard = {
      location: {
        id: `${input.latitude}:${input.longitude}`,
        name: locationName,
        country: 'Selected location',
        latitude: input.latitude,
        longitude: input.longitude,
        timezone: data.timezone,
      },
      current: {
        observedAt: toIso(data.current.time),
        temperatureC: data.current.temperature_2m,
        apparentTemperatureC: data.current.apparent_temperature,
        humidityPercent: data.current.relative_humidity_2m,
        windSpeedKph: data.current.wind_speed_10m,
        pressureHpa: data.current.surface_pressure,
        condition: conditionFromCode(data.current.weather_code),
        windDirectionDegrees: data.current.wind_direction_10m,
        windGustKph: data.current.wind_gusts_10m,
        cloudCoverPercent: data.current.cloud_cover,
        precipitationMm: data.current.precipitation,
        rainMm: data.current.rain,
        snowfallCm: data.current.snowfall,
        isDay: dayFlag(data.current.is_day),
        hourlyEstimates: currentHourlyEstimates,
      },
      hourly: data.hourly.time
        .slice(firstForecastHour, firstForecastHour + 12)
        .map((time, index) => {
          const sourceIndex = firstForecastHour + index;
          return {
            time: toIso(time),
            temperatureC: data.hourly.temperature_2m[sourceIndex],
            precipitationProbability: data.hourly.precipitation_probability[sourceIndex],
            condition: conditionFromCode(data.hourly.weather_code[sourceIndex]!),
            apparentTemperatureC: data.hourly.apparent_temperature?.[sourceIndex],
            humidityPercent: data.hourly.relative_humidity_2m?.[sourceIndex],
            pressureHpa: data.hourly.surface_pressure?.[sourceIndex],
            windSpeedKph: data.hourly.wind_speed_10m?.[sourceIndex],
            windDirectionDegrees: data.hourly.wind_direction_10m?.[sourceIndex],
            windGustKph: data.hourly.wind_gusts_10m?.[sourceIndex],
            cloudCoverPercent: data.hourly.cloud_cover?.[sourceIndex],
            precipitationMm: data.hourly.precipitation?.[sourceIndex],
            rainMm: data.hourly.rain?.[sourceIndex],
            snowfallCm: data.hourly.snowfall?.[sourceIndex],
            visibilityM: data.hourly.visibility?.[sourceIndex],
            uvIndex: data.hourly.uv_index?.[sourceIndex],
            isDay: dayFlag(data.hourly.is_day?.[sourceIndex]),
          };
        }),
      daily: days.slice(0, 7),
      extendedDaily: days,
      meta: {
        provider: 'open-meteo',
        cached: false,
        stale: false,
        updatedAt: new Date().toISOString(),
      },
    };

    return dashboardSchema.parse(dashboard);
  }

  async getAirQuality(input: AirQualityInput): Promise<AirQuality> {
    this.usageGuard.reserve(Date.now(), input.includeTimeline ? openMeteoAqiTimelineCallUnits : 1);
    const url = new URL(openMeteoAirQualityBaseUrl);
    url.searchParams.set('latitude', String(input.latitude));
    url.searchParams.set('longitude', String(input.longitude));
    url.searchParams.set('current', airQualityVariables.join(','));
    url.searchParams.set('timeformat', 'unixtime');
    if (input.includeTimeline) {
      url.searchParams.set('hourly', airQualityVariables.join(','));
      url.searchParams.set('past_days', '7');
      url.searchParams.set('forecast_days', '5');
      url.searchParams.set('timezone', 'UTC');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let response: Response;
    try {
      response = await this.fetcher(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      throw new Error(`Open-Meteo air-quality request failed with ${response.status}`);
    }

    const data: unknown = await response.json();
    if (!isOpenMeteoAirQualityResponse(data)) {
      throw new Error('Open-Meteo air-quality response has an invalid shape');
    }
    return airQualitySchema.parse({
      observedAt: toIso(data.current.time),
      usAqi: data.current.us_aqi,
      europeanAqi: data.current.european_aqi,
      timeline: input.includeTimeline ? normalizeAirQualityTimeline(data.hourly) : undefined,
      pollutants: {
        pm25: data.current.pm2_5,
        pm10: data.current.pm10,
        carbonMonoxide: data.current.carbon_monoxide,
        nitrogenDioxide: data.current.nitrogen_dioxide,
        sulphurDioxide: data.current.sulphur_dioxide,
        ozone: data.current.ozone,
      },
      meta: {
        provider: 'open-meteo',
        cached: false,
        stale: false,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  async searchLocations(query: string): Promise<LocationSearchResult[]> {
    this.usageGuard.reserve();
    const url = new URL(openMeteoGeocodingBaseUrl);
    url.searchParams.set('name', query);
    url.searchParams.set('count', '5');
    url.searchParams.set('language', 'en');
    url.searchParams.set('format', 'json');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let response: Response;
    try {
      response = await this.fetcher(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok)
      throw new Error(`Open-Meteo geocoding request failed with ${response.status}`);

    const data = (await response.json()) as OpenMeteoGeocodingResponse;
    if (!Array.isArray(data.results)) return [];
    return data.results
      .filter(
        (result) =>
          typeof result.id === 'number' &&
          typeof result.name === 'string' &&
          typeof result.latitude === 'number' &&
          typeof result.longitude === 'number' &&
          typeof result.timezone === 'string' &&
          typeof result.country === 'string',
      )
      .map((result) => ({
        id: String(result.id),
        name: result.name,
        country: result.country,
        latitude: result.latitude,
        longitude: result.longitude,
        timezone: result.timezone,
      }));
  }
}

export class MockWeatherProvider implements WeatherProvider {
  async getDashboard(input: LocationInput): Promise<Dashboard> {
    void input;
    return dashboardSchema.parse({
      location: {
        id: 'berlin-de',
        name: 'Berlin',
        country: 'Germany',
        latitude: 52.52,
        longitude: 13.405,
        timezone: 'Europe/Berlin',
      },
      current: {
        observedAt: '2026-09-01T10:00:00.000Z',
        temperatureC: 20,
        apparentTemperatureC: 19,
        humidityPercent: 64,
        windSpeedKph: 13,
        pressureHpa: 1017,
        condition: 'partly-cloudy',
      },
      hourly: [
        ['09:00', 17, 'cloudy'],
        ['10:00', 19, 'partly-cloudy'],
        ['11:00', 21, 'partly-cloudy'],
        ['12:00', 23, 'clear'],
        ['13:00', 24, 'clear'],
        ['14:00', 25, 'partly-cloudy'],
        ['15:00', 24, 'rain'],
        ['16:00', 22, 'rain'],
        ['17:00', 21, 'cloudy'],
      ].map(([hour, temperatureC, condition], index) => ({
        time: `2026-09-01T${hour}:00.000Z`,
        temperatureC,
        precipitationProbability: index > 5 ? 40 : 5,
        condition,
      })),
      daily: [
        ['2026-09-02', 22, 15, 'partly-cloudy'],
        ['2026-09-03', 20, 14, 'rain'],
        ['2026-09-04', 25, 16, 'thunderstorm'],
        ['2026-09-05', 23, 14, 'clear'],
        ['2026-09-06', 21, 13, 'cloudy'],
        ['2026-09-07', 19, 12, 'rain'],
        ['2026-09-08', 22, 13, 'partly-cloudy'],
      ].map(([date, highC, lowC, condition]) => ({
        date,
        highC,
        lowC,
        precipitationProbability: condition === 'rain' ? 70 : 10,
        condition,
      })),
      meta: {
        provider: 'mock',
        cached: false,
        stale: false,
        updatedAt: '2026-09-01T10:00:00.000Z',
      },
    });
  }
}
