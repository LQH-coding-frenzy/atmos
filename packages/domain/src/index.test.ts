import { describe, expect, it } from 'vitest';
import {
  alertOccurrenceMetrics,
  alertThresholdMetrics,
  formatTemperature,
  formatWindSpeed,
  plannerActivityKinds,
  plannerDimensions,
  type AlertRule,
  type AlertCondition,
  type PlannerActivity,
  type PlannerResult,
} from './index';

describe('weather formatting', () => {
  it('formats metric and imperial values deterministically', () => {
    expect(formatTemperature(20, 'metric')).toBe('20 deg');
    expect(formatTemperature(20, 'imperial')).toBe('68 deg');
    expect(formatWindSpeed(13, 'metric')).toBe('13 km/h');
    expect(formatWindSpeed(13, 'imperial')).toBe('8 mph');
  });
});

describe('planner and alert models', () => {
  it('covers every planned activity and scoring dimension', () => {
    expect(plannerActivityKinds).toEqual([
      'running',
      'cycling',
      'hiking',
      'football',
      'photography',
      'beach',
      'commuting',
      'sightseeing',
      'picnic',
    ]);
    expect(plannerDimensions).toEqual([
      'temperature',
      'feels-like',
      'humidity',
      'rain',
      'wind',
      'uv',
      'aqi',
    ]);
  });

  it('rejects mixed discriminated-union shapes at compile time', () => {
    const customActivity: PlannerActivity = { kind: 'custom', name: 'Gardening' };
    const thresholdCondition: AlertCondition = {
      metric: 'rain-probability',
      comparison: 'above',
      value: 60,
    };

    // @ts-expect-error Built-in activities cannot carry custom names.
    const invalidBuiltInActivity: PlannerActivity = { kind: 'running', name: 'Jogging' };
    const invalidOccurrenceCondition: AlertCondition = {
      metric: 'thunderstorm',
      expected: true,
      // @ts-expect-error Occurrence conditions cannot carry threshold fields.
      comparison: 'above',
      value: 60,
    };

    expect(customActivity.name).toBe('Gardening');
    expect(thresholdCondition.value).toBe(60);
    expect(invalidBuiltInActivity).toBeDefined();
    expect(invalidOccurrenceCondition).toBeDefined();
  });

  it('keeps serializable planner and alert results type-safe', () => {
    const planner: PlannerResult = {
      activity: { kind: 'running' },
      score: 84,
      rankedWindows: [],
      factors: [
        {
          dimension: 'temperature',
          impact: 'positive',
          explanation: 'Mild temperature',
        },
      ],
    };
    const alert: AlertRule = {
      id: 'alert-1',
      locationId: 'location-1',
      conditions: [
        { metric: 'rain-probability', comparison: 'above', value: 60 },
        { metric: 'thunderstorm', expected: true },
      ],
      schedule: { weekdays: ['monday'], cooldownMinutes: 60 },
      notificationChannels: ['in-app', 'push'],
      enabled: true,
    };

    expect(planner.score).toBe(84);
    expect(alert.conditions).toHaveLength(2);
    expect(alertThresholdMetrics).toContain('pm2.5');
    expect(alertOccurrenceMetrics).toContain('provider-severe-weather-alert');
  });
});
