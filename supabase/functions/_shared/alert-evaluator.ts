export type AlertCondition =
  | {
      metric:
        | 'temperature'
        | 'feels-like'
        | 'rain-probability'
        | 'rainfall'
        | 'snowfall'
        | 'wind'
        | 'gust'
        | 'uv'
        | 'aqi'
        | 'pm2.5'
        | 'visibility';
      comparison: 'above' | 'below';
      value: number;
    }
  | {
      metric: 'thunderstorm' | 'freeze-risk' | 'extreme-heat' | 'provider-severe-weather-alert';
      expected: true;
    };

export type AlertWeatherFacts = Record<
  Exclude<
    AlertCondition['metric'],
    'thunderstorm' | 'freeze-risk' | 'extreme-heat' | 'provider-severe-weather-alert'
  >,
  number
> &
  Record<
    'thunderstorm' | 'freeze-risk' | 'extreme-heat' | 'provider-severe-weather-alert',
    boolean
  >;

export function evaluateAlertConditions(
  conditions: readonly AlertCondition[],
  facts: AlertWeatherFacts,
): { triggered: boolean; matched: AlertCondition[] } {
  const matched = conditions.filter((condition) => {
    const fact = facts[condition.metric];
    if ('expected' in condition) return fact === condition.expected;
    return condition.comparison === 'above' ? fact > condition.value : fact < condition.value;
  });

  return { triggered: conditions.length > 0 && matched.length === conditions.length, matched };
}
