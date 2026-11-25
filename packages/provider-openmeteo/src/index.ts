import type {
  AirQuality,
  AirQualityInput,
  AirQualityProvider,
  Dashboard,
  LocationInput,
  LocationSearchProvider,
  LocationSearchResult,
  WeatherCondition,
  WeatherProvider,
} from '@atmos/contracts';
import {
  OpenMeteoProviderError,
  OpenMeteoQuotaError,
  OpenMeteoUsageGuard,
  fetchOpenMeteoJson,
  openMeteoFailureClass,
  openMeteoQuotaLimits,
  searchOpenMeteoLocations,
  type OpenMeteoFailureClass,
  type OpenMeteoProviderFailureClass,
  type OpenMeteoQuotaLimits,
  type OpenMeteoQuotaWindow,
  type OpenMeteoUsageSnapshot,
} from './geocoding';

export {
  OpenMeteoProviderError,
  OpenMeteoQuotaError,
  OpenMeteoUsageGuard,
  openMeteoFailureClass,
  openMeteoQuotaLimits,
  type OpenMeteoFailureClass,
  type OpenMeteoProviderFailureClass,
  type OpenMeteoQuotaLimits,
  type OpenMeteoQuotaWindow,
  type OpenMeteoUsageSnapshot,
};

const openMeteoBaseUrl = 'https://api.open-meteo.com/v1/forecast';
const openMeteoAirQualityBaseUrl = 'https://air-quality-api.open-meteo.com/v1/air-quality';
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
    temperature_2m: Array<number | null>;
    precipitation_probability: Array<number | null>;
    weather_code: Array<number | null>;
  };
  daily: Partial<Record<(typeof dailyVariables)[number], Array<number | null>>> & {
    time: number[];
    temperature_2m_max: Array<number | null>;
    temperature_2m_min: Array<number | null>;
    precipitation_probability_max: Array<number | null>;
    weather_code: Array<number | null>;
  };
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
  const date = new Date(time * 1_000);
  if (!Number.isFinite(date.getTime())) throw new OpenMeteoProviderError('invalid_response');
  return date.toISOString();
}

function localDateFormatter(timezone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('en', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    throw new OpenMeteoProviderError('invalid_response');
  }
}

function localDate(time: number, formatter: Intl.DateTimeFormat): string {
  let year = '';
  let month = '';
  let day = '';
  const date = new Date(time * 1_000);
  if (!Number.isFinite(date.getTime())) throw new OpenMeteoProviderError('invalid_response');
  for (const part of formatter.formatToParts(date)) {
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
    Array.isArray(hourly.temperature_2m) &&
    validOptionalSeries(hourly.temperature_2m, hourly.time.length) &&
    Array.isArray(hourly.precipitation_probability) &&
    validOptionalSeries(hourly.precipitation_probability, hourly.time.length) &&
    Array.isArray(hourly.weather_code) &&
    validOptionalSeries(hourly.weather_code, hourly.time.length) &&
    isNumberArray(daily?.time) &&
    daily.time.length > 0 &&
    daily.time.length <= openMeteoForecastDays &&
    Array.isArray(daily.temperature_2m_max) &&
    validOptionalSeries(daily.temperature_2m_max, daily.time.length) &&
    Array.isArray(daily.temperature_2m_min) &&
    validOptionalSeries(daily.temperature_2m_min, daily.time.length) &&
    Array.isArray(daily.precipitation_probability_max) &&
    validOptionalSeries(daily.precipitation_probability_max, daily.time.length) &&
    Array.isArray(daily.weather_code) &&
    validOptionalSeries(daily.weather_code, daily.time.length) &&
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
  if (value !== 0 && value !== 1) throw new OpenMeteoProviderError('invalid_response');
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

function isNonNegativeAirQualityValue(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

function normalizeAirQualityTimeline(value: unknown) {
  if (!value || typeof value !== 'object') {
    throw new OpenMeteoProviderError('invalid_response', 'Air-quality timeline is unavailable');
  }
  const series = value as Record<string, unknown>;
  const times = series.time;
  if (
    !isNumberArray(times) ||
    !times.length ||
    times.length > 288 ||
    !times.every((time, index) => index === 0 || time > (times[index - 1] ?? -Infinity)) ||
    !airQualityVariables.every(
      (key) =>
        Array.isArray(series[key]) &&
        series[key].length === times.length &&
        series[key].every(isNonNegativeAirQualityValue),
    )
  ) {
    throw new OpenMeteoProviderError(
      'invalid_response',
      'Air-quality timeline has an invalid shape',
    );
  }
  const values = series as Record<(typeof airQualityVariables)[number], Array<number | null>>;
  return {
    kind: 'model' as const,
    requestedPastDays: 7 as const,
    requestedForecastDays: 5 as const,
    hours: times.map((time, index) => ({
      time: toIso(time),
      usAqi: values.us_aqi[index] ?? null,
      europeanAqi: values.european_aqi[index] ?? null,
      pollutants: {
        pm25: values.pm2_5[index] ?? null,
        pm10: values.pm10[index] ?? null,
        carbonMonoxide: values.carbon_monoxide[index] ?? null,
        nitrogenDioxide: values.nitrogen_dioxide[index] ?? null,
        sulphurDioxide: values.sulphur_dioxide[index] ?? null,
        ozone: values.ozone[index] ?? null,
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

    const data = await fetchOpenMeteoJson(this.fetcher, url);
    if (!isOpenMeteoResponse(data)) {
      throw new OpenMeteoProviderError(
        'invalid_response',
        'Open-Meteo response has an invalid shape',
      );
    }
    const firstForecastHour = data.hourly.time.findIndex((time) => time >= data.current.time);
    if (firstForecastHour < 0) {
      throw new OpenMeteoProviderError(
        'invalid_response',
        'Open-Meteo response has no future hourly forecast',
      );
    }
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
    const days = [];
    for (let index = 0; index < data.daily.time.length; index++) {
      const highC = data.daily.temperature_2m_max[index];
      const lowC = data.daily.temperature_2m_min[index];
      const weatherCode = data.daily.weather_code[index];
      if (
        highC === null ||
        highC === undefined ||
        lowC === null ||
        lowC === undefined ||
        weatherCode === null ||
        weatherCode === undefined
      ) {
        // Long-range model updates can leave trailing extended days null before the next run finishes.
        break;
      }
      const date = forecastDate(firstForecastDate, index);
      const aggregate = hourlyByLocalDate.get(date);
      days.push({
        date,
        highC,
        lowC,
        precipitationProbability: data.daily.precipitation_probability_max[index] ?? null,
        condition: conditionFromCode(weatherCode),
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
      });
    }
    if (days.length < Math.min(7, data.daily.time.length)) {
      throw new OpenMeteoProviderError(
        'invalid_response',
        'Open-Meteo response has incomplete core daily forecast',
      );
    }
    const coreDaily = days.slice(0, 7).map((day) => {
      if (typeof day.precipitationProbability !== 'number') {
        throw new OpenMeteoProviderError(
          'invalid_response',
          'Open-Meteo response has incomplete core daily forecast',
        );
      }
      return {
        ...day,
        precipitationProbability: day.precipitationProbability,
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
          const temperatureC = data.hourly.temperature_2m[sourceIndex];
          const precipitationProbability = data.hourly.precipitation_probability[sourceIndex];
          const weatherCode = data.hourly.weather_code[sourceIndex];
          if (
            temperatureC === null ||
            temperatureC === undefined ||
            precipitationProbability === null ||
            precipitationProbability === undefined ||
            weatherCode === null ||
            weatherCode === undefined
          ) {
            throw new OpenMeteoProviderError(
              'invalid_response',
              'Open-Meteo response has incomplete near-term hourly forecast',
            );
          }
          return {
            time: toIso(time),
            temperatureC,
            precipitationProbability,
            condition: conditionFromCode(weatherCode),
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
      daily: coreDaily,
      extendedDaily: days,
      meta: {
        provider: 'open-meteo',
        cached: false,
        stale: false,
        updatedAt: new Date().toISOString(),
      },
    };

    if (
      (dashboard.current.cloudCoverPercent != null &&
        (dashboard.current.cloudCoverPercent < 0 || dashboard.current.cloudCoverPercent > 100)) ||
      dashboard.current.humidityPercent < 0 ||
      dashboard.current.humidityPercent > 100
    ) {
      throw new OpenMeteoProviderError('invalid_response');
    }
    return dashboard satisfies Dashboard;
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

    const data = await fetchOpenMeteoJson(this.fetcher, url);
    if (!isOpenMeteoAirQualityResponse(data)) {
      throw new OpenMeteoProviderError(
        'invalid_response',
        'Open-Meteo air-quality response has an invalid shape',
      );
    }
    try {
      return {
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
      } satisfies AirQuality;
    } catch (error) {
      if (error instanceof OpenMeteoProviderError) throw error;
      throw new OpenMeteoProviderError('invalid_response');
    }
  }

  async searchLocations(query: string): Promise<LocationSearchResult[]> {
    return searchOpenMeteoLocations(query, this.fetcher, this.usageGuard);
  }
}

export class MockWeatherProvider implements WeatherProvider {
  async getDashboard(input: LocationInput): Promise<Dashboard> {
    void input;
    const hourlyRows: Array<[string, number, WeatherCondition]> = [
      ['09:00', 17, 'cloudy'],
      ['10:00', 19, 'partly-cloudy'],
      ['11:00', 21, 'partly-cloudy'],
      ['12:00', 23, 'clear'],
      ['13:00', 24, 'clear'],
      ['14:00', 25, 'partly-cloudy'],
      ['15:00', 24, 'rain'],
      ['16:00', 22, 'rain'],
      ['17:00', 21, 'cloudy'],
    ];
    const dailyRows: Array<[string, number, number, WeatherCondition]> = [
      ['2026-09-02', 22, 15, 'partly-cloudy'],
      ['2026-09-03', 20, 14, 'rain'],
      ['2026-09-04', 25, 16, 'thunderstorm'],
      ['2026-09-05', 23, 14, 'clear'],
      ['2026-09-06', 21, 13, 'cloudy'],
      ['2026-09-07', 19, 12, 'rain'],
      ['2026-09-08', 22, 13, 'partly-cloudy'],
    ];
    return {
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
      hourly: hourlyRows.map(([hour, temperatureC, condition], index) => ({
        time: `2026-09-01T${hour}:00.000Z`,
        temperatureC,
        precipitationProbability: index > 5 ? 40 : 5,
        condition,
      })),
      daily: dailyRows.map(([date, highC, lowC, condition]) => ({
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
    } satisfies Dashboard;
  }
}
