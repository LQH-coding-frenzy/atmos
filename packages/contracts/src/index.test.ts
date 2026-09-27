import { describe, expect, it } from 'vitest';
import {
  createWeatherSnapshotRequestSchema,
  locationInputSchema,
  savedLocationResponseSchema,
  savedLocationsResponseSchema,
  weatherSnapshotResponseSchema,
  weatherSnapshotsResponseSchema,
} from './index';

describe('locationInputSchema', () => {
  it('rejects coordinates outside the valid range', () => {
    expect(() =>
      locationInputSchema.parse({ latitude: 91, longitude: 13, timezone: 'Europe/Berlin' }),
    ).toThrow();
  });
});

describe('saved-location API contracts', () => {
  const location = {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Paris',
    latitude: 48.8534,
    longitude: 2.3488,
    created_at: '2026-09-27T10:00:00.000Z',
    updated_at: '2026-09-27T10:00:00.000Z',
  };

  it('accepts the authenticated list and create response shapes', () => {
    expect(savedLocationsResponseSchema.parse({ locations: [location] }).locations).toEqual([
      location,
    ]);
    expect(savedLocationResponseSchema.parse({ location }).location).toEqual(location);
  });

  it('rejects invalid coordinates and malformed response fields', () => {
    expect(() =>
      savedLocationsResponseSchema.parse({ locations: [{ ...location, latitude: 91 }] }),
    ).toThrow();
    expect(() =>
      savedLocationResponseSchema.parse({ location: { ...location, id: 'bad' } }),
    ).toThrow();
  });
});

describe('weather snapshot API contracts', () => {
  const request = {
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
  const snapshot = {
    id: '00000000-0000-4000-8000-000000000020',
    latitude: 48.8534,
    longitude: 2.3488,
    observed_at: request.observed_at,
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
    created_at: '2026-09-27T10:01:00.000Z',
  };

  it('accepts create, list, and insert response contracts', () => {
    expect(createWeatherSnapshotRequestSchema.parse(request)).toEqual(request);
    expect(weatherSnapshotsResponseSchema.parse({ snapshots: [snapshot] }).snapshots).toEqual([
      snapshot,
    ]);
    expect(weatherSnapshotResponseSchema.parse({ snapshot }).snapshot).toEqual(snapshot);
  });

  it('rejects malformed coordinates, measurement ranges, and conditions', () => {
    expect(() =>
      createWeatherSnapshotRequestSchema.parse({ ...request, longitude: 181 }),
    ).toThrow();
    expect(() =>
      createWeatherSnapshotRequestSchema.parse({ ...request, humidityPercent: 101 }),
    ).toThrow();
    expect(() =>
      weatherSnapshotResponseSchema.parse({
        snapshot: { ...snapshot, payload: { ...snapshot.payload, condition: 'unknown' } },
      }),
    ).toThrow();
    expect(() =>
      weatherSnapshotResponseSchema.parse({
        snapshot: { ...snapshot, payload: { ...snapshot.payload, temperature_c: 999 } },
      }),
    ).toThrow();
  });
});
