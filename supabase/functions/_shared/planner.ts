export type PlannerActivity =
  | 'running'
  | 'cycling'
  | 'hiking'
  | 'football'
  | 'photography'
  | 'beach'
  | 'commuting'
  | 'sightseeing'
  | 'picnic'
  | 'custom';

export type PlannerConditions = {
  temperatureC: number;
  apparentTemperatureC: number;
  humidityPercent: number;
  precipitationProbability: number;
  condition: 'clear' | 'partly-cloudy' | 'cloudy' | 'rain' | 'thunderstorm' | 'snow';
  windSpeedKph: number;
  uvIndex: number;
  aqi: number;
};

type PlannerFactor = {
  dimension: 'temperature' | 'feels-like' | 'humidity' | 'rain' | 'wind' | 'uv' | 'aqi';
  impact: 'positive' | 'negative';
  explanation: string;
};

export type PlannerWindow = PlannerConditions & {
  startsAt: string;
  endsAt: string;
};

export type PlannerRecommendation = {
  score: number;
  factors: PlannerFactor[];
  rankedWindows: Array<{
    startsAt: string;
    endsAt: string;
    score: number;
    factors: PlannerFactor[];
  }>;
};

const temperatureRanges: Record<PlannerActivity, readonly [number, number]> = {
  running: [8, 20],
  cycling: [8, 20],
  hiking: [10, 22],
  football: [8, 20],
  photography: [12, 25],
  beach: [22, 32],
  commuting: [5, 28],
  sightseeing: [12, 25],
  picnic: [16, 26],
  custom: [12, 25],
};

function rounded(value: number) {
  return Math.round(value);
}

function scoreConditions(activity: PlannerActivity, conditions: PlannerConditions) {
  const factors: PlannerFactor[] = [];
  const [minimumTemperature, maximumTemperature] = temperatureRanges[activity];
  let score = 100;

  const temperatureDistance = Math.max(
    minimumTemperature - conditions.temperatureC,
    conditions.temperatureC - maximumTemperature,
    0,
  );
  if (temperatureDistance === 0) {
    factors.push({
      dimension: 'temperature',
      impact: 'positive',
      explanation: `Temperature is within the ${minimumTemperature}-${maximumTemperature} C comfort range.`,
    });
  } else {
    score -= Math.min(30, temperatureDistance * 3);
    factors.push({
      dimension: 'temperature',
      impact: 'negative',
      explanation: "Temperature is outside this activity's comfort range.",
    });
  }

  const feelsLikeDifference = Math.abs(conditions.apparentTemperatureC - conditions.temperatureC);
  if (feelsLikeDifference > 2) {
    score -= Math.min(12, feelsLikeDifference * 2);
    factors.push({
      dimension: 'feels-like',
      impact: 'negative',
      explanation: 'Feels-like temperature differs noticeably from the measured temperature.',
    });
  }

  if (conditions.humidityPercent > 60) {
    score -= Math.min(10, (conditions.humidityPercent - 60) * 0.25);
    factors.push({
      dimension: 'humidity',
      impact: 'negative',
      explanation: 'Humidity is above the comfortable range.',
    });
  }

  const weatherPenalty =
    conditions.precipitationProbability * 0.35 +
    (conditions.condition === 'rain' ? 15 : 0) +
    (conditions.condition === 'thunderstorm' ? 25 : 0) +
    (conditions.condition === 'snow' ? 20 : 0);
  if (weatherPenalty > 0) {
    score -= Math.min(45, weatherPenalty);
    factors.push({
      dimension: 'rain',
      impact: 'negative',
      explanation: 'Precipitation risk reduces outdoor suitability.',
    });
  }

  if (conditions.windSpeedKph > 15) {
    score -= Math.min(15, (conditions.windSpeedKph - 15) * 0.75);
    factors.push({
      dimension: 'wind',
      impact: 'negative',
      explanation: 'Wind speed is above the comfortable range.',
    });
  }

  if (conditions.uvIndex > 5) {
    score -= Math.min(12, (conditions.uvIndex - 5) * 3);
    factors.push({
      dimension: 'uv',
      impact: 'negative',
      explanation: 'UV exposure is elevated.',
    });
  }

  if (conditions.aqi > 50) {
    score -= Math.min(15, (conditions.aqi - 50) * 0.3);
    factors.push({
      dimension: 'aqi',
      impact: 'negative',
      explanation: 'Air quality is below the preferred range.',
    });
  }

  return { score: Math.max(0, Math.min(100, rounded(score))), factors };
}

export function recommendActivity(
  activity: PlannerActivity,
  currentConditions: PlannerConditions,
  windows: readonly PlannerWindow[],
): PlannerRecommendation {
  const current = scoreConditions(activity, currentConditions);
  const rankedWindows = windows
    .map((window) => {
      const result = scoreConditions(activity, window);
      return {
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        ...result,
      };
    })
    .sort((left, right) => right.score - left.score || left.startsAt.localeCompare(right.startsAt));

  return { ...current, rankedWindows };
}
