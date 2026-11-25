import type { LocationSearchResult } from '@atmos/contracts';

const openMeteoGeocodingBaseUrl = 'https://geocoding-api.open-meteo.com/v1/search';

export interface OpenMeteoQuotaLimits {
  minute: number;
  hour: number;
  day: number;
  month: number;
}

export const openMeteoQuotaLimits: OpenMeteoQuotaLimits = {
  minute: 600,
  hour: 5_000,
  day: 10_000,
  month: 300_000,
};

export type OpenMeteoQuotaWindow = keyof OpenMeteoQuotaLimits;

export type OpenMeteoFailureClass =
  | 'quota_exceeded'
  | 'timeout'
  | 'network_error'
  | 'upstream_3xx'
  | 'upstream_4xx'
  | 'upstream_5xx'
  | 'invalid_json'
  | 'invalid_response'
  | 'provider_error';

export type OpenMeteoProviderFailureClass = Exclude<
  OpenMeteoFailureClass,
  'quota_exceeded' | 'provider_error'
>;

const quotaWindowDurations: Record<OpenMeteoQuotaWindow, number> = {
  minute: 60_000,
  hour: 60 * 60_000,
  day: 24 * 60 * 60_000,
  month: 0,
};

export interface OpenMeteoUsageSnapshot {
  requests: Record<OpenMeteoQuotaWindow, number>;
  warnings: readonly OpenMeteoQuotaWindow[];
}

export class OpenMeteoQuotaError extends Error {
  readonly failureClass = 'quota_exceeded' as const;

  constructor(readonly window: OpenMeteoQuotaWindow) {
    super(`Open-Meteo ${window} quota exceeded`);
  }
}

const providerFailureMessages: Record<OpenMeteoProviderFailureClass, string> = {
  timeout: 'Open-Meteo request timed out',
  network_error: 'Open-Meteo request failed',
  upstream_3xx: 'Open-Meteo returned an unexpected redirect',
  upstream_4xx: 'Open-Meteo returned an unsuccessful HTTP response',
  upstream_5xx: 'Open-Meteo returned an unsuccessful HTTP response',
  invalid_json: 'Open-Meteo returned invalid JSON',
  invalid_response: 'Open-Meteo returned an invalid response',
};

export class OpenMeteoProviderError extends Error {
  constructor(
    readonly failureClass: OpenMeteoProviderFailureClass,
    safeMessage = providerFailureMessages[failureClass],
  ) {
    super(safeMessage);
    this.name = failureClass === 'timeout' ? 'AbortError' : 'OpenMeteoProviderError';
  }
}

export function openMeteoFailureClass(error: unknown): OpenMeteoFailureClass {
  if (error instanceof OpenMeteoQuotaError || error instanceof OpenMeteoProviderError) {
    return error.failureClass;
  }
  return 'provider_error';
}

function upstreamHttpFailureClass(status: number): OpenMeteoProviderFailureClass {
  if (status >= 500) return 'upstream_5xx';
  if (status >= 400) return 'upstream_4xx';
  if (status >= 300) return 'upstream_3xx';
  return 'invalid_response';
}

export async function fetchOpenMeteoJson(fetcher: typeof fetch, url: URL): Promise<unknown> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 5_000);

  try {
    const response = await fetcher(url, { signal: controller.signal });
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      throw new OpenMeteoProviderError(upstreamHttpFailureClass(response.status));
    }

    const body = await response.text();
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new OpenMeteoProviderError('invalid_json');
    }
  } catch (error) {
    if (error instanceof OpenMeteoProviderError) throw error;
    if (
      timedOut ||
      (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))
    ) {
      throw new OpenMeteoProviderError('timeout');
    }
    throw new OpenMeteoProviderError('network_error');
  } finally {
    clearTimeout(timeout);
  }
}

export class OpenMeteoUsageGuard {
  private requestTimestamps: number[] = [];

  constructor(
    private readonly limits: OpenMeteoQuotaLimits = openMeteoQuotaLimits,
    private readonly warningRatio = 0.7,
  ) {}

  reserve(now = Date.now(), callUnits = 1): OpenMeteoUsageSnapshot {
    if (!Number.isInteger(callUnits) || callUnits < 1 || callUnits > 100) {
      throw new Error('Invalid provider call weight');
    }
    this.prune(now);
    const nextTimestamps = [...this.requestTimestamps, ...Array<number>(callUnits).fill(now)];
    const requests = this.countRequests(nextTimestamps, now);

    for (const window of Object.keys(this.limits) as OpenMeteoQuotaWindow[]) {
      if (requests[window] > this.limits[window]) {
        throw new OpenMeteoQuotaError(window);
      }
    }

    this.requestTimestamps = nextTimestamps;
    return this.createSnapshot(requests);
  }

  snapshot(now = Date.now()): OpenMeteoUsageSnapshot {
    this.prune(now);
    const requests = this.countRequests(this.requestTimestamps, now);
    return this.createSnapshot(requests);
  }

  private createSnapshot(requests: Record<OpenMeteoQuotaWindow, number>): OpenMeteoUsageSnapshot {
    const warnings = (Object.keys(this.limits) as OpenMeteoQuotaWindow[]).filter(
      (window) => requests[window] >= this.limits[window] * this.warningRatio,
    );

    return { requests, warnings };
  }

  private prune(now: number) {
    this.requestTimestamps = this.requestTimestamps.filter((timestamp) =>
      this.isCurrentMonth(timestamp, now),
    );
  }

  private countRequests(timestamps: readonly number[], now: number) {
    return Object.fromEntries(
      (Object.keys(this.limits) as OpenMeteoQuotaWindow[]).map((window) => [
        window,
        timestamps.filter((timestamp) =>
          window === 'month'
            ? this.isCurrentMonth(timestamp, now)
            : timestamp > now - quotaWindowDurations[window],
        ).length,
      ]),
    ) as Record<OpenMeteoQuotaWindow, number>;
  }

  private isCurrentMonth(timestamp: number, now: number) {
    const requestDate = new Date(timestamp);
    const currentDate = new Date(now);
    return (
      requestDate.getUTCFullYear() === currentDate.getUTCFullYear() &&
      requestDate.getUTCMonth() === currentDate.getUTCMonth()
    );
  }
}

type OpenMeteoGeocodingResponse = {
  results?: Array<{
    id?: unknown;
    name?: unknown;
    country?: unknown;
    latitude?: unknown;
    longitude?: unknown;
    timezone?: unknown;
  }>;
};

/** Queries the Open-Meteo geocoding endpoint and normalizes valid city matches. */
export async function searchOpenMeteoLocations(
  query: string,
  fetcher: typeof fetch = fetch.bind(globalThis),
  usageGuard = new OpenMeteoUsageGuard(),
): Promise<LocationSearchResult[]> {
  usageGuard.reserve();
  const url = new URL(openMeteoGeocodingBaseUrl);
  url.searchParams.set('name', query);
  url.searchParams.set('count', '5');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');

  const responseData = await fetchOpenMeteoJson(fetcher, url);
  if (!responseData || typeof responseData !== 'object' || Array.isArray(responseData)) {
    throw new OpenMeteoProviderError(
      'invalid_response',
      'Open-Meteo geocoding response has an invalid shape',
    );
  }
  const data = responseData as OpenMeteoGeocodingResponse;
  if (data.results === undefined) return [];
  if (!Array.isArray(data.results)) {
    throw new OpenMeteoProviderError(
      'invalid_response',
      'Open-Meteo geocoding response has an invalid shape',
    );
  }
  return data.results
    .filter(
      (result) =>
        typeof result.id === 'number' &&
        typeof result.name === 'string' &&
        typeof result.latitude === 'number' &&
        typeof result.longitude === 'number' &&
        typeof result.timezone === 'string' &&
        typeof result.country === 'string',
    )
    .map((result) => ({
      id: String(result.id),
      name: result.name as string,
      country: result.country as string,
      latitude: result.latitude as number,
      longitude: result.longitude as number,
      timezone: result.timezone as string,
    }));
}
