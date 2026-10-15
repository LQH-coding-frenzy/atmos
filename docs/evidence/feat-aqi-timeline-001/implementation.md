# FEAT-AQI-TIMELINE-001 — on-demand model AQI timelines

Status: **DONE locally**, merged via [PR #309](https://github.com/LQH-coding-frenzy/atmos/pull/309) on 2026-10-15. No production, database, secret, paid-resource,
or infrastructure change was made. Group A remains in review independently.

## Implementation and dependencies

FEAT-AQI-LIVE-001, WX-004, WEB-012, CACHE-001, and PERF-001 are DONE in
`.agent/status.yaml`. This task does not depend on unapproved deployment of A.

- An optional, bounded, chronological `timeline` extends the existing current AQI
  contract. It explicitly represents **model** data, not station observations or
  the user's recorded weather history. Samples retain nullable pollutant/index values.
- `GET /api/v1/weather/air-quality?lat=...&lon=...&view=timeline` fetches seven past
  model days and up to five forecast days from the existing Open-Meteo provider.
  These are requested limits, not a guarantee of complete geographic/time coverage.
- The default/current mode remains lightweight and compatible. Query mode validation,
  canonical caching, stale fallback, and in-flight coalescing isolate current and timeline
  requests. User-supplied arbitrary date/length parameters are not forwarded.
- The timeline reserves two conservative weighted provider units. Cache hits and
  browser-only period/range/metric changes do not cause additional upstream requests.
- UI opens only on an explicit forecast/history action. The chart supports both AQI
  scales and six pollutants, 24-hour/full requested ranges, local-time labels, low/high
  summaries, coverage counts, native point tooltips, and an exact-values table.
- Missing values and missing hours break the plotted line. No interpolation/zero-fill
  is used. Empty ranges, current-only old servers, failure/retry, stale data, closing,
  cancellation, and late-response isolation have explicit behavior.
- Closing the tool stops timeline work. No background poll, database backfill, automatic
  observation collection, new vendor, or personal-data logging was introduced.

## Documentation and public-source check

The official Open-Meteo Air Quality API documentation was reviewed through Context7:
<https://open-meteo.com/en/docs/air-quality-api>. It documents `past_days`,
`forecast_days`, Unix timestamps and CAMS European/global model coverage. Attribution
now acknowledges the European/global selection instead of implying European-only data.
Non-commercial use and the existing provider quotas continue to apply.

A bounded read-only call through the actual adapter returned 288 model hours and
approximately 51 KB of normalized JSON for Berlin. Weighted usage was two units.
This was a real public provider read, not a deployed production test or a station record.

## Verification

- Focused contracts/provider/gateway/web-library tests: 114 passed across 22 files.
- Combined dashboard and AQI-timeline Playwright suites: 31 passed.
- PR #309 quality, database, Playwright, security scans, SBOM and Vercel preview checks: passed.
- Full repository unit/script check: 140 Vitest tests and 78 script tests passed.
- TypeScript, targeted ESLint, formatting, gateway bundle dry-run, and web production build passed.
- The focused tests cover weighted reservation, mode/cache/coalescing isolation, stale
  fallback, nullable/malformed/short/oversized series, chronology, no gap interpolation,
  320px layout, lazy loading, filters without refetch, old servers, retry, and cancellation.
- Local screenshots were inspected at desktop, 390px and 320px in light/dark styles.
  Real public AQI responses reached the browser through Playwright routing to the local
  Worker; production CSP was not relaxed for localhost. Readable HTML time-axis labels
  replaced undersized SVG timestamps during the visual correction pass. The exact-values
  region was keyboard-scrolled and page overflow remained absent at 320px.
- Development React/CSP warnings are not a clean production-console claim. Temporary
  screenshots and public response bodies were not committed.

## Release and rollback gates

Protected PR security scans passed in PR #309, but no production exposure occurred. The richer response
requires candidate Worker p95 CPU at or below 7 ms before ordinary production exposure;
local TypeScript/bundle success is not that measurement. Backend/provider support must
be released before enabling live timeline availability in the frontend. The new frontend
handles older servers without inventing forecast data. Revert the additions and retain
prior immutable releases; no persisted schema/data rollback is required.
