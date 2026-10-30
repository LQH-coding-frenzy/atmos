import 'server-only';
import { randomUUID } from 'node:crypto';
import type { LocationInput } from '@atmos/contracts';
import { createPublicWeatherRouteHandlers } from './weather-route-handlers';
import { publicWeatherCache } from './public-weather-cache';

export const publicWeatherRouteHandlers = createPublicWeatherRouteHandlers(publicWeatherCache);

export async function getPublicDashboard(input: LocationInput) {
  const result = await publicWeatherCache.getDashboard(input);
  const requestId = randomUUID();
  if (result.cacheReadErrorType) {
    console.warn(
      JSON.stringify({
        event: 'weather_dashboard_cache_read_failed',
        request_id: requestId,
        error_type: result.cacheReadErrorType,
      }),
    );
  }
  if (result.cacheWriteErrorType) {
    console.warn(
      JSON.stringify({
        event: 'weather_dashboard_cache_write_failed',
        request_id: requestId,
        error_type: result.cacheWriteErrorType,
      }),
    );
  }
  if (result.providerErrorType) {
    console.warn(
      JSON.stringify({
        event: 'weather_dashboard_provider_failed',
        request_id: requestId,
        cache_status: result.stale ? 'STALE' : 'MISS',
        error_type: result.providerErrorType,
      }),
    );
  }
  return {
    ...result.data,
    meta: { ...result.data.meta, cached: result.cached, stale: result.stale },
  };
}
