import type { AirQualityInput, LocationInput } from '@atmos/contracts';
import { requestCorrelationHeaders } from './version-affinity';

type PublicWeatherRequestOptions = {
  signal?: AbortSignal;
};

function postPublicWeather(
  path: '/api/public/v1/weather/dashboard' | '/api/public/v1/weather/air-quality',
  input: LocationInput | AirQualityInput,
  options: PublicWeatherRequestOptions = {},
) {
  return fetch(path, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      ...requestCorrelationHeaders(),
    },
    body: JSON.stringify(input),
    signal: options.signal,
  });
}

export function fetchPublicDashboard(input: LocationInput, options?: PublicWeatherRequestOptions) {
  return postPublicWeather('/api/public/v1/weather/dashboard', input, options);
}

export function fetchPublicAirQuality(
  input: AirQualityInput,
  options?: PublicWeatherRequestOptions,
) {
  return postPublicWeather('/api/public/v1/weather/air-quality', input, options);
}
