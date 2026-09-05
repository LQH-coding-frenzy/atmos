# Cloudflare Worker Diagnostics

## Staging Smoke

Use the isolated `atmos-gateway-staging` Workers.dev deployment. Exercise `/health` and the public dashboard route. Record the `x-request-id` response header and `x-cache` state; never log credentials, cookies, or raw provider payloads.

## CPU Evidence

Use the Cloudflare Analytics GraphQL dataset `workersInvocationsAdaptive`, filtered by `scriptName`, time window, and a numeric `limit`. Record request count, errors, and `cpuTimeP50`, `cpuTimeP95`, and `cpuTimeP99`. Worker Tail is a sampled log stream and must not be treated as CPU percentile evidence.

## Provider Failures

The public route returns only the sanitized `WEATHER_UNAVAILABLE` envelope. Correlate with the request ID and safe error type logs; do not expose upstream URLs, payloads, or credentials to clients.

## Release Boundary

Staging diagnostics do not authorize production deployment. Production Worker logs, traces, and analytics are reviewed under the protected release workflow.
