import { describe, expect, it } from 'vitest';
import {
  alertOccurrenceMetrics,
  alertThresholdMetrics,
  evaluateInAppAlertStatus,
  formatTemperature,
  formatWindSpeed,
  planActivity,
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
  it('ranks low-rain comfortable windows ahead of severe weather', () => {
    const plan = planActivity('running', [
      {
        time: '2026-09-01T09:00:00.000Z',
        temperatureC: 18,
        precipitationProbability: 5,
        condition: 'partly-cloudy',
      },
      {
        time: '2026-09-01T10:00:00.000Z',
        temperatureC: 14,
        precipitationProbability: 90,
        condition: 'thunderstorm',
      },
    ]);

    expect(plan.score).toBeGreaterThan(plan.rankedWindows[1]?.score ?? 0);
    expect(plan.rankedWindows[0]?.startsAt).toBe('2026-09-01T09:00:00.000Z');
  });

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

  it('evaluates supported in-app conditions against current dashboard weather only', () => {
    const rule: AlertRule = {
      id: 'rule-1',
      locationId: 'berlin-de',
      conditions: [
        { metric: 'temperature', comparison: 'above', value: 30 },
        { metric: 'rain-probability', comparison: 'above', value: 70 },
      ],
      schedule: { weekdays: ['monday'], cooldownMinutes: 60 },
      notificationChannels: ['in-app'],
      enabled: true,
    };
    const weather = {
      current: {
        temperatureC: 32,
        apparentTemperatureC: 31,
        windSpeedKph: 25,
        condition: 'clear' as const,
      },
      hourly: [{ precipitationProbability: 80, condition: 'rain' as const }],
      timezone: 'UTC',
    };
    const monday = new Date('2026-09-28T12:00:00.000Z');

    expect(evaluateInAppAlertStatus(rule, weather, monday)).toBe('triggered');
    expect(
      evaluateInAppAlertStatus(
        { ...rule, conditions: [{ metric: 'temperature', comparison: 'above', value: 33 }] },
        weather,
        monday,
      ),
    ).toBe('monitoring');
    expect(evaluateInAppAlertStatus({ ...rule, enabled: false }, weather, monday)).toBe('disabled');
    expect(
      evaluateInAppAlertStatus(
        { ...rule, conditions: [{ metric: 'aqi', comparison: 'above', value: 100 }] },
        weather,
        monday,
      ),
    ).toBe('unsupported');
    expect(
      evaluateInAppAlertStatus(
        { ...rule, schedule: { weekdays: ['tuesday'], cooldownMinutes: 60 } },
        weather,
        monday,
      ),
    ).toBe('outside-schedule');
  });

  it('evaluates an in-app thunderstorm occurrence from the hourly forecast', () => {
    const rule: AlertRule = {
      id: 'rule-2',
      locationId: 'berlin-de',
      conditions: [{ metric: 'thunderstorm', expected: true }],
      schedule: { weekdays: ['monday'], cooldownMinutes: 60 },
      notificationChannels: ['in-app'],
      enabled: true,
    };

    expect(
      evaluateInAppAlertStatus(
        rule,
        {
          current: {
            temperatureC: 20,
            apparentTemperatureC: 20,
            windSpeedKph: 10,
            condition: 'clear',
          },
          hourly: [{ precipitationProbability: 20, condition: 'thunderstorm' }],
          timezone: 'UTC',
        },
        new Date('2026-09-28T12:00:00.000Z'),
      ),
    ).toBe('triggered');
  });
});
