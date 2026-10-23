import { timingSafeEqual } from 'node:crypto';
import {
  airQualityInputSchema,
  airQualitySchema,
  dashboardSchema,
  locationInputSchema,
  type AirQualityProvider,
  type WeatherProvider,
} from '@atmos/contracts';

const requestBodyLimitBytes = 2_048;
const timezonePattern = /^[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)*$/;
const requestIdPattern = /^[A-Za-z0-9_-]{1,64}$/;
const serviceTokenPrefix = 'Bearer ';
const minimumServiceTokenLength = 32;

type WeatherRequestError = {
  code: 'INVALID_REQUEST' | 'REQUEST_TOO_LARGE';
  status: 400 | 413;
};

type WeatherRouteProvider = Pick<WeatherProvider, 'getDashboard'> &
  Partial<Pick<AirQualityProvider, 'getAirQuality'>>;

function routeRequestId(request: Request) {
  const candidate = request.headers.get('x-request-id');
  return candidate && requestIdPattern.test(candidate) ? candidate : crypto.randomUUID();
}

function errorResponse(
  requestId: string,
  code: string,
  message: string,
  status: 400 | 401 | 413 | 503,
) {
  return Response.json(
    { error: { code, message, request_id: requestId } },
    { status, headers: { 'cache-control': 'no-store', 'x-request-id': requestId } },
  );
}

function isAuthorized(request: Request, expectedToken: string | undefined) {
  if (!expectedToken || expectedToken.length < minimumServiceTokenLength) return false;
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith(serviceTokenPrefix)) return false;

  const received = Buffer.from(authorization.slice(serviceTokenPrefix.length));
  const expected = Buffer.from(expectedToken);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

async function readJsonBody(request: Request): Promise<unknown> {
  const contentLength = request.headers.get('content-length');
  if (
    contentLength &&
    /^\d+$/.test(contentLength) &&
    Number(contentLength) > requestBodyLimitBytes
  ) {
    throw { code: 'REQUEST_TOO_LARGE', status: 413 } satisfies WeatherRequestError;
  }

  if (!request.body) throw { code: 'INVALID_REQUEST', status: 400 } satisfies WeatherRequestError;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > requestBodyLimitBytes) {
      await reader.cancel().catch(() => undefined);
      throw { code: 'REQUEST_TOO_LARGE', status: 413 } satisfies WeatherRequestError;
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
    throw { code: 'INVALID_REQUEST', status: 400 } satisfies WeatherRequestError;
  }
}

function bodyErrorResponse(requestId: string, error: unknown) {
  const bodyError = error as Partial<WeatherRequestError>;
  if (bodyError.code === 'REQUEST_TOO_LARGE') {
    return errorResponse(requestId, 'REQUEST_TOO_LARGE', 'The weather request is too large.', 413);
  }
  return errorResponse(requestId, 'INVALID_REQUEST', 'A valid weather request is required.', 400);
}

function logProviderFailure(
  requestId: string,
  resource: 'dashboard' | 'air_quality',
  error: unknown,
) {
  console.warn(
    JSON.stringify({
      event: `weather_${resource}_provider_failed`,
      request_id: requestId,
      error_type: error instanceof Error ? error.name : 'unknown',
    }),
  );
}

export function createWeatherRouteHandlers(provider: WeatherRouteProvider, expectedToken?: string) {
  async function dashboard(request: Request) {
    const requestId = routeRequestId(request);
    if (!isAuthorized(request, expectedToken)) {
      return errorResponse(
        requestId,
        'UNAUTHORIZED',
        'A valid service credential is required.',
        401,
      );
    }

    let body: unknown;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      return bodyErrorResponse(requestId, error);
    }

    const parsedInput = locationInputSchema.strict().safeParse(body);
    if (
      !parsedInput.success ||
      parsedInput.data.timezone.length > 64 ||
      !timezonePattern.test(parsedInput.data.timezone)
    ) {
      return errorResponse(
        requestId,
        'INVALID_LOCATION',
        'Valid latitude, longitude, timezone, and units are required.',
        400,
      );
    }

    try {
      const result = await provider.getDashboard(parsedInput.data);
      const parsedResult = dashboardSchema.safeParse(result);
      if (!parsedResult.success) throw new Error('Weather response did not match its contract');
      return Response.json(parsedResult.data, {
        headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
      });
    } catch (error) {
      logProviderFailure(requestId, 'dashboard', error);
      return errorResponse(
        requestId,
        'WEATHER_UNAVAILABLE',
        'Weather is temporarily unavailable.',
        503,
      );
    }
  }

  async function airQuality(request: Request) {
    const requestId = routeRequestId(request);
    if (!isAuthorized(request, expectedToken)) {
      return errorResponse(
        requestId,
        'UNAUTHORIZED',
        'A valid service credential is required.',
        401,
      );
    }

    let body: unknown;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      return bodyErrorResponse(requestId, error);
    }

    const parsedInput = airQualityInputSchema.strict().safeParse(body);
    if (!parsedInput.success) {
      return errorResponse(
        requestId,
        'INVALID_LOCATION',
        'Valid latitude and longitude are required.',
        400,
      );
    }
    if (!provider.getAirQuality) {
      return errorResponse(
        requestId,
        'AIR_QUALITY_UNAVAILABLE',
        'Air quality is temporarily unavailable.',
        503,
      );
    }

    try {
      const result = await provider.getAirQuality(parsedInput.data);
      const parsedResult = airQualitySchema.safeParse(result);
      if (
        !parsedResult.success ||
        (parsedInput.data.includeTimeline === true && !parsedResult.data.timeline)
      ) {
        throw new Error('Air-quality response did not match its contract');
      }
      return Response.json(parsedResult.data, {
        headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
      });
    } catch (error) {
      logProviderFailure(requestId, 'air_quality', error);
      return errorResponse(
        requestId,
        'AIR_QUALITY_UNAVAILABLE',
        'Air quality is temporarily unavailable.',
        503,
      );
    }
  }

  return { dashboard, airQuality };
}
