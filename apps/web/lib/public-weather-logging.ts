import type { OpenMeteoFailureClass } from '@atmos/provider-openmeteo';

export function dashboardProviderFailureLogLine(
  requestId: string,
  failureClass: OpenMeteoFailureClass,
  cacheStatus: 'MISS' | 'STALE',
) {
  return JSON.stringify({
    event: 'weather_dashboard_provider_failed',
    request_id: requestId,
    cache_status: cacheStatus,
    failure_class: failureClass,
  });
}
