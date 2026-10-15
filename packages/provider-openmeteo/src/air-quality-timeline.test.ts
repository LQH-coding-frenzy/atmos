import { describe, expect, it, vi } from 'vitest';
import { airQualitySchema, airQualityTimelineSchema } from '@atmos/contracts';
import { OpenMeteoProvider, OpenMeteoUsageGuard, openMeteoAqiTimelineCallUnits } from './index';

const variables = [
  'us_aqi',
  'european_aqi',
  'pm2_5',
  'pm10',
  'carbon_monoxide',
  'nitrogen_dioxide',
  'sulphur_dioxide',
  'ozone',
];
function fixture() {
  return {
    current: {
      time: Date.parse('2026-10-08T10:00:00Z') / 1000,
      ...Object.fromEntries(variables.map((key) => [key, 42])),
    },
    hourly: {
      time: Array.from(
        { length: 288 },
        (_, index) => Date.parse('2026-10-01T00:00:00Z') / 1000 + index * 3600,
      ),
      ...Object.fromEntries(variables.map((key) => [key, Array<number | null>(288).fill(42)])),
    } as { time: number[] } & Record<string, Array<number | null>>,
  };
}
describe('Open-Meteo AQI timelines', () => {
  it('requests bounded model history/forecast only when explicitly selected and reserves two units', async () => {
    const fetcher = vi.fn(async (url: URL | RequestInfo) => {
      void url;
      return new Response(JSON.stringify(fixture()));
    });
    const guard = new OpenMeteoUsageGuard();
    const provider = new OpenMeteoProvider(fetcher, guard);
    const data = await provider.getAirQuality({
      latitude: 52.52,
      longitude: 13.405,
      includeTimeline: true,
    });
    const url = new URL(String(fetcher.mock.calls[0]![0]));
    expect(url.searchParams.get('past_days')).toBe('7');
    expect(url.searchParams.get('forecast_days')).toBe('5');
    expect(url.searchParams.get('timezone')).toBe('UTC');
    expect(url.searchParams.get('hourly')?.split(',')).toHaveLength(8);
    expect(data.timeline?.hours).toHaveLength(288);
    expect(data.timeline?.kind).toBe('model');
    expect(data.timeline?.hours[0]?.time).toBe('2026-10-01T00:00:00.000Z');
    expect(guard.snapshot().requests.minute).toBe(openMeteoAqiTimelineCallUnits);
    await provider.getAirQuality({ latitude: 52.52, longitude: 13.405 });
    const currentUrl = new URL(String(fetcher.mock.calls[1]![0]));
    expect(currentUrl.searchParams.has('hourly')).toBe(false);
    expect(currentUrl.searchParams.has('past_days')).toBe(false);
    expect(guard.snapshot().requests.minute).toBe(3);
  });
  it('retains nulls and permits shorter coverage but rejects malformed arrays and oversized responses', async () => {
    const data = fixture();
    data.hourly.pm2_5![0] = null;
    const result = await new OpenMeteoProvider(
      async () => new Response(JSON.stringify(data)),
    ).getAirQuality({ latitude: 0, longitude: 0, includeTimeline: true });
    expect(result.timeline?.hours[0]?.pollutants.pm25).toBeNull();
    const shorter = fixture();
    for (const values of Object.values(shorter.hourly)) values.splice(4);
    const shortResult = await new OpenMeteoProvider(
      async () => new Response(JSON.stringify(shorter)),
    ).getAirQuality({ latitude: 0, longitude: 0, includeTimeline: true });
    expect(shortResult.timeline?.hours).toHaveLength(4);
    data.hourly.pm2_5!.pop();
    await expect(
      new OpenMeteoProvider(async () => new Response(JSON.stringify(data))).getAirQuality({
        latitude: 0,
        longitude: 0,
        includeTimeline: true,
      }),
    ).rejects.toThrow('invalid shape');
    data.hourly.time.push(data.hourly.time.at(-1)! + 3600);
    await expect(
      new OpenMeteoProvider(async () => new Response(JSON.stringify(data))).getAirQuality({
        latitude: 0,
        longitude: 0,
        includeTimeline: true,
      }),
    ).rejects.toThrow('invalid shape');
  });
  it('rejects duplicate/reversed timestamps and negative measurements, without changing the current schema', async () => {
    const data = fixture();
    data.hourly.time[1] = data.hourly.time[0]!;
    await expect(
      new OpenMeteoProvider(async () => new Response(JSON.stringify(data))).getAirQuality({
        latitude: 0,
        longitude: 0,
        includeTimeline: true,
      }),
    ).rejects.toThrow();
    const current = await new OpenMeteoProvider(
      async () => new Response(JSON.stringify(fixture())),
    ).getAirQuality({ latitude: 0, longitude: 0 });
    expect(airQualitySchema.safeParse(current).success).toBe(true);
    expect(current.timeline).toBeUndefined();
    const hour = {
      time: '2026-10-01T00:00:00.000Z',
      usAqi: -1,
      europeanAqi: null,
      pollutants: {
        pm25: null,
        pm10: null,
        ozone: null,
        carbonMonoxide: null,
        nitrogenDioxide: null,
        sulphurDioxide: null,
      },
    };
    expect(
      airQualityTimelineSchema.safeParse({
        kind: 'model',
        requestedPastDays: 7,
        requestedForecastDays: 5,
        hours: [hour],
      }).success,
    ).toBe(false);
  });
  it('fails closed when timeline data is omitted, and reserves quota before fetching', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ current: fixture().current })));
    await expect(
      new OpenMeteoProvider(fetcher).getAirQuality({
        latitude: 0,
        longitude: 0,
        includeTimeline: true,
      }),
    ).rejects.toThrow('unavailable');
    fetcher.mockClear();
    const guard = new OpenMeteoUsageGuard({ minute: 1, hour: 10, day: 10, month: 10 });
    await expect(
      new OpenMeteoProvider(fetcher, guard).getAirQuality({
        latitude: 0,
        longitude: 0,
        includeTimeline: true,
      }),
    ).rejects.toThrow('quota');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
