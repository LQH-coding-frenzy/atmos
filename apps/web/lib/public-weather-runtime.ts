import 'server-only';
import { randomUUID } from 'node:crypto';
import type { LocationInput } from '@atmos/contracts';
import { openMeteoFailureClass } from '@atmos/provider-openmeteo';
import { createPublicWeatherRouteHandlers } from './weather-route-handlers';
import { publicWeatherCache } from './public-weather-cache';
import { dashboardProviderFailureLogLine } from './public-weather-logging';

export const publicWeatherRouteHandlers = createPublicWeatherRouteHandlers(publicWeatherCache);

export async function getPublicDashboard(input: LocationInput) {
  const requestId = randomUUID();
  const result = await publicWeatherCache.getDashboard(input).catch((error: unknown) => {
    console.warn(dashboardProviderFailureLogLine(requestId, openMeteoFailureClass(error), 'MISS'));
    throw error;
  });
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
  if (result.providerFailureClass) {
    console.warn(
      dashboardProviderFailureLogLine(
        requestId,
        result.providerFailureClass,
        result.stale ? 'STALE' : 'MISS',
      ),
    );
  }
  return {
    ...result.data,
    meta: { ...result.data.meta, cached: result.cached, stale: result.stale },
  };
}
