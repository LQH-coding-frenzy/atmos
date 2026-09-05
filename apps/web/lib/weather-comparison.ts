import type { CurrentWeather, Location } from '@atmos/contracts';

export type WeatherComparison = {
  location: Location;
  current: CurrentWeather;
  temperatureDeltaC: number;
  windDeltaKph: number;
};

// Temporary FEAT-CMP-001 fixture. Keep the comparison data at this boundary until
// saved locations and live provider comparison requests are available.
export const mockComparisonLocation: Location = {
  id: 'madrid-es',
  name: 'Madrid',
  country: 'Spain',
  latitude: 40.4168,
  longitude: -3.7038,
  timezone: 'Europe/Madrid',
};

export const mockComparisonCurrent: CurrentWeather = {
  observedAt: '2026-09-01T10:00:00.000Z',
  temperatureC: 26,
  apparentTemperatureC: 25,
  humidityPercent: 42,
  windSpeedKph: 9,
  pressureHpa: 1015,
  condition: 'clear',
};

export function compareWeather(location: Location, current: CurrentWeather): WeatherComparison {
  return {
    location,
    current,
    temperatureDeltaC:
      Math.round((current.temperatureC - mockComparisonCurrent.temperatureC) * 10) / 10,
    windDeltaKph: Math.round((current.windSpeedKph - mockComparisonCurrent.windSpeedKph) * 10) / 10,
  };
}
