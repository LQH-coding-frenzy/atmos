export type HttpServerSpanInput = {
  traceparent: string;
  method: string;
  route: string;
  statusCode: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  releaseId?: string;
};

type OtlpAttribute = {
  key: string;
  value: { stringValue?: string; intValue?: string };
};

const traceparentPattern = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
const uuidPathSegment =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const releaseIdPattern = /^[A-Za-z0-9._-]{1,64}$/;

function safeMethod(method: string) {
  const normalized = method.toUpperCase();
  return /^[A-Z]{1,16}$/.test(normalized) ? normalized : 'OTHER';
}

function safeRoute(route: string) {
  const path = route.split(/[?#]/, 1)[0] || '/';
  return path
    .split('/')
    .map((segment) => (uuidPathSegment.test(segment) ? ':id' : segment))
    .join('/')
    .slice(0, 120);
}

function stringAttribute(key: string, stringValue: string): OtlpAttribute {
  return { key, value: { stringValue } };
}

function intAttribute(key: string, intValue: number): OtlpAttribute {
  return { key, value: { intValue: String(Math.trunc(intValue)) } };
}

export function buildOtlpTracePayload(input: HttpServerSpanInput, spanId = randomSpanId()) {
  const match = input.traceparent.match(traceparentPattern);
  if (!match || (Number.parseInt(match[3], 16) & 1) !== 1) return undefined;

  const method = safeMethod(input.method);
  const route = safeRoute(input.route);
  const attributes: OtlpAttribute[] = [
    stringAttribute('http.request.method', method),
    stringAttribute('http.route', route),
    intAttribute('http.response.status_code', input.statusCode),
  ];
  if (input.releaseId && releaseIdPattern.test(input.releaseId)) {
    attributes.push(stringAttribute('atmos.release_id', input.releaseId));
  }

  return {
    resourceSpans: [
      {
        resource: {
          attributes: [stringAttribute('service.name', 'atmos-supabase-api')],
        },
        scopeSpans: [
          {
            scope: { name: 'atmos.supabase.edge' },
            spans: [
              {
                traceId: match[1],
                spanId,
                parentSpanId: match[2],
                traceState: '',
                name: `${method} ${route}`,
                kind: 2,
                startTimeUnixNano: input.startTimeUnixNano,
                endTimeUnixNano: input.endTimeUnixNano,
                attributes,
                status: input.statusCode >= 500 ? { code: 2 } : { code: 0 },
                flags: Number.parseInt(match[3], 16),
              },
            ],
          },
        ],
      },
    ],
  };
}

function randomSpanId() {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 16);
}

function grafanaTraceEndpoint(endpoint: string | undefined) {
  if (!endpoint) return undefined;
  try {
    const url = new URL(endpoint);
    if (
      url.protocol !== 'https:' ||
      !url.hostname.toLowerCase().endsWith('.grafana.net') ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return undefined;
    }
    const path = url.pathname.replace(/\/+$/, '');
    url.pathname = path.endsWith('/v1/traces') ? path : `${path}/v1/traces`;
    return url.toString();
  } catch {
    return undefined;
  }
}

function authorizationHeader(headers: string | undefined) {
  if (!headers) return undefined;
  for (const pair of headers.split(',')) {
    const separator = pair.indexOf('=');
    if (separator < 1) continue;
    try {
      const key = decodeURIComponent(pair.slice(0, separator).trim());
      const value = decodeURIComponent(pair.slice(separator + 1).trim());
      if (key.toLowerCase() === 'authorization' && value) return value;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export async function exportOtlpTrace(
  input: HttpServerSpanInput,
  options: {
    endpoint?: string;
    headers?: string;
    fetchImpl?: typeof fetch;
  } = {},
) {
  const endpoint = grafanaTraceEndpoint(options.endpoint);
  const authorization = authorizationHeader(options.headers);
  if (!endpoint || !authorization) return;
  const payload = buildOtlpTracePayload(input);
  if (!payload) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1_500);
  try {
    const response = await (options.fetchImpl ?? fetch)(endpoint, {
      method: 'POST',
      headers: {
        authorization,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      redirect: 'error',
      signal: controller.signal,
    });
    await response.body?.cancel();
  } catch {
    // Telemetry is best-effort and must never change the application response.
  } finally {
    clearTimeout(timeout);
  }
}
