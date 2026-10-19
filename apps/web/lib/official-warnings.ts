import type {
  SevereWeatherAlert,
  SevereWeatherResponse,
  SevereWeatherSource,
} from '@atmos/contracts';

// Server-side adapters for the approved public warning feeds.
export type OfficialWarningInput = {
  latitude: number;
  longitude: number;
};

export const officialWarningResultLimit = 20;
export const officialWarningResponseLimitBytes = 384 * 1024;
const warningUserAgent = 'AtmosWeather/1.0 (+https://github.com/LQH-coding-frenzy/atmos)';
const nwsAlertsUrl = 'https://api.weather.gov/alerts/active';
const ecccAlertsUrl = 'https://api.weather.gc.ca/collections/weather-alerts/items';
const warningFreshTtlMilliseconds = 60_000;
const warningStaleTtlMilliseconds = 300_000;
const warningCacheMaximumEntries = 128;

type JsonRecord = Record<string, unknown>;
type OfficialWarningResult = Pick<SevereWeatherResponse, 'coverage' | 'source' | 'alerts' | 'meta'>;
type OfficialWarningCacheEntry = {
  result: OfficialWarningResult;
  freshUntil: number;
  staleUntil: number;
};

const officialWarningCache = new Map<string, OfficialWarningCacheEntry>();
const officialWarningInFlight = new Map<string, Promise<OfficialWarningResult>>();

class OfficialWarningError extends Error {
  constructor(
    readonly failureCode: string,
    message: string,
  ) {
    super(message);
    this.name = 'OfficialWarningError';
  }
}

export function officialWarningFailureCode(error: unknown, source: SevereWeatherSource) {
  if (error instanceof OfficialWarningError) return error.failureCode;
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return 'timeout';
  }
  if (error instanceof Error && error.message === 'Official warning provider returned an error') {
    return `${source}_alerts_http_error`;
  }
  return 'provider_error';
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, maximumLength: number, field: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > maximumLength) {
    throw new OfficialWarningError(
      'invalid_source_field',
      `Official warning field ${field} is invalid`,
    );
  }
  return value;
}

function requiredText(value: unknown, maximumLength: number, field: string): string {
  const result = text(value, maximumLength, field);
  if (result === null || !result.trim())
    throw new OfficialWarningError(
      'missing_source_field',
      `Official warning field ${field} is missing`,
    );
  return result;
}

function officialNwsUrl(value: unknown) {
  if (typeof value !== 'string') return 'https://www.weather.gov/alerts';
  try {
    const url = new URL(value);
    if (
      url.protocol === 'https:' &&
      url.hostname === 'api.weather.gov' &&
      url.pathname.startsWith('/alerts/')
    ) {
      return url.toString();
    }
  } catch {
    // A source-provided link is never returned unless it has the exact official origin.
  }
  return 'https://www.weather.gov/alerts';
}

function sourceAlertUrl(id: string) {
  return `https://api.weather.gc.ca/collections/weather-alerts/items/${encodeURIComponent(id)}?f=json`;
}

function dateField(properties: JsonRecord, field: string) {
  return text(properties[field], 64, field);
}

function normalizeNwsAlert(value: unknown): SevereWeatherAlert {
  if (!isRecord(value) || !isRecord(value.properties)) {
    throw new OfficialWarningError(
      'invalid_nws_feature',
      'NWS warning feature has an invalid shape',
    );
  }
  const properties = value.properties;
  const id = requiredText(value.id ?? properties.id ?? properties['@id'], 1024, 'id');
  return {
    id,
    event: requiredText(properties.event, 512, 'event'),
    headline: text(properties.headline, 2048, 'headline'),
    severity: text(properties.severity, 128, 'severity'),
    urgency: text(properties.urgency, 128, 'urgency'),
    certainty: text(properties.certainty, 128, 'certainty'),
    area: text(properties.areaDesc, 16_384, 'areaDesc') ?? '',
    publishedAt: dateField(properties, 'sent'),
    effectiveAt: dateField(properties, 'effective'),
    onsetAt: dateField(properties, 'onset'),
    expiresAt: dateField(properties, 'expires'),
    endsAt: dateField(properties, 'ends'),
    description: text(properties.description, 32_768, 'description'),
    instruction: text(properties.instruction, 16_384, 'instruction'),
    sourceUrl: officialNwsUrl(value.id ?? properties['@id']),
  };
}

function normalizeEcccAlert(value: unknown): SevereWeatherAlert {
  if (!isRecord(value) || !isRecord(value.properties)) {
    throw new OfficialWarningError(
      'invalid_eccc_feature',
      'ECCC warning feature has an invalid shape',
    );
  }
  const properties = value.properties;
  const id = requiredText(value.id, 1024, 'id');
  return {
    id,
    event: requiredText(properties.alert_name_en ?? properties.alert_type, 512, 'alert_name_en'),
    headline: text(properties.alert_short_name_en, 2048, 'alert_short_name_en'),
    severity: text(properties.risk_colour_en, 128, 'risk_colour_en'),
    urgency: null,
    certainty: null,
    area:
      text(properties.feature_name_en, 16_384, 'feature_name_en') ??
      text(properties.province, 16_384, 'province') ??
      '',
    publishedAt: dateField(properties, 'publication_datetime'),
    effectiveAt: dateField(properties, 'validity_datetime'),
    onsetAt: null,
    expiresAt: dateField(properties, 'expiration_datetime'),
    endsAt: dateField(properties, 'event_end_datetime'),
    description: text(properties.alert_text_en, 32_768, 'alert_text_en'),
    instruction: null,
    sourceUrl: sourceAlertUrl(id),
  };
}

function normalizeFeatures(
  payload: unknown,
  source: SevereWeatherSource,
): { alerts: SevereWeatherAlert[]; truncated: boolean } {
  if (!isRecord(payload) || !Array.isArray(payload.features)) {
    throw new OfficialWarningError(
      'invalid_feature_collection',
      'Official warning response is not a feature collection',
    );
  }

  const features = payload.features;
  if (features.length > 10_000) {
    throw new OfficialWarningError(
      'feature_count_limit',
      'Official warning feature count is invalid',
    );
  }
  const alerts = features
    .slice(0, officialWarningResultLimit)
    .map((feature) =>
      source === 'nws' ? normalizeNwsAlert(feature) : normalizeEcccAlert(feature),
    );
  const matched = typeof payload.numberMatched === 'number' ? payload.numberMatched : undefined;
  return {
    alerts,
    truncated: features.length >= officialWarningResultLimit || (matched ?? 0) > alerts.length,
  };
}

async function boundedJson(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength && /^\d+$/.test(declaredLength)) {
    if (Number(declaredLength) > officialWarningResponseLimitBytes) {
      await response.body?.cancel().catch(() => undefined);
      throw new OfficialWarningError(
        'response_too_large',
        'Official warning response exceeded the size limit',
      );
    }
  }

  if (!response.body) {
    throw new OfficialWarningError('empty_response', 'Official warning response has no body');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > officialWarningResponseLimitBytes) {
      await reader.cancel().catch(() => undefined);
      throw new OfficialWarningError(
        'response_too_large',
        'Official warning response exceeded the size limit',
      );
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new OfficialWarningError('invalid_json', 'Official warning response was not valid JSON');
  }
}

function roundCoordinate(value: number) {
  return Number(value.toFixed(3));
}

export function warningSourceForCountry(country: string): SevereWeatherSource | undefined {
  const normalized = country.trim().toLocaleLowerCase('en-US');
  if (normalized === 'united states' || normalized === 'united states of america') return 'nws';
  if (normalized === 'canada') return 'eccc';
  return undefined;
}

export function normalizedWarningCoordinates(input: OfficialWarningInput) {
  return {
    latitude: roundCoordinate(input.latitude),
    longitude: roundCoordinate(input.longitude),
  };
}

export function officialWarningCacheKey(source: SevereWeatherSource, input: OfficialWarningInput) {
  const { latitude, longitude } = normalizedWarningCoordinates(input);
  return `${source}:${latitude}:${longitude}`;
}

function withCacheState(
  result: OfficialWarningResult,
  cached: boolean,
  stale: boolean,
): OfficialWarningResult {
  return {
    ...result,
    meta: { ...result.meta, cached, stale },
  };
}

function storeOfficialWarningResult(key: string, result: OfficialWarningResult, now: number) {
  officialWarningCache.delete(key);
  officialWarningCache.set(key, {
    result: withCacheState(result, true, false),
    freshUntil: now + warningFreshTtlMilliseconds,
    staleUntil: now + warningStaleTtlMilliseconds,
  });
  if (officialWarningCache.size > warningCacheMaximumEntries) {
    const oldestKey = officialWarningCache.keys().next().value;
    if (oldestKey !== undefined) officialWarningCache.delete(oldestKey);
  }
}

export async function getCachedOfficialWarnings(
  source: SevereWeatherSource,
  input: OfficialWarningInput,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<OfficialWarningResult> {
  const key = officialWarningCacheKey(source, input);
  const currentTime = now();
  const previous = officialWarningCache.get(key);
  if (previous && currentTime < previous.freshUntil) {
    officialWarningCache.delete(key);
    officialWarningCache.set(key, previous);
    return withCacheState(previous.result, true, false);
  }
  if (previous && currentTime >= previous.staleUntil) officialWarningCache.delete(key);

  const inFlight = officialWarningInFlight.get(key);
  if (inFlight) return inFlight;

  const staleEntry = previous && currentTime < previous.staleUntil ? previous : undefined;
  const pending = fetchOfficialWarnings(source, input, fetcher)
    .then((result) => {
      storeOfficialWarningResult(key, result, now());
      return result;
    })
    .catch((error: unknown) => {
      if (staleEntry && now() < staleEntry.staleUntil) {
        return withCacheState(staleEntry.result, true, true);
      }
      throw error;
    })
    .finally(() => officialWarningInFlight.delete(key));
  officialWarningInFlight.set(key, pending);
  return pending;
}

export async function fetchOfficialWarnings(
  source: SevereWeatherSource,
  input: OfficialWarningInput,
  fetcher: typeof fetch = fetch,
): Promise<Pick<SevereWeatherResponse, 'coverage' | 'source' | 'alerts' | 'meta'>> {
  const { latitude, longitude } = normalizedWarningCoordinates(input);
  const headers = new Headers({
    accept: 'application/geo+json, application/json',
    'user-agent': warningUserAgent,
  });
  let url: URL;

  if (source === 'nws') {
    const pointsUrl = new URL(`https://api.weather.gov/points/${latitude},${longitude}`);
    const pointsResponse = await fetcher(pointsUrl, {
      headers,
      signal: AbortSignal.timeout(3_500),
    });
    if (pointsResponse.status === 404) {
      return {
        coverage: 'unsupported',
        source: null,
        alerts: [],
        meta: {
          checkedAt: new Date().toISOString(),
          cached: false,
          stale: false,
          truncated: false,
        },
      };
    }
    if (!pointsResponse.ok) {
      throw new OfficialWarningError(
        `nws_points_http_${pointsResponse.status}`,
        'NWS point lookup returned an error',
      );
    }
    const pointsPayload = await boundedJson(pointsResponse);
    if (!isRecord(pointsPayload) || !isRecord(pointsPayload.properties)) {
      throw new OfficialWarningError('nws_points_shape', 'NWS point lookup had an invalid shape');
    }
    requiredText(pointsPayload.properties.cwa, 16, 'cwa');

    url = new URL(nwsAlertsUrl);
    url.searchParams.set('point', `${latitude},${longitude}`);
  } else {
    url = new URL(ecccAlertsUrl);
    url.searchParams.set('filter', `INTERSECTS(geometry, POINT(${longitude} ${latitude}))`);
    url.searchParams.set('limit', String(officialWarningResultLimit));
    url.searchParams.set(
      'properties',
      [
        'alert_type',
        'alert_name_en',
        'alert_short_name_en',
        'publication_datetime',
        'expiration_datetime',
        'validity_datetime',
        'event_end_datetime',
        'alert_text_en',
        'risk_colour_en',
        'feature_name_en',
        'province',
      ].join(','),
    );
    url.searchParams.set('f', 'json');
  }

  const response = await fetcher(url, {
    headers,
    signal: AbortSignal.timeout(3_500),
  });
  if (!response.ok) {
    throw new OfficialWarningError(
      `${source}_alerts_http_${response.status}`,
      'Official warning provider returned an error',
    );
  }

  const payload = await boundedJson(response);
  const { alerts, truncated } = normalizeFeatures(payload, source);
  return {
    coverage: 'supported',
    source,
    alerts,
    meta: {
      checkedAt: new Date().toISOString(),
      cached: false,
      stale: false,
      truncated,
    },
  };
}
