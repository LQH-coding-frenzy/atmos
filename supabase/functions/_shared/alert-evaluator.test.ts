import { describe, expect, it } from 'vitest';
import { evaluateAlertConditions } from './alert-evaluator';

const facts = {
  temperature: 31,
  'feels-like': 33,
  'rain-probability': 20,
  rainfall: 0,
  snowfall: 0,
  wind: 18,
  gust: 30,
  uv: 7,
  aqi: 55,
  'pm2.5': 14,
  visibility: 10,
  thunderstorm: false,
  'freeze-risk': false,
  'extreme-heat': true,
  'provider-severe-weather-alert': false,
};

describe('evaluateAlertConditions', () => {
  it('triggers only when every threshold and occurrence condition matches', () => {
    expect(
      evaluateAlertConditions(
        [
          { metric: 'temperature', comparison: 'above', value: 30 },
          { metric: 'extreme-heat', expected: true },
        ],
        facts,
      ),
    ).toMatchObject({
      triggered: true,
      matched: [{ metric: 'temperature' }, { metric: 'extreme-heat' }],
    });
  });

  it('does not trigger a partial condition match', () => {
    expect(
      evaluateAlertConditions(
        [
          { metric: 'wind', comparison: 'above', value: 20 },
          { metric: 'extreme-heat', expected: true },
        ],
        facts,
      ),
    ).toMatchObject({ triggered: false, matched: [{ metric: 'extreme-heat' }] });
  });
});
