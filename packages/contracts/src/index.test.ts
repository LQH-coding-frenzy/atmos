import { describe, expect, it } from 'vitest';
import {
  airQualitySchema,
  appRoleSchema,
  alertRuleResponseSchema,
  alertRulesResponseSchema,
  createAlertRuleRequestSchema,
  createWeatherSnapshotRequestSchema,
  locationInputSchema,
  openWeatherMapLayerSchema,
  savedLocationResponseSchema,
  savedLocationsResponseSchema,
  weatherMapConfigurationSchema,
  weatherRadarTimelineSchema,
  weatherSnapshotResponseSchema,
  weatherSnapshotsResponseSchema,
  updateAlertRuleRequestSchema,
  currentWeatherSchema,
  dailyForecastSchema,
  hourlyForecastSchema,
  extendedDailyForecastSchema,
  replaceSavedLocationPreferencesSchema,
  profilePreferencesResponseSchema,
  profilePreferencesUpdateSchema,
  severeWeatherRequestSchema,
  severeWeatherResponseSchema,
} from './index';

describe('additive full weather contract', () => {
  const current = {
    observedAt: '2026-09-01T10:00:00.000Z',
    temperatureC: 20,
    apparentTemperatureC: 19,
    humidityPercent: 64,
    windSpeedKph: 13,
    pressureHpa: 1017,
    condition: 'clear',
  };
  const day = {
    date: '2026-09-01',
    highC: 23,
    lowC: 14,
    precipitationProbability: 5,
    condition: 'clear',
  };
  it('accepts legacy cached responses, missing extensions and nullable model values', () => {
    expect(currentWeatherSchema.parse(current)).toEqual(current);
    expect(
      currentWeatherSchema.parse({ ...current, cloudCoverPercent: null }).cloudCoverPercent,
    ).toBeNull();
    expect(
      dailyForecastSchema.parse({ ...day, sunrise: null, sunset: null, daylightSeconds: 86400 })
        .sunrise,
    ).toBeNull();
    expect(
      hourlyForecastSchema.parse({
        time: current.observedAt,
        temperatureC: 20,
        precipitationProbability: 5,
        condition: 'clear',
        uvIndex: null,
      }).uvIndex,
    ).toBeNull();
  });
  it('rejects impossible units/ranges and invalid estimate timestamps', () => {
    for (const extension of [
      { windDirectionDegrees: 361 },
      { windGustKph: -1 },
      { cloudCoverPercent: 101 },
      { precipitationMm: -1 },
      { hourlyEstimates: { time: 'now', uvIndex: 2 } },
    ]) {
      expect(currentWeatherSchema.safeParse({ ...current, ...extension }).success).toBe(false);
    }
    expect(dailyForecastSchema.safeParse({ ...day, daylightSeconds: 86401 }).success).toBe(false);
    expect(dailyForecastSchema.safeParse({ ...day, precipitationProbability: null }).success).toBe(
      false,
    );
    expect(
      extendedDailyForecastSchema.parse({ ...day, precipitationProbability: null })
        .precipitationProbability,
    ).toBeNull();
  });
});

describe('locationInputSchema', () => {
  it('rejects coordinates outside the valid range', () => {
    expect(() =>
      locationInputSchema.parse({ latitude: 91, longitude: 13, timezone: 'Europe/Berlin' }),
    ).toThrow();
  });
});

describe('profile and preference API contracts', () => {
  const profile = {
    id: '00000000-0000-4000-8000-000000000001',
    display_name: 'Atmos user',
    created_at: '2026-09-01T10:00:00.000Z',
    updated_at: '2026-09-01T10:00:00.000Z',
  };
  const preferences = {
    units: 'metric',
    timezone: 'auto',
    theme: 'system',
    updated_at: '2026-09-01T10:00:00.000Z',
  } as const;

  it('accepts the current caller profile and a trimmed partial update', () => {
    expect(profilePreferencesResponseSchema.parse({ role: 'owner', profile, preferences })).toEqual(
      {
        role: 'owner',
        profile,
        preferences,
      },
    );
    expect(profilePreferencesResponseSchema.parse({ profile, preferences }).role).toBeUndefined();
    expect(
      profilePreferencesUpdateSchema.parse({
        display_name: '  Weather user  ',
        timezone: ' Europe/Paris ',
      }),
    ).toEqual({ display_name: 'Weather user', timezone: 'Europe/Paris' });
  });

  it('rejects empty, invalid, and privilege/ownership-bearing updates', () => {
    for (const update of [
      {},
      { display_name: '   ' },
      { display_name: '😀'.repeat(81) },
      { timezone: 'not/a-real-timezone' },
      { units: 'kelvin' },
      { theme: 'auto' },
      { display_name: 'Allowed', user_id: profile.id },
      { role: 'owner' },
    ]) {
      expect(profilePreferencesUpdateSchema.safeParse(update).success).toBe(false);
    }
  });

  it('recognizes only owner and user application roles', () => {
    expect(appRoleSchema.parse('owner')).toBe('owner');
    expect(appRoleSchema.parse('user')).toBe('user');
    expect(appRoleSchema.safeParse('admin').success).toBe(false);
  });
});

describe('weather radar timeline contract', () => {
  const timeline = {
    generatedAt: 1_791_825_600,
    tileHost: 'https://tilecache.rainviewer.com' as const,
    frames: [
      { timestamp: 1_791_825_000, path: '/v2/radar/9d080488b7e9' },
      { timestamp: 1_791_825_600, path: '/v2/radar/2160626c1c69' },
    ],
  };

  it('accepts an ordered RainViewer timeline with a fixed trusted tile host', () => {
    expect(weatherRadarTimelineSchema.parse(timeline)).toEqual(timeline);
  });

  it('rejects malformed hosts, duplicate timestamps, and oversized timelines', () => {
    expect(() =>
      weatherRadarTimelineSchema.parse({ ...timeline, tileHost: 'https://tiles.attacker.test' }),
    ).toThrow();
    expect(() =>
      weatherRadarTimelineSchema.parse({
        ...timeline,
        frames: [
          { timestamp: 1_791_825_600, path: '/v2/radar/9d080488b7e9' },
          { timestamp: 1_791_825_600, path: '/v2/radar/2160626c1c69' },
        ],
      }),
    ).toThrow();
    expect(() =>
      weatherRadarTimelineSchema.parse({
        ...timeline,
        frames: Array.from({ length: 14 }, (_, index) => ({
          timestamp: 1_791_825_000 + index,
          path: `/v2/radar/frame-${index}`,
        })),
      }),
    ).toThrow();
  });
});

describe('official severe-weather response contract', () => {
  const base = {
    coverage: 'supported' as const,
    source: 'nws' as const,
    alerts: [
      {
        id: 'https://api.weather.gov/alerts/urn:oid:2.49.0.1.840.0.test',
        event: 'Severe Thunderstorm Warning',
        headline: 'Warning issued',
        severity: 'Severe',
        urgency: 'Immediate',
        certainty: 'Observed',
        area: 'County A; County B',
        publishedAt: '2026-10-19T14:00:00+00:00',
        effectiveAt: '2026-10-19T14:00:00+00:00',
        onsetAt: null,
        expiresAt: '2026-10-19T15:00:00+00:00',
        endsAt: null,
        description: 'Original alert text.\nSecond paragraph.',
        instruction: 'Take shelter.',
        sourceUrl: 'https://api.weather.gov/alerts/urn:oid:2.49.0.1.840.0.test',
      },
    ],
    meta: {
      checkedAt: '2026-10-19T14:00:00.000Z',
      cached: false,
      stale: false,
      truncated: false,
    },
  };

  it('accepts source-preserving alerts and explicitly unsupported coverage', () => {
    expect(severeWeatherResponseSchema.parse(base)).toEqual(base);
    expect(
      severeWeatherResponseSchema.parse({
        ...base,
        coverage: 'unsupported',
        source: null,
        alerts: [],
      }).coverage,
    ).toBe('unsupported');
  });

  it('rejects unsupported results with alerts and stale results without a cache marker', () => {
    expect(
      severeWeatherResponseSchema.safeParse({
        ...base,
        coverage: 'unsupported',
        source: null,
      }).success,
    ).toBe(false);
    expect(
      severeWeatherResponseSchema.safeParse({
        ...base,
        meta: { ...base.meta, stale: true },
      }).success,
    ).toBe(false);
  });

  it('bounds alert text and result counts', () => {
    expect(
      severeWeatherResponseSchema.safeParse({
        ...base,
        alerts: [{ ...base.alerts[0], description: 'x'.repeat(32_769) }],
      }).success,
    ).toBe(false);
    expect(
      severeWeatherResponseSchema.safeParse({ ...base, alerts: Array(21).fill(base.alerts[0]) })
        .success,
    ).toBe(false);
  });
});

describe('official severe-weather request contract', () => {
  it('accepts bounded coordinates and an unknown country for explicit unsupported coverage', () => {
    expect(
      severeWeatherRequestSchema.parse({ latitude: 52.52, longitude: 13.405, country: 'Germany' }),
    ).toEqual({ latitude: 52.52, longitude: 13.405, country: 'Germany' });
    expect(
      severeWeatherRequestSchema.parse({ latitude: 0, longitude: 0, country: '' }).country,
    ).toBe('');
  });

  it('rejects invalid coordinates and oversized country labels', () => {
    expect(
      severeWeatherRequestSchema.safeParse({ latitude: 91, longitude: 0, country: 'Canada' })
        .success,
    ).toBe(false);
    expect(
      severeWeatherRequestSchema.safeParse({
        latitude: 0,
        longitude: 181,
        country: 'Canada',
      }).success,
    ).toBe(false);
    expect(
      severeWeatherRequestSchema.safeParse({ latitude: 0, longitude: 0, country: 'x'.repeat(65) })
        .success,
    ).toBe(false);
  });
});

describe('weather map configuration contract', () => {
  it('allows configured or unavailable OpenWeather current-map layers', () => {
    expect(weatherMapConfigurationSchema.parse({ openWeatherAvailable: false })).toEqual({
      openWeatherAvailable: false,
    });
    expect(weatherMapConfigurationSchema.parse({ openWeatherAvailable: true })).toEqual({
      openWeatherAvailable: true,
    });
    expect(openWeatherMapLayerSchema.parse('precipitation_new')).toBe('precipitation_new');
    expect(() => openWeatherMapLayerSchema.parse('radar_forecast')).toThrow();
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
    is_favorite: false,
    category: null,
    sort_order: 0,
    is_default: false,
  };

  it('accepts the authenticated list and create response shapes', () => {
    expect(savedLocationsResponseSchema.parse({ locations: [location] }).locations).toEqual([
      location,
    ]);
    expect(savedLocationResponseSchema.parse({ location }).location).toEqual(location);
    expect(
      replaceSavedLocationPreferencesSchema.parse({
        locations: [{ id: location.id, is_favorite: true, category: 'home' }],
        defaultLocationId: location.id,
      }),
    ).toMatchObject({ defaultLocationId: location.id });
  });

  it('defaults additive saved-place preference fields when parsing an older response', () => {
    const legacy = {
      id: location.id,
      name: location.name,
      latitude: location.latitude,
      longitude: location.longitude,
      created_at: location.created_at,
      updated_at: location.updated_at,
    };
    expect(savedLocationsResponseSchema.parse({ locations: [legacy] })).toMatchObject({
      locations: [{ is_favorite: false, category: null, sort_order: 0, is_default: false }],
    });
    expect(
      savedLocationsResponseSchema.parse({ locations: [legacy], preferencesInitialized: false })
        .preferencesInitialized,
    ).toBe(false);
  });

  it('rejects invalid coordinates and malformed response fields', () => {
    expect(() =>
      savedLocationsResponseSchema.parse({ locations: [{ ...location, latitude: 91 }] }),
    ).toThrow();
    expect(() =>
      savedLocationResponseSchema.parse({ location: { ...location, id: 'bad' } }),
    ).toThrow();
    expect(
      replaceSavedLocationPreferencesSchema.safeParse({
        locations: [{ id: location.id, is_favorite: true, category: 'admin' }],
        defaultLocationId: location.id,
      }).success,
    ).toBe(false);
    const overLimit = Array.from({ length: 101 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      is_favorite: false,
      category: null,
    }));
    expect(
      replaceSavedLocationPreferencesSchema.safeParse({
        locations: overLimit,
        defaultLocationId: null,
      }).success,
    ).toBe(false);
    expect(
      replaceSavedLocationPreferencesSchema.safeParse({
        locations: [
          { id: location.id, is_favorite: true, category: null },
          { id: location.id, is_favorite: false, category: null },
        ],
        defaultLocationId: null,
      }).success,
    ).toBe(false);
    expect(
      replaceSavedLocationPreferencesSchema.safeParse({
        locations: [],
        defaultLocationId: location.id,
      }).success,
    ).toBe(false);
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

  it('validates custom alert weekdays, absolute windows, and cooldown bounds', () => {
    const schedule = {
      weekdays: ['monday', 'thursday'],
      startsAt: '2026-09-28T08:00:00.000Z',
      endsAt: '2026-09-30T18:00:00.000Z',
      cooldownMinutes: 120,
    };
    expect(
      createAlertRuleRequestSchema.parse({
        location_id: rule.location_id,
        latitude: rule.latitude,
        longitude: rule.longitude,
        condition,
        schedule,
      }).schedule,
    ).toEqual(schedule);

    for (const invalidSchedule of [
      { ...schedule, weekdays: ['monday', 'monday'] },
      { ...schedule, weekdays: [] },
      { ...schedule, startsAt: 'next monday' },
      { ...schedule, startsAt: '2026-09-30T18:00:00.000Z' },
      { ...schedule, cooldownMinutes: 0 },
      { ...schedule, cooldownMinutes: 10081 },
    ]) {
      expect(() =>
        createAlertRuleRequestSchema.parse({
          location_id: rule.location_id,
          latitude: rule.latitude,
          longitude: rule.longitude,
          condition,
          schedule: invalidSchedule,
        }),
      ).toThrow();
    }
  });
});
