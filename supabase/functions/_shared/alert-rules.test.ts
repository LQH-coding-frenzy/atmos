import { describe, expect, it } from 'vitest';
import {
  parseAlertRuleEnabledUpdate,
  parseAlertRuleInsert,
  parseAlertRuleLocation,
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

  it('accepts an enabled-only patch and rejects payload mutation fields', () => {
    expect(parseAlertRuleEnabledUpdate({ enabled: false })).toEqual({ enabled: false });
    expect(parseAlertRuleEnabledUpdate({ enabled: 'false', conditions: [] })).toBeUndefined();
  });
});
