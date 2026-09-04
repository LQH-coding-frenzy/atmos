import { describe, expect, it } from 'vitest';
import { recommendActivity, type PlannerConditions } from './planner';

const mildConditions: PlannerConditions = {
  temperatureC: 19,
  apparentTemperatureC: 19,
  humidityPercent: 55,
  precipitationProbability: 0,
  condition: 'partly-cloudy',
  windSpeedKph: 10,
  uvIndex: 3,
  aqi: 35,
};

describe('recommendActivity', () => {
  it('scores comfort factors deterministically and ranks the best window first', () => {
    const result = recommendActivity('running', mildConditions, [
      {
        ...mildConditions,
        startsAt: '2026-09-01T15:00:00.000Z',
        endsAt: '2026-09-01T16:00:00.000Z',
        precipitationProbability: 40,
        condition: 'rain',
      },
      {
        ...mildConditions,
        startsAt: '2026-09-01T10:00:00.000Z',
        endsAt: '2026-09-01T11:00:00.000Z',
      },
    ]);

    expect(result.score).toBe(100);
    expect(result.factors).toContainEqual({
      dimension: 'temperature',
      impact: 'positive',
      explanation: 'Temperature is within the 8-20 C comfort range.',
    });
    expect(result.rankedWindows.map((window) => window.startsAt)).toEqual([
      '2026-09-01T10:00:00.000Z',
      '2026-09-01T15:00:00.000Z',
    ]);
    expect(result.rankedWindows[1]?.score).toBe(71);
  });

  it('caps an extreme weather score at zero', () => {
    const result = recommendActivity(
      'beach',
      {
        temperatureC: -10,
        apparentTemperatureC: -20,
        humidityPercent: 100,
        precipitationProbability: 100,
        condition: 'thunderstorm',
        windSpeedKph: 70,
        uvIndex: 11,
        aqi: 250,
      },
      [],
    );

    expect(result.score).toBe(0);
    expect(result.factors.map((factor) => factor.dimension)).toEqual([
      'temperature',
      'feels-like',
      'humidity',
      'rain',
      'wind',
      'uv',
      'aqi',
    ]);
  });
});
