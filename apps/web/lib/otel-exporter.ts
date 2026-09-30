import type { Attributes } from '@opentelemetry/api';
import { resourceFromAttributes } from '@opentelemetry/resources';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';

const spanAttributeAllowlist = new Set([
  'http.method',
  'http.request.method',
  'http.status_code',
  'http.response.status_code',
  'http.route',
  'next.route',
  'next.span_name',
  'next.span_type',
  'next.rsc',
]);

const resourceAttributeAllowlist = new Set([
  'service.name',
  'service.namespace',
  'service.version',
  'deployment.environment.name',
]);

const uuidPathSegment =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeRouteCharacters = /^[A-Za-z0-9_./:(){}*-]+$/;

export type GrafanaOtlpTraceConfig = {
  url: string;
  headers: { Authorization: string };
};

function grafanaTraceUrl(endpoint: string | undefined) {
  if (!endpoint) return undefined;
  try {
    const url = new URL(endpoint);
    if (
      url.protocol !== 'https:' ||
      !url.hostname.toLowerCase().startsWith('otlp-gateway-') ||
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

export function createGrafanaOtlpTraceConfig(
  endpoint: string | undefined,
  headers: string | undefined,
): GrafanaOtlpTraceConfig | undefined {
  const url = grafanaTraceUrl(endpoint);
  const authorization = authorizationHeader(headers);
  if (!url || !authorization) return undefined;
  return { url, headers: { Authorization: authorization } };
}

function safeMethod(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const method = value.toUpperCase();
  return /^[A-Z]{1,16}$/.test(method) ? method : undefined;
}

function safeRoute(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const path = value.split(/[?#]/, 1)[0] || '/';
  const normalized = path
    .split('/')
    .map((segment) => (uuidPathSegment.test(segment) ? ':id' : segment))
    .join('/')
    .slice(0, 120);
  if (
    !normalized.startsWith('/') ||
    !Array.from(normalized).every(
      (character) => character === '[' || character === ']' || safeRouteCharacters.test(character),
    )
  ) {
    return undefined;
  }
  return normalized;
}

function safeSpanName(method: string | undefined, route: string | undefined) {
  if (method && route) return `${method} ${route}`;
  if (route) return `next ${route}`;
  return 'next.internal';
}

function filterAttributes(attributes: Attributes, allowedKeys: Set<string>): Attributes {
  const filtered: Attributes = {};
  for (const key of allowedKeys) {
    const value = attributes[key];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      filtered[key] = value;
    }
  }
  return filtered;
}

export function sanitizeReadableSpan(span: ReadableSpan): ReadableSpan {
  const method = safeMethod(
    span.attributes['http.method'] ?? span.attributes['http.request.method'],
  );
  const route = safeRoute(span.attributes['next.route'] ?? span.attributes['http.route']);
  const name = safeSpanName(method, route);
  const attributes = filterAttributes(span.attributes, spanAttributeAllowlist);
  if (method) {
    if ('http.method' in attributes) attributes['http.method'] = method;
    if ('http.request.method' in attributes) attributes['http.request.method'] = method;
  }
  if (route) {
    if ('http.route' in attributes) attributes['http.route'] = route;
    if ('next.route' in attributes) attributes['next.route'] = route;
  }
  if ('next.span_name' in attributes) attributes['next.span_name'] = name;

  const resourceAttributes = filterAttributes(span.resource.attributes, resourceAttributeAllowlist);
  resourceAttributes['service.name'] = 'atmos-vercel-web';
  const descriptors = Object.getOwnPropertyDescriptors(span);
  const overrides: Record<string, unknown> = {
    name,
    attributes,
    events: [],
    links: [],
    resource: resourceFromAttributes(resourceAttributes),
    status: { code: span.status.code },
  };
  for (const [key, value] of Object.entries(overrides)) {
    descriptors[key] = {
      configurable: true,
      enumerable: true,
      writable: true,
      value,
    };
  }
  return Object.create(Object.getPrototypeOf(span), descriptors) as ReadableSpan;
}

export class SanitizingTraceExporter implements SpanExporter {
  constructor(private readonly delegate: SpanExporter) {}

  export(spans: ReadableSpan[], resultCallback: Parameters<SpanExporter['export']>[1]) {
    this.delegate.export(spans.map(sanitizeReadableSpan), resultCallback);
  }

  shutdown() {
    return this.delegate.shutdown();
  }
}
