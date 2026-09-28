import { describe, expect, it, vi } from 'vitest';
import { buildOtlpTracePayload, exportOtlpTrace } from './otel';

const traceparent = '00-1234567890abcdef1234567890abcdef-1234567890abcdef-01';
const privateId = '123e4567-e89b-42d3-a456-426614174000';
const input = {
  traceparent,
  method: 'get',
  route: `/api/v1/alerts/${privateId}?lat=52.52&lon=13.405`,
  statusCode: 200,
  startTimeUnixNano: '1720000000000000000',
  endTimeUnixNano: '1720000000001000000',
  releaseId: 'release-123',
};

describe('OTLP trace export', () => {
  it('builds one bounded server span without query or identifier data', () => {
    const payload = buildOtlpTracePayload(input, 'fedcba0987654321');
    expect(payload).toBeDefined();

    const serialized = JSON.stringify(payload);
    expect(serialized).toContain('GET /api/v1/alerts/:id');
    expect(serialized).toContain('atmos-supabase-api');
    expect(serialized).toContain('release-123');
    expect(serialized).not.toContain(privateId);
    expect(serialized).not.toContain('52.52');
    expect(serialized).not.toContain('13.405');

    const span = payload!.resourceSpans[0]!.scopeSpans[0]!.spans[0]!;
    expect(span).toMatchObject({
      traceId: '1234567890abcdef1234567890abcdef',
      spanId: 'fedcba0987654321',
      parentSpanId: '1234567890abcdef',
      kind: 2,
      status: { code: 0 },
    });
  });

  it('does not export traces that are not sampled or have invalid trace context', () => {
    expect(
      buildOtlpTracePayload({ ...input, traceparent: traceparent.replace(/01$/, '00') }),
    ).toBeUndefined();
    expect(buildOtlpTracePayload({ ...input, traceparent: 'invalid' })).toBeUndefined();
  });

  it('exports only to HTTPS Grafana Cloud with the configured authorization header', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    await exportOtlpTrace(input, {
      endpoint: 'https://otlp-gateway-prod-ap-southeast-1.grafana.net/otlp',
      headers: 'Authorization=Basic%20dGVzdD0%3D',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://otlp-gateway-prod-ap-southeast-1.grafana.net/otlp/v1/traces');
    expect(init?.headers).toMatchObject({ authorization: 'Basic dGVzdD0=' });
    expect(init?.redirect).toBe('error');
    expect(JSON.stringify(init?.body)).not.toContain(privateId);
  });

  it('does not send without configuration or to an untrusted endpoint', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    await exportOtlpTrace(input, { fetchImpl });
    await exportOtlpTrace(input, {
      endpoint: 'http://127.0.0.1:4318',
      headers: 'Authorization=Basic%20dGVzdA==',
      fetchImpl,
    });
    await exportOtlpTrace(input, {
      endpoint: 'https://example.com/otlp',
      headers: 'Authorization=Basic%20dGVzdA==',
      fetchImpl,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('swallows exporter failures so telemetry cannot affect the request', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('transport failure');
    });
    await expect(
      exportOtlpTrace(input, {
        endpoint: 'https://otlp-gateway-prod-ap-southeast-1.grafana.net/otlp',
        headers: 'Authorization=Basic%20dGVzdA==',
        fetchImpl,
      }),
    ).resolves.toBeUndefined();
  });
});
