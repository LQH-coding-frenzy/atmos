import type { Attributes } from '@opentelemetry/api';
import { resourceFromAttributes } from '@opentelemetry/resources';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { describe, expect, it } from 'vitest';
import { createGrafanaOtlpTraceConfig, sanitizeReadableSpan } from './otel-exporter';

describe('Vercel Grafana OTLP configuration', () => {
  it('builds the traces endpoint and decodes only its Basic authorization header', () => {
    expect(
      createGrafanaOtlpTraceConfig(
        'https://otlp-gateway-prod-ap-southeast-1.grafana.net/otlp',
        'Authorization=Basic%20dGVzdA==',
      ),
    ).toEqual({
      url: 'https://otlp-gateway-prod-ap-southeast-1.grafana.net/otlp/v1/traces',
      headers: { Authorization: 'Basic dGVzdA==' },
    });
  });

  it('fails closed for missing, insecure, or untrusted configuration', () => {
    expect(createGrafanaOtlpTraceConfig(undefined, undefined)).toBeUndefined();
    expect(
      createGrafanaOtlpTraceConfig(
        'http://otlp-gateway-prod-ap-southeast-1.grafana.net/otlp',
        'Authorization=Basic%20dGVzdA==',
      ),
    ).toBeUndefined();
    expect(
      createGrafanaOtlpTraceConfig('https://example.com/otlp', 'Authorization=Basic%20dGVzdA=='),
    ).toBeUndefined();
    expect(
      createGrafanaOtlpTraceConfig(
        'https://otlp-gateway-prod-ap-southeast-1.grafana.net/otlp',
        'X-Api-Key=not-authorization',
      ),
    ).toBeUndefined();
  });
});

describe('sanitizeReadableSpan', () => {
  it('keeps templated server attributes and strips query, URL, credential, event, and user data', () => {
    const rawAttributes: Attributes = {
      'http.method': 'GET',
      'http.status_code': 200,
      'http.route': '/places/[location]',
      'next.route': '/places/[location]',
      'next.span_type': 'BaseServer.handleRequest',
      'next.rsc': false,
      'http.target': '/places/berlin?lat=52.52&lon=13.405',
      'http.url': 'https://rainify.dpdns.org/places/berlin?lat=52.52',
      authorization: 'Bearer confidential-token',
      'user.id': 'person-123',
      'db.statement': 'select private_data',
    };
    const span = {
      name: 'GET /places/[location]?lat=52.52&lon=13.405',
      kind: 2,
      spanContext: () => ({
        traceId: '1234567890abcdef1234567890abcdef',
        spanId: '1234567890abcdef',
        traceFlags: 1,
      }),
      parentSpanContext: undefined,
      startTime: [1, 0],
      endTime: [1, 1],
      duration: [0, 1],
      status: { code: 0, message: 'private error details' },
      attributes: rawAttributes,
      links: [{ context: {}, attributes: { user: 'private' } }],
      events: [{ name: 'exception', attributes: { 'exception.message': 'private' } }],
      resource: resourceFromAttributes({
        'service.name': 'unexpected-service',
        'service.instance.id': 'private-instance',
        'process.command_args': 'private-arguments',
        'deployment.environment.name': 'production',
      }),
      instrumentationScope: { name: 'next', version: '16' },
      ended: true,
      droppedAttributesCount: 0,
      droppedEventsCount: 0,
      droppedLinksCount: 0,
    } as unknown as ReadableSpan;

    const sanitized = sanitizeReadableSpan(span);
    const serialized = JSON.stringify(sanitized);

    expect(sanitized.name).toBe('GET /places/[location]');
    expect(sanitized.attributes).toMatchObject({
      'http.method': 'GET',
      'http.status_code': 200,
      'http.route': '/places/[location]',
      'next.route': '/places/[location]',
      'next.span_type': 'BaseServer.handleRequest',
      'next.rsc': false,
    });
    expect(sanitized.resource.attributes).toMatchObject({
      'service.name': 'atmos-vercel-web',
      'deployment.environment.name': 'production',
    });
    expect(sanitized.events).toHaveLength(0);
    expect(sanitized.links).toHaveLength(0);
    expect(sanitized.status).toEqual({ code: 0 });
    expect(serialized).not.toContain('52.52');
    expect(serialized).not.toContain('13.405');
    expect(serialized).not.toContain('rainify.dpdns.org');
    expect(serialized).not.toContain('confidential-token');
    expect(serialized).not.toContain('person-123');
    expect(serialized).not.toContain('private_data');
    expect(serialized).not.toContain('private error details');
    expect(serialized).not.toContain('private-instance');
  });
});
