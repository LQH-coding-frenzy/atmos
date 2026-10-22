import { describe, expect, it } from 'vitest';
import {
  parseAlertRuleEnabledUpdate,
  parseAlertRuleInsert,
  parseAlertRuleLocation,
  parseAlertRuleSchedule,
} from './alert-rules';

describe('alert-rule API validation', () => {
  it('validates location queries and supported threshold rules', () => {
    expect(parseAlertRuleLocation('52.52', '13.405')).toEqual({
      latitude: 52.52,
      longitude: 13.405,
    });
    expect(parseAlertRuleLocation('91', '13.405')).toBeUndefined();
    expect(
      parseAlertRuleInsert(
        {
          location_id: 'berlin-de',
          latitude: 52.52,
          longitude: 13.405,
          condition: { metric: 'temperature', comparison: 'above', value: 30 },
        },
        'owner-id',
      ),
    ).toEqual({
      user_id: 'owner-id',
      location_id: 'berlin-de',
      latitude: 52.52,
      longitude: 13.405,
      conditions: [{ metric: 'temperature', comparison: 'above', value: 30 }],
      schedule: {
        weekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
        cooldownMinutes: 60,
      },
      notification_channels: ['in-app'],
      enabled: true,
    });
  });

  it('allows only in-app thunderstorm rules and bounded values', () => {
    expect(
      parseAlertRuleInsert(
        {
          location_id: 'berlin-de',
          latitude: 52.52,
          longitude: 13.405,
          condition: { metric: 'thunderstorm', expected: true },
        },
        'owner-id',
      )?.notification_channels,
    ).toEqual(['in-app']);
    expect(
      parseAlertRuleInsert(
        {
          location_id: 'berlin-de',
          latitude: 52.52,
          longitude: 13.405,
          condition: { metric: 'wind', comparison: 'above', value: 501 },
        },
        'owner-id',
      ),
    ).toBeUndefined();
    expect(
      parseAlertRuleInsert(
        {
          location_id: 'berlin-de',
          latitude: 52.52,
          longitude: 13.405,
          condition: { metric: 'wind', comparison: 'above', value: 20 },
          notification_channels: ['push'],
          user_id: 'attacker',
        },
        'owner-id',
      )?.user_id,
    ).toBe('owner-id');
  });

  it('accepts the completed weather, AQI, and official-warning condition set', () => {
    const thresholdConditions = [
      { metric: 'rainfall', comparison: 'above', value: 10 },
      { metric: 'snowfall', comparison: 'above', value: 5 },
      { metric: 'gust', comparison: 'above', value: 40 },
      { metric: 'uv', comparison: 'above', value: 8 },
      { metric: 'aqi', comparison: 'above', value: 100 },
      { metric: 'pm2.5', comparison: 'above', value: 25 },
      { metric: 'visibility', comparison: 'below', value: 2 },
    ];
    for (const condition of thresholdConditions) {
      expect(
        parseAlertRuleInsert(
          {
            location_id: 'berlin-de',
            latitude: 52.52,
            longitude: 13.405,
            condition,
          },
          'owner-id',
        )?.conditions,
      ).toEqual([condition]);
    }

    for (const metric of ['freeze-risk', 'extreme-heat', 'provider-severe-weather-alert']) {
      expect(
        parseAlertRuleInsert(
          {
            location_id: 'berlin-de',
            latitude: 52.52,
            longitude: 13.405,
            condition: { metric, expected: true },
          },
          'owner-id',
        )?.conditions,
      ).toEqual([{ metric, expected: true }]);
    }
    expect(
      parseAlertRuleInsert(
        {
          location_id: 'berlin-de',
          latitude: 52.52,
          longitude: 13.405,
          condition: { metric: 'provider-severe-weather-alert', expected: false },
        },
        'owner-id',
      ),
    ).toBeUndefined();
  });

  it('accepts an enabled-only patch and rejects payload mutation fields', () => {
    expect(parseAlertRuleEnabledUpdate({ enabled: false })).toEqual({ enabled: false });
    expect(parseAlertRuleEnabledUpdate({ enabled: 'false', conditions: [] })).toBeUndefined();
  });

  it('validates configured weekdays, absolute time windows, and cooldown bounds', () => {
    expect(
      parseAlertRuleSchedule({
        weekdays: ['monday', 'thursday'],
        startsAt: '2026-09-28T08:00:00.000Z',
        endsAt: '2026-09-30T18:00:00.000Z',
        cooldownMinutes: 120,
      }),
    ).toEqual({
      weekdays: ['monday', 'thursday'],
      startsAt: '2026-09-28T08:00:00.000Z',
      endsAt: '2026-09-30T18:00:00.000Z',
      cooldownMinutes: 120,
    });

    for (const schedule of [
      { weekdays: [], cooldownMinutes: 60 },
      { weekdays: ['monday', 'monday'], cooldownMinutes: 60 },
      { weekdays: ['funday'], cooldownMinutes: 60 },
      { weekdays: ['monday'], cooldownMinutes: 0 },
      { weekdays: ['monday'], cooldownMinutes: 10081 },
      { weekdays: ['monday'], startsAt: 'tomorrow', cooldownMinutes: 60 },
      {
        weekdays: ['monday'],
        startsAt: '2026-09-30T18:00:00.000Z',
        endsAt: '2026-09-28T08:00:00.000Z',
        cooldownMinutes: 60,
      },
      { weekdays: ['monday'], cooldownMinutes: 60, role: 'owner' },
    ]) {
      expect(parseAlertRuleSchedule(schedule)).toBeUndefined();
    }
  });

  it('accepts bounded weather, AQI, and official-warning conditions only', () => {
    const thresholdConditions = [
      { metric: 'rainfall', comparison: 'above', value: 10 },
      { metric: 'snowfall', comparison: 'above', value: 5 },
      { metric: 'gust', comparison: 'above', value: 40 },
      { metric: 'uv', comparison: 'above', value: 8 },
      { metric: 'aqi', comparison: 'above', value: 100 },
      { metric: 'pm2.5', comparison: 'above', value: 25 },
      { metric: 'visibility', comparison: 'below', value: 2 },
    ];
    for (const condition of thresholdConditions) {
      expect(
        parseAlertRuleInsert(
          {
            location_id: 'berlin-de',
            latitude: 52.52,
            longitude: 13.405,
            condition,
          },
          'owner-id',
        )?.conditions,
      ).toEqual([condition]);
    }

    for (const metric of ['freeze-risk', 'extreme-heat', 'provider-severe-weather-alert']) {
      expect(
        parseAlertRuleInsert(
          {
            location_id: 'berlin-de',
            latitude: 52.52,
            longitude: 13.405,
            condition: { metric, expected: true },
          },
          'owner-id',
        )?.conditions,
      ).toEqual([{ metric, expected: true }]);
    }
    expect(
      parseAlertRuleInsert(
        {
          location_id: 'berlin-de',
          latitude: 52.52,
          longitude: 13.405,
          condition: { metric: 'provider-severe-weather-alert', expected: false },
        },
        'owner-id',
      ),
    ).toBeUndefined();
  });
});
