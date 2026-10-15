import { describe, expect, it, vi } from 'vitest';
import { OpenMeteoProvider, OpenMeteoUsageGuard, openMeteoDashboardCallUnits } from './index';

function fixture() {
  const start = Date.parse('2026-09-01T00:00:00Z') / 1000;
  const series = (value: number) => Array<number | null>(384).fill(value);
  const daily = (value: number) => Array<number | null>(16).fill(value);
  return {
    timezone: 'UTC',
    current: {
      time: start + 10 * 3600 + 900,
      temperature_2m: 20,
      apparent_temperature: 19,
      relative_humidity_2m: 64,
      surface_pressure: 1017,
      wind_speed_10m: 13,
      weather_code: 2,
      wind_direction_10m: 225,
      wind_gusts_10m: 32,
      cloud_cover: 45,
      precipitation: 0,
      rain: 0,
      snowfall: 0,
      is_day: 1,
    },
    hourly: {
      time: Array.from({ length: 384 }, (_, i) => start + i * 3600),
      temperature_2m: series(20),
      precipitation_probability: series(5),
      weather_code: series(2),
      apparent_temperature: series(19),
      relative_humidity_2m: series(64),
      surface_pressure: series(1017),
      wind_speed_10m: series(13),
      wind_direction_10m: series(225),
      wind_gusts_10m: series(32),
      cloud_cover: series(45),
      precipitation: series(1.2),
      rain: series(1),
      snowfall: series(0.1),
      visibility: series(10000),
      uv_index: series(2.5),
      is_day: series(1),
    },
    daily: {
      time: Array.from({ length: 16 }, (_, i) => start + i * 86400),
      temperature_2m_max: daily(23),
      temperature_2m_min: daily(14),
      precipitation_probability_max: daily(10),
      weather_code: daily(2),
      sunrise: Array.from({ length: 16 }, (_, i) => start + i * 86400 + 6 * 3600) as Array<
        number | null
      >,
      sunset: Array.from({ length: 16 }, (_, i) => start + i * 86400 + 18 * 3600) as Array<
        number | null
      >,
      daylight_duration: daily(43200),
      precipitation_sum: daily(25.4),
      rain_sum: daily(20),
      snowfall_sum: daily(2.54),
      uv_index_max: daily(4),
      wind_speed_10m_max: daily(30),
      wind_gusts_10m_max: daily(45),
    },
  };
}
const input = { latitude: 0, longitude: 0, timezone: 'UTC', units: 'metric' as const };

describe('full normalized Open-Meteo weather', () => {
  it('requests explicit canonical units and a 16-day outlook, counting weighted calls', async () => {
    const fetcher = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      void url;
      void init;
      return new Response(JSON.stringify(fixture()));
    });
    const guard = new OpenMeteoUsageGuard();
    const result = await new OpenMeteoProvider(fetcher, guard).getDashboard(input);
    const url = new URL(String(fetcher.mock.calls[0]![0]));
    expect(url.searchParams.get('forecast_days')).toBe('16');
    expect(url.searchParams.get('temperature_unit')).toBe('celsius');
    expect(url.searchParams.get('wind_speed_unit')).toBe('kmh');
    expect(url.searchParams.get('precipitation_unit')).toBe('mm');
    expect(url.searchParams.get('hourly')).toContain('visibility');
    expect(url.searchParams.get('hourly')).toContain('uv_index');
    expect(result.current).toMatchObject({
      windDirectionDegrees: 225,
      windGustKph: 32,
      cloudCoverPercent: 45,
      precipitationMm: 0,
      isDay: true,
      hourlyEstimates: { time: '2026-09-01T10:00:00.000Z', visibilityM: 10000, uvIndex: 2.5 },
    });
    expect(result.hourly).toHaveLength(12);
    expect(result.hourly[0]?.time).toBe('2026-09-01T11:00:00.000Z');
    expect(result.hourly[0]).toMatchObject({
      apparentTemperatureC: 19,
      windGustKph: 32,
      visibilityM: 10000,
      uvIndex: 2.5,
      snowfallCm: 0.1,
    });
    expect(result.daily).toHaveLength(7);
    expect(result.extendedDaily).toHaveLength(16);
    expect(result.extendedDaily?.[0]).toMatchObject({
      sunrise: '2026-09-01T06:00:00.000Z',
      sunset: '2026-09-01T18:00:00.000Z',
      daylightSeconds: 43200,
      precipitationMm: 25.4,
      snowfallCm: 2.54,
      uvIndexMax: 4,
      windGustMaxKph: 45,
      apparentTemperatureMaxC: 19,
      humidityMeanPercent: 64,
      pressureMeanHpa: 1017,
      cloudCoverMeanPercent: 45,
      visibilityMeanM: 10000,
    });
    expect(result.extendedDaily?.[15]?.date).toBe('2026-09-16');
    expect(guard.snapshot().requests.minute).toBe(openMeteoDashboardCallUnits);
  });
  it('keeps model nulls and missing polar sun events instead of inventing measurements', async () => {
    const data = fixture();
    data.daily.sunrise[0] = 0;
    data.daily.sunset[0] = null;
    data.daily.daylight_duration[0] = 86400;
    data.hourly.visibility[10] = null;
    data.hourly.uv_index[10] = null;
    data.daily.precipitation_probability_max[15] = null;
    data.hourly.precipitation_probability[383] = null;
    const result = await new OpenMeteoProvider(
      async () => new Response(JSON.stringify(data)),
    ).getDashboard(input);
    expect(result.daily[0]).toMatchObject({ sunrise: null, sunset: null, daylightSeconds: 86400 });
    expect(result.current.hourlyEstimates).toMatchObject({ visibilityM: null, uvIndex: null });
    expect(result.extendedDaily?.[15]?.precipitationProbability).toBeNull();
  });
  it('does not use a future hourly value as a current estimate', async () => {
    const data = fixture();
    data.current.time = data.hourly.time[0]! - 900;
    const result = await new OpenMeteoProvider(
      async () => new Response(JSON.stringify(data)),
    ).getDashboard(input);
    expect(result.current.hourlyEstimates).toBeUndefined();
  });
  it('advances local forecast calendar dates once across the DST clock change', async () => {
    for (const [start, firstDate] of [
      ['2026-10-23T22:00:00Z', '2026-10-24'],
      ['2026-03-27T23:00:00Z', '2026-03-28'],
    ]) {
      const data = fixture();
      data.timezone = 'Europe/Berlin';
      data.daily.time = Array.from(
        { length: 16 },
        (_, index) => Date.parse(start!) / 1000 + index * 86400,
      );
      const result = await new OpenMeteoProvider(
        async () => new Response(JSON.stringify(data)),
      ).getDashboard(input);
      const dates = result.extendedDaily!.map((day) => day.date);
      expect(dates[0]).toBe(firstDate);
      expect(new Set(dates).size).toBe(16);
      for (let index = 1; index < dates.length; index++) {
        expect(Date.parse(dates[index]!) - Date.parse(dates[index - 1]!)).toBe(86400000);
      }
    }
  });
  it('rejects mismatched extension arrays and impossible ranges', async () => {
    const data = fixture();
    data.hourly.visibility.pop();
    await expect(
      new OpenMeteoProvider(async () => new Response(JSON.stringify(data))).getDashboard(input),
    ).rejects.toThrow('invalid shape');
    const invalid = fixture();
    invalid.current.cloud_cover = 101;
    await expect(
      new OpenMeteoProvider(async () => new Response(JSON.stringify(invalid))).getDashboard(input),
    ).rejects.toThrow();
  });
  it('reserves weighted call units atomically and rejects before fetching', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(fixture())));
    const guard = new OpenMeteoUsageGuard({
      minute: openMeteoDashboardCallUnits - 1,
      hour: 100,
      day: 100,
      month: 100,
    });
    await expect(new OpenMeteoProvider(fetcher, guard).getDashboard(input)).rejects.toThrow(
      'quota exceeded',
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(guard.snapshot().requests.minute).toBe(0);
    expect(() => guard.reserve(Date.now(), 0)).toThrow('weight');
  });
});
