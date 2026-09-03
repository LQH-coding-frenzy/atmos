import {
  dashboardSchema,
  type Dashboard,
  type LocationInput,
  type WeatherCondition,
  type WeatherProvider,
} from '@atmos/contracts';

const openMeteoBaseUrl = 'https://api.open-meteo.com/v1/forecast';

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

  reserve(now = Date.now()): OpenMeteoUsageSnapshot {
    this.prune(now);
    const nextTimestamps = [...this.requestTimestamps, now];
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
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    surface_pressure: number;
    wind_speed_10m: number;
    weather_code: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability: number[];
    weather_code: number[];
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    weather_code: number[];
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

function toIso(time: string): string {
  return new Date(`${time}Z`).toISOString();
}

export class OpenMeteoProvider implements WeatherProvider {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly usageGuard = new OpenMeteoUsageGuard(),
  ) {}

  async getDashboard(input: LocationInput): Promise<Dashboard> {
    this.usageGuard.reserve();
    const url = new URL(openMeteoBaseUrl);
    url.searchParams.set('latitude', String(input.latitude));
    url.searchParams.set('longitude', String(input.longitude));
    url.searchParams.set('timezone', input.timezone);
    url.searchParams.set(
      'current',
      'temperature_2m,apparent_temperature,relative_humidity_2m,surface_pressure,wind_speed_10m,weather_code',
    );
    url.searchParams.set('hourly', 'temperature_2m,precipitation_probability,weather_code');
    url.searchParams.set(
      'daily',
      'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code',
    );
    url.searchParams.set('forecast_days', '7');

    const response = await this.fetcher(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      throw new Error(`Open-Meteo request failed with ${response.status}`);
    }

    const data = (await response.json()) as OpenMeteoResponse;
    const locationName = `${input.latitude.toFixed(2)}, ${input.longitude.toFixed(2)}`;
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
      },
      hourly: data.hourly.time.slice(0, 12).map((time, index) => ({
        time: toIso(time),
        temperatureC: data.hourly.temperature_2m[index] ?? 0,
        precipitationProbability: data.hourly.precipitation_probability[index] ?? 0,
        condition: conditionFromCode(data.hourly.weather_code[index] ?? 0),
      })),
      daily: data.daily.time.map((date, index) => ({
        date,
        highC: data.daily.temperature_2m_max[index] ?? 0,
        lowC: data.daily.temperature_2m_min[index] ?? 0,
        precipitationProbability: data.daily.precipitation_probability_max[index] ?? 0,
        condition: conditionFromCode(data.daily.weather_code[index] ?? 0),
      })),
      meta: {
        provider: 'open-meteo',
        cached: false,
        stale: false,
        updatedAt: new Date().toISOString(),
      },
    };

    return dashboardSchema.parse(dashboard);
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
