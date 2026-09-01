import type { UnitSystem } from '@atmos/contracts';

export function formatTemperature(temperatureC: number, units: UnitSystem): string {
  if (units === 'imperial') {
    return `${Math.round((temperatureC * 9) / 5 + 32)} deg`;
  }

  return `${Math.round(temperatureC)} deg`;
}

export function formatWindSpeed(windKph: number, units: UnitSystem): string {
  if (units === 'imperial') {
    return `${Math.round(windKph * 0.621371)} mph`;
  }

  return `${Math.round(windKph)} km/h`;
}
