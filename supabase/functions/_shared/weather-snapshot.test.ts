import { describe, expect, it } from 'vitest';
import { parseWeatherHistoryQuery, parseWeatherSnapshotInsert } from './weather-snapshot';

const validInput = {
  latitude: 48.8534,
  longitude: 2.3488,
  observed_at: '2026-09-27T10:00:00.000Z',
  location_name: 'Paris',
  temperatureC: 21,
  apparentTemperatureC: 20,
  humidityPercent: 60,
  windSpeedKph: 12,
  pressureHpa: 1013,
  condition: 'partly-cloudy',
};

describe('weather history request validation', () => {
  it('validates bounded coordinates and the supported time windows', () => {
    expect(parseWeatherHistoryQuery('48.8534', '2.3488', '7')).toEqual({
      latitude: 48.8534,
      longitude: 2.3488,
      days: 7,
    });
    expect(parseWeatherHistoryQuery('91', '2.3488', '30')).toBeUndefined();
    expect(parseWeatherHistoryQuery('48.8534', '2.3488', '365')).toBeUndefined();
    expect(parseWeatherHistoryQuery(undefined, '2.3488', '30')).toBeUndefined();
  });

  it('builds an immutable row with the authenticated user ID and normalized payload', () => {
    expect(
      parseWeatherSnapshotInsert(
        { ...validInput, user_id: 'attacker' },
        'owner-id',
        Date.parse('2026-09-27T11:00:00.000Z'),
      ),
    ).toEqual({
      user_id: 'owner-id',
      latitude: 48.8534,
      longitude: 2.3488,
      observed_at: '2026-09-27T10:00:00.000Z',
      provider: 'open-meteo',
      payload: {
        location_name: 'Paris',
        temperature_c: 21,
        apparent_temperature_c: 20,
        humidity_percent: 60,
        wind_speed_kph: 12,
        pressure_hpa: 1013,
        condition: 'partly-cloudy',
      },
    });
  });

  it('rejects invalid, unbounded, or future observations', () => {
    const now = Date.parse('2026-09-27T11:00:00.000Z');
    expect(parseWeatherSnapshotInsert(validInput, 'owner-id', now)).toBeDefined();
    expect(
      parseWeatherSnapshotInsert({ ...validInput, latitude: 91 }, 'owner-id', now),
    ).toBeUndefined();
    expect(
      parseWeatherSnapshotInsert({ ...validInput, humidityPercent: 101 }, 'owner-id', now),
    ).toBeUndefined();
    expect(
      parseWeatherSnapshotInsert({ ...validInput, condition: 'unknown' }, 'owner-id', now),
    ).toBeUndefined();
    expect(
      parseWeatherSnapshotInsert(
        { ...validInput, observed_at: '2026-09-27T11:10:00.000Z' },
        'owner-id',
        now,
      ),
    ).toBeUndefined();
    expect(
      parseWeatherSnapshotInsert(
        { ...validInput, observed_at: '2026-09-26T10:00:00.000Z' },
        'owner-id',
        now,
      ),
    ).toBeUndefined();
  });
});
