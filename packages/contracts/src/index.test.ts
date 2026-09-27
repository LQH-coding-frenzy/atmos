import { describe, expect, it } from 'vitest';
import {
  airQualitySchema,
  alertRuleResponseSchema,
  alertRulesResponseSchema,
  createAlertRuleRequestSchema,
  createWeatherSnapshotRequestSchema,
  locationInputSchema,
  savedLocationResponseSchema,
  savedLocationsResponseSchema,
  weatherSnapshotResponseSchema,
  weatherSnapshotsResponseSchema,
  updateAlertRuleRequestSchema,
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

describe('air-quality API contract', () => {
  const airQuality = {
    observedAt: '2026-09-27T10:00:00.000Z',
    usAqi: 42,
    europeanAqi: 18,
    pollutants: {
      pm25: 7.2,
      pm10: 12.4,
      carbonMonoxide: 120,
      nitrogenDioxide: 4.3,
      sulphurDioxide: 1.1,
      ozone: 65,
    },
    meta: {
      provider: 'open-meteo',
      cached: false,
      stale: false,
      updatedAt: '2026-09-27T10:02:00.000Z',
    },
  };

  it('accepts complete model data and nullable missing fields', () => {
    expect(airQualitySchema.parse(airQuality)).toEqual(airQuality);
    expect(
      airQualitySchema.parse({
        ...airQuality,
        usAqi: null,
        pollutants: { ...airQuality.pollutants, pm25: null },
      }).usAqi,
    ).toBeNull();
  });

  it('rejects negative AQI and invalid pollutant data', () => {
    expect(() => airQualitySchema.parse({ ...airQuality, europeanAqi: -1 })).toThrow();
    expect(() =>
      airQualitySchema.parse({
        ...airQuality,
        pollutants: { ...airQuality.pollutants, pm10: 'high' },
      }),
    ).toThrow();
  });
});

describe('in-app alert rule API contracts', () => {
  const condition = { metric: 'temperature', comparison: 'above', value: 30 } as const;
  const rule = {
    id: '00000000-0000-4000-8000-000000000040',
    location_id: 'berlin-de',
    latitude: 52.52,
    longitude: 13.405,
    conditions: [condition],
    schedule: {
      weekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      cooldownMinutes: 60,
    },
    notification_channels: ['in-app'],
    enabled: true,
    created_at: '2026-09-27T10:00:00.000Z',
    updated_at: '2026-09-27T10:00:00.000Z',
  };

  it('accepts in-app alert create, list, and update contracts', () => {
    expect(
      createAlertRuleRequestSchema.parse({
        location_id: rule.location_id,
        latitude: rule.latitude,
        longitude: rule.longitude,
        condition,
      }),
    ).toEqual({
      location_id: rule.location_id,
      latitude: rule.latitude,
      longitude: rule.longitude,
      condition,
    });
    expect(alertRulesResponseSchema.parse({ rules: [rule] }).rules).toEqual([rule]);
    expect(alertRuleResponseSchema.parse({ rule }).rule).toEqual(rule);
    expect(updateAlertRuleRequestSchema.parse({ enabled: false })).toEqual({ enabled: false });
  });

  it('rejects invalid alert thresholds and enabled patches', () => {
    expect(() =>
      createAlertRuleRequestSchema.parse({
        location_id: 'berlin-de',
        latitude: 52.52,
        longitude: 13.405,
        condition: { metric: 'rain-probability', comparison: 'above', value: 101 },
      }),
    ).toThrow();
    expect(() => updateAlertRuleRequestSchema.parse({ enabled: 'yes' })).toThrow();
  });
});
