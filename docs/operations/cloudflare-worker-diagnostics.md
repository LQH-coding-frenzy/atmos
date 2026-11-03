# Cloudflare Worker Diagnostics

## Staging Smoke

Use the isolated `atmos-gateway-staging` Workers.dev deployment. Exercise `/health` and the public dashboard route. Record the `x-request-id` response header and `x-cache` state; never log credentials, cookies, or raw provider payloads.

## CPU Evidence

Use the Cloudflare Analytics GraphQL dataset `workersInvocationsAdaptive`, filtered by `scriptName`, time window, and a numeric `limit`. Record request count, errors, and `cpuTimeP50`, `cpuTimeP95`, and `cpuTimeP99`. Worker Tail is a sampled log stream and must not be treated as CPU percentile evidence.

### Protected read-only CPU snapshot

Use the GitHub Actions **Worker CPU snapshot** workflow from protected `main` to query production
natural-traffic data without sending requests to the Worker:

1. Select the exact deployed version UUID from the read-only Wrangler deployment inventory.
2. Dispatch the workflow with that UUID and a bounded lookback from 1 to 1,440 minutes (default 60).
3. The query is fixed to `atmos-gateway`, the exact version, and `isPreview=0`. Its UTC window ends
   ten minutes before query time to allow analytics ingestion. It uses the existing Staging-scoped
   `CLOUDFLARE_ANALYTICS_TOKEN`; do not create or rotate a token for this check.
4. `PASS` requires at least 30 analytics requests, zero Worker invocation errors, and CPU p95 at or
   below 7 ms. Fewer than 30 requests or missing quantiles reports `INSUFFICIENT_DATA`; errors or an
   over-budget p95 reports `HOLD`.

The workflow is observational only: it does not generate Worker/provider traffic, deploy a version,
change traffic allocation, or authorize promotion. CPU quantiles returned by GraphQL are converted
from microseconds to milliseconds in its summary. A passing snapshot does not clear separate provider,
cache, WAF, or release-approval gates.

## Provider Failures

The public route returns only the sanitized `WEATHER_UNAVAILABLE` envelope. Correlate with the request ID and safe error type logs; do not expose upstream URLs, payloads, or credentials to clients.

## Release Boundary

Staging diagnostics do not authorize production deployment. Production Worker logs, traces, and analytics are reviewed under the protected release workflow.
