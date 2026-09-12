export type RequestAnalyticsDataset = {
  writeDataPoint(point: { indexes: string[]; blobs: string[]; doubles: number[] }): void;
};

export type AnalyticsProvider = 'cache' | 'cloudflare-queue' | 'none' | 'open-meteo' | 'supabase';

type RequestAnalyticsInput = {
  workerVersionId?: string;
  releaseId?: string;
  routeGroup: string;
  status: number;
  cacheStatus?: string;
  backendRelease: string;
  provider: AnalyticsProvider;
  wallDurationMs: number;
  providerDurationMs?: number;
};

function boundedIdentifier(value: string | undefined) {
  return value && /^[A-Za-z0-9._-]{1,64}$/.test(value) ? value : 'unknown';
}

function boundedDuration(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.min(60_000, Math.max(0, value));
}

function statusClass(status: number) {
  return status >= 100 && status <= 599 ? `${Math.floor(status / 100)}xx` : 'unknown';
}

function cacheStatus(value: string | undefined) {
  const normalized = value?.toUpperCase();
  return normalized === 'HIT' || normalized === 'MISS' || normalized === 'STALE'
    ? normalized
    : 'BYPASS';
}

export function requestRouteGroup(method: string, path: string) {
  if (path === '/health') return 'health';
  if (path === '/health/dependencies') return 'health_dependencies';
  if (path === '/version') return 'version';
  if (path === '/api/v1/weather/dashboard') return 'weather_dashboard';
  if (path === '/internal/notifications/publish') return 'notification_publish';
  if (path.startsWith('/api/')) return 'api_proxy';
  return method === 'OPTIONS' ? 'preflight_other' : 'not_found';
}

export function backendReleaseFromUrl(value: string | undefined) {
  if (!value) return 'none';
  try {
    const functionName = new URL(value).pathname.split('/').filter(Boolean).at(-1);
    const match = /^api-([0-9a-f]{12}|v1)$/.exec(functionName ?? '');
    return match?.[1] ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export function canonicalReleaseId(...values: Array<string | undefined>) {
  return values.find((value): value is string => /^[0-9a-f]{12}$/.test(value ?? ''));
}

export function recordRequestAnalytics(
  dataset: RequestAnalyticsDataset | undefined,
  input: RequestAnalyticsInput,
) {
  if (!dataset) return;
  try {
    dataset.writeDataPoint({
      indexes: [boundedIdentifier(input.workerVersionId)],
      blobs: [
        canonicalReleaseId(input.releaseId) ?? 'unknown',
        input.routeGroup,
        statusClass(input.status),
        cacheStatus(input.cacheStatus),
        input.backendRelease,
        input.provider,
      ],
      doubles: [
        boundedDuration(input.wallDurationMs),
        input.status >= 500 ? 1 : 0,
        boundedDuration(input.providerDurationMs),
      ],
    });
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'request_analytics_write_failed',
        error_type: error instanceof Error ? error.name : 'unknown',
      }),
    );
  }
}
