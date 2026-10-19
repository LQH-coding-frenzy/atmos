# FEAT-WARN-002 — official warning center

Status: **warning processing is implemented and validated in the existing Vercel/Next.js server
runtime after the Worker CPU gate failed.** Production release remains separately gated.

## Approved source scope

The owner approved NWS for U.S. service areas and ECCC for Canada on 2026-10-19. The official
NWS API and Alerts documentation, ECCC GeoMet OGC API documentation, ECCC usage policy, and
ECCC end-use licence v2.1.1 (August 2026) were rechecked on that date.

- [NWS API documentation](https://www.weather.gov/documentation/services-web-api)
- [NWS Alerts Web Service](https://www.weather.gov/documentation/services-web-alerts)
- [ECCC GeoMet warning collection](https://eccc-msc.github.io/open-data/msc-data/alerts/readme_alerts-geomet_en/)
- [ECCC OGC API filtering and property selection](https://eccc-msc.github.io/open-data/msc-geomet/ogc_api_en/)
- [ECCC usage policy](https://eccc-msc.github.io/open-data/usage-policy/readme_en/)
- [ECCC end-use licence](https://eccc-msc.github.io/open-data/licence/readme_en/)

## Implementation and safeguards

- The dashboard requests warnings only after the user opens Official alerts, using a same-origin
  POST body rather than exposing coordinates in a query string. The server routes the selected
  location by its geocoding country; unknown countries return `unsupported` without contacting
  either provider. A supported NWS country first resolves `/points/{lat},{lon}`; a 404 returns
  unsupported coverage and does not call `/alerts/active`.
- NWS alert lookups use `/alerts/active?point=...` and a meaningful User-Agent. The unsupported
  `limit` query parameter was removed after the official OpenAPI schema showed that `/alerts/active`
  does not accept it. ECCC lookups use an OGC `INTERSECTS` point filter, `limit=20`, an allowlist of
  alert properties, and the required source attribution. No `no-cache` header is sent upstream.
- Upstream reads run from a Next.js Node.js Route Handler. Next's persistent fetch cache revalidates
  the fixed provider URLs after 60 seconds; a bounded 128-entry in-process cache retains results
  for 60 seconds plus a five-minute stale fallback window. No database or new cache service is
  introduced.
- Coordinates are range-checked and rounded to three decimal places. Provider responses have a
  3.5-second per-request timeout, a 384 KiB streaming body limit, and a 20-alert display cap. Larger result
  sets are marked truncated. Successful results are coalesced and cached; failure can serve an
  explicitly stale cached response. Errors and analytics contain no coordinates or raw payloads.
- Original alert text, event, areas, and available publication/effective/onset/expiration/end
  times are retained. Links are restricted to official NWS/ECCC endpoints. Unsupported coverage,
  an empty supported result, stale results, and provider failure are distinct UI states.
- The UI identifies NWS/ECCC limitations: some marine products may be incomplete and NWS alert
  endpoints omit SPC SEL tornado-watch wording. It is described as informational, not an
  emergency-alert service. No database state, secrets, paid resources, automatic notifications,
  or production release are included.

## Local validation

- Focused Vitest: 71 tests passed across the warning adapter/server route, gateway contracts, and analytics.
- Playwright: 29 tests passed across the severe-weather UI and dashboard using `CI=1` so the
  configured test Supabase environment was used.
- Gateway Wrangler dry-run, repository typecheck, and Next.js production build passed.
- ESLint passed for changed TypeScript files. Prettier formatting was applied to changed source
  and documentation files.
- [Unsupported-coverage and attribution UI screenshot](coverage-attribution-mobile.png) uses an
  explicit unsupported-response fixture; it is not a live alert or provider response.

## CPU gate and deployment boundary

Candidate version `9d7648ce-77ee-45f5-bf48-d8394baa31d0` was deployed only to the existing isolated
`atmos-gateway-staging` Workers.dev endpoint for CPU measurement. After moving the warning code to
Vercel, staging was restored with version `330f6348-0d81-411b-aed4-a90a8adb8aee`, which no longer
contains the warning route; staging `/health` returned 200. Production Worker, routes, web release,
and databases were untouched.
The owner confirmed Workers Free/WAE entitlements; no additional token or paid resource was created.

The controlled staging smoke returned explicit unsupported coverage for Germany, a supported ECCC
response for Toronto (zero active alerts), and 50/50 ECCC warm-cache hits. NWS initially returned a
sanitized 503 because the adapter sent an unsupported `limit` parameter; the official NWS OpenAPI
schema confirms `/alerts/active` has no `limit` parameter. After removing it, local Next.js server
smokes returned supported NWS and ECCC responses, both with zero active alerts. No provider body or
message was logged.

The existing `PERF-001` p95 (`4.731 ms`) measured a warmed public-dashboard route and cannot be
reused as evidence for the warning route. Cloudflare `workersInvocationsAdaptive`, filtered to
`atmos-gateway-staging` over the controlled test window, reported 57 requests, 0 Worker errors,
CPU p50 `1,837 µs` (`1.837 ms`), p95 `9,196 µs` (`9.196 ms`), and p99 `26,330 µs` (`26.330 ms`).
The measured p95 exceeds Atmos's 7 ms placement gate; warning fetch and normalization were moved
to the existing Vercel/Next.js runtime. Staging Worker version
`330f6348-0d81-411b-aed4-a90a8adb8aee` is the post-move baseline with the warning route removed.
PR [#320](https://github.com/LQH-coding-frenzy/atmos/pull/320) is open; its protected checks and
Vercel preview passed. No production release was performed.
