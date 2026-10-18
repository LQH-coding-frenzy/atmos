import { describe, expect, it } from 'vitest';
import {
  alertOccurrenceMetrics,
  alertThresholdMetrics,
  evaluateInAppAlertStatus,
  formatTemperature,
  formatWindSpeed,
  planActivity,
  plannerActivityLabels,
  plannerActivityProfiles,
  plannerActivityKinds,
  plannerDimensions,
  supportedPlannerActivities,
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
      'precipitation',
      'wind',
      'uv',
      'aqi',
      'conditions',
    ]);
    expect(supportedPlannerActivities).toEqual(plannerActivityKinds);
    expect(Object.keys(plannerActivityProfiles)).toEqual(plannerActivityKinds);
    expect(plannerActivityLabels.beach).toBe('Beach day');
  });

  it('scores all weather dimensions and lowers coverage-adjusted scores when inputs are missing', () => {
    const completeHour = {
      time: '2026-09-01T09:00:00.000Z',
      temperatureC: 18,
      apparentTemperatureC: 18,
      humidityPercent: 55,
      precipitationProbability: 5,
      precipitationMm: 0,
      windSpeedKph: 10,
      windGustKph: 14,
      uvIndex: 2,
      condition: 'clear' as const,
    };
    const aqiHours = [{ time: completeHour.time, usAqi: 24 }];
    const full = planActivity('running', [completeHour], { aqiHours });
    const partial = planActivity('running', [
      {
        time: completeHour.time,
        temperatureC: 18,
        precipitationProbability: 5,
        condition: 'clear' as const,
      },
    ]);

    expect(full.coveragePercent).toBe(100);
    expect(full.rankedWindows[0]?.coveragePercent).toBe(100);
    expect(full.missingDimensions).toEqual([]);
    expect(partial.coveragePercent).toBeLessThan(full.coveragePercent);
    expect(partial.score).toBeLessThan(full.score);
    expect(partial.missingDimensions).toEqual([
      'feels-like',
      'humidity',
      'precipitation',
      'wind',
      'uv',
      'aqi',
    ]);
    expect(partial.rankedWindows[0]?.missingDimensions).toContain('aqi');
  });

  it('uses custom thresholds deterministically and returns the custom activity label', () => {
    const hourly = [
      {
        time: '2026-09-01T09:00:00.000Z',
        temperatureC: 18,
        apparentTemperatureC: 18,
        humidityPercent: 55,
        precipitationProbability: 5,
        windSpeedKph: 10,
        uvIndex: 2,
        condition: 'clear' as const,
      },
      {
        time: '2026-09-01T10:00:00.000Z',
        temperatureC: 31,
        apparentTemperatureC: 30,
        humidityPercent: 45,
        precipitationProbability: 5,
        windSpeedKph: 8,
        uvIndex: 2,
        condition: 'clear' as const,
      },
    ];
    const custom = planActivity({ kind: 'custom', name: 'Greenhouse work' }, hourly, {
      customThresholds: {
        temperatureMinC: 28,
        temperatureMaxC: 34,
        feelsLikeMinC: 27,
        feelsLikeMaxC: 35,
        humidityMaxPercent: 90,
        rainProbabilityMax: 20,
        precipitationMmMax: 2,
        windSpeedKphMax: 35,
        windGustKphMax: 50,
        uvIndexMax: 8,
        usAqiMax: 120,
      },
    });

    expect(custom.activity).toEqual({ kind: 'custom', name: 'Greenhouse work' });
    expect(custom.rankedWindows[0]?.startsAt).toBe('2026-09-01T10:00:00.000Z');
    expect(custom.score).toBe(custom.rankedWindows[0]?.score);
  });

  it('does not treat null or unmatched AQI timeline values as zero or as covered', () => {
    const hour = {
      time: '2026-09-01T09:00:00.000Z',
      temperatureC: 18,
      precipitationProbability: 5,
      condition: 'clear' as const,
    };
    const missingAqi = planActivity('running', [hour], {
      aqiHours: [{ time: hour.time, usAqi: null }],
    });
    const unmatchedAqi = planActivity('running', [hour], {
      aqiHours: [{ time: '2026-09-01T10:00:00.000Z', usAqi: 0 }],
    });

    expect(missingAqi.missingDimensions).toContain('aqi');
    expect(unmatchedAqi.missingDimensions).toContain('aqi');
    expect(missingAqi.score).toBe(unmatchedAqi.score);
    expect(missingAqi.factors.some((factor) => factor.dimension === 'aqi')).toBe(false);
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
      coveragePercent: 100,
      missingDimensions: [],
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
