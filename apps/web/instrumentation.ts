import { OTLPHttpProtoTraceExporter, registerOTel } from '@vercel/otel';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { createGrafanaOtlpTraceConfig, SanitizingTraceExporter } from './lib/otel-exporter';

export function register() {
  if (process.env.NEXT_OTEL_FETCH_DISABLED !== '1') return;

  const config = createGrafanaOtlpTraceConfig(
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    process.env.OTEL_EXPORTER_OTLP_HEADERS,
  );
  if (!config) return;

  const exporter = new SanitizingTraceExporter(new OTLPHttpProtoTraceExporter(config));
  registerOTel({
    serviceName: 'atmos-vercel-web',
    attributes: {
      'service.namespace': 'atmos',
      'deployment.environment.name': process.env.VERCEL_ENV ?? 'development',
    },
    instrumentations: ['auto'],
    spanProcessors: [new BatchSpanProcessor(exporter)],
  });
}
