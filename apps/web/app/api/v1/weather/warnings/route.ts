import { severeWeatherRequestSchema, severeWeatherResponseSchema } from '@atmos/contracts';
import {
  getCachedOfficialWarnings,
  officialWarningFailureCode,
  warningSourceForCountry,
} from '../../../../../lib/official-warnings';

export const runtime = 'nodejs';

const requestBodyLimitBytes = 2_048;
const upstreamRevalidateSeconds = 60;

type BoundedBodyError = { code: 'INVALID_REQUEST' | 'REQUEST_TOO_LARGE'; status: 400 | 413 };
type NextRequestInit = RequestInit & { next?: { revalidate?: number } };

async function readRequestBody(request: Request): Promise<unknown> {
  const contentLength = request.headers.get('content-length');
  if (
    contentLength &&
    /^\d+$/.test(contentLength) &&
    Number(contentLength) > requestBodyLimitBytes
  ) {
    throw { code: 'REQUEST_TOO_LARGE', status: 413 } satisfies BoundedBodyError;
  }

  if (!request.body) throw { code: 'INVALID_REQUEST', status: 400 } satisfies BoundedBodyError;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > requestBodyLimitBytes) {
      await reader.cancel().catch(() => undefined);
      throw { code: 'REQUEST_TOO_LARGE', status: 413 } satisfies BoundedBodyError;
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
    throw { code: 'INVALID_REQUEST', status: 400 } satisfies BoundedBodyError;
  }
}

function errorResponse(requestId: string, code: string, message: string, status: 400 | 413 | 503) {
  return Response.json(
    { error: { code, message, request_id: requestId } },
    { status, headers: { 'cache-control': 'no-store', 'x-request-id': requestId } },
  );
}

const nextCachedFetch: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    cache: 'force-cache',
    next: { revalidate: upstreamRevalidateSeconds },
  } as NextRequestInit);

export async function POST(request: Request) {
  const suppliedRequestId = request.headers.get('x-request-id');
  const requestId =
    suppliedRequestId && /^[A-Za-z0-9_-]{1,64}$/.test(suppliedRequestId)
      ? suppliedRequestId
      : crypto.randomUUID();
  let body: unknown;
  try {
    body = await readRequestBody(request);
  } catch (error) {
    const boundedError = error as Partial<BoundedBodyError>;
    if (boundedError.code === 'REQUEST_TOO_LARGE') {
      return errorResponse(
        requestId,
        'REQUEST_TOO_LARGE',
        'The warning request is too large.',
        413,
      );
    }
    return errorResponse(
      requestId,
      'INVALID_REQUEST',
      'A valid warning location is required.',
      400,
    );
  }

  const parsedInput = severeWeatherRequestSchema.safeParse(body);
  if (!parsedInput.success) {
    return errorResponse(
      requestId,
      'INVALID_LOCATION',
      'Valid latitude, longitude, and country values are required.',
      400,
    );
  }

  const input = parsedInput.data;
  const source = warningSourceForCountry(input.country);
  if (!source) {
    const response = severeWeatherResponseSchema.parse({
      coverage: 'unsupported',
      source: null,
      alerts: [],
      meta: {
        checkedAt: new Date().toISOString(),
        cached: false,
        stale: false,
        truncated: false,
      },
    });
    return Response.json(response, {
      headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
    });
  }

  try {
    const result = await getCachedOfficialWarnings(source, input, nextCachedFetch);
    const response = severeWeatherResponseSchema.safeParse({
      coverage: result.coverage,
      source: result.source,
      alerts: result.alerts,
      meta: result.meta,
    });
    if (!response.success) throw new Error('Official warning response did not match its contract');
    return Response.json(response.data, {
      headers: {
        'cache-control': 'no-store',
        'x-request-id': requestId,
      },
    });
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'weather_warning_provider_failed',
        request_id: requestId,
        provider: source,
        failure_code: officialWarningFailureCode(error, source),
      }),
    );
    return errorResponse(
      requestId,
      'WARNINGS_UNAVAILABLE',
      'Official warning data is temporarily unavailable.',
      503,
    );
  }
}
