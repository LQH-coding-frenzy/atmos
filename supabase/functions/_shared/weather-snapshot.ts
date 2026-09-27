const weatherConditions = new Set([
  'clear',
  'partly-cloudy',
  'cloudy',
  'rain',
  'thunderstorm',
  'snow',
]);
const maximumSnapshotAgeMs = 24 * 60 * 60 * 1000;

type RecordValue = Record<string, unknown>;

export type WeatherSnapshotInsert = {
  user_id: string;
  latitude: number;
  longitude: number;
  observed_at: string;
  provider: 'open-meteo';
  payload: {
    location_name: string;
    temperature_c: number;
    apparent_temperature_c: number;
    humidity_percent: number;
    wind_speed_kph: number;
    pressure_hpa: number;
    condition: string;
  };
};

export type WeatherHistoryQuery = {
  latitude: number;
  longitude: number;
  days: 7 | 30 | 90;
};

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function parseWeatherHistoryQuery(
  latitudeValue: string | undefined,
  longitudeValue: string | undefined,
  daysValue: string | undefined,
): WeatherHistoryQuery | undefined {
  if (!latitudeValue?.trim() || !longitudeValue?.trim()) return undefined;
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  const days = daysValue === undefined ? 30 : Number(daysValue);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    (days !== 7 && days !== 30 && days !== 90)
  ) {
    return undefined;
  }
  return { latitude, longitude, days };
}

export function parseWeatherSnapshotInsert(
  value: unknown,
  userId: string,
  now = Date.now(),
): WeatherSnapshotInsert | undefined {
  if (!isRecord(value)) return undefined;
  const {
    latitude,
    longitude,
    observed_at: observedAt,
    location_name: locationName,
    temperatureC,
    apparentTemperatureC,
    humidityPercent,
    windSpeedKph,
    pressureHpa,
    condition,
  } = value;
  if (
    !isFiniteNumber(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !isFiniteNumber(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    typeof observedAt !== 'string' ||
    observedAt.length > 40 ||
    !Number.isFinite(Date.parse(observedAt)) ||
    new Date(observedAt).toISOString() !== observedAt ||
    Date.parse(observedAt) > now + 5 * 60_000 ||
    Date.parse(observedAt) < now - maximumSnapshotAgeMs ||
    typeof locationName !== 'string' ||
    locationName.trim().length < 1 ||
    locationName.trim().length > 80 ||
    !isFiniteNumber(temperatureC) ||
    temperatureC < -150 ||
    temperatureC > 100 ||
    !isFiniteNumber(apparentTemperatureC) ||
    apparentTemperatureC < -150 ||
    apparentTemperatureC > 100 ||
    !isFiniteNumber(humidityPercent) ||
    humidityPercent < 0 ||
    humidityPercent > 100 ||
    !isFiniteNumber(windSpeedKph) ||
    windSpeedKph < 0 ||
    windSpeedKph > 500 ||
    !isFiniteNumber(pressureHpa) ||
    pressureHpa <= 0 ||
    pressureHpa > 1500 ||
    typeof condition !== 'string' ||
    !weatherConditions.has(condition)
  ) {
    return undefined;
  }

  return {
    user_id: userId,
    latitude,
    longitude,
    observed_at: observedAt,
    provider: 'open-meteo',
    payload: {
      location_name: locationName.trim(),
      temperature_c: temperatureC,
      apparent_temperature_c: apparentTemperatureC,
      humidity_percent: humidityPercent,
      wind_speed_kph: windSpeedKph,
      pressure_hpa: pressureHpa,
      condition,
    },
  };
}
