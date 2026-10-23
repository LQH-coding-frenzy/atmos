# PERF-002 — Expanded weather/AQI Worker CPU remediation

Date: 2026-10-23

Status: **IN_PROGRESS**. This is a local optimization only; no Cloudflare candidate,
production route, database, or provider plan was changed.

## Baseline

The read-only Cloudflare Analytics GraphQL result is recorded in
[`../preflight/2026-10-22.md`](../preflight/2026-10-22.md). For the released Worker version,
the observed aggregate CPU p95 exceeded the 7 ms gate. The query was Worker/version-wide, not
route-specific, so the result identifies a budget failure but not its exact handler.

## Local change

- `OpenMeteoProvider.getDashboard()` now creates one timezone `Intl.DateTimeFormat` per request
  and reuses it for the hourly-to-local-day aggregation and daily date conversion.
- `dailyHourlyMeans()` now caches the `Object.entries` series list per call and only inserts a
  local-date map entry when first encountered, instead of rebuilding those structures on every
  hourly sample.
- The API response shape, null handling, timezone/DST rules, provider call count, and cache
  behavior are unchanged. Existing full-weather tests cover the normalized response and DST dates.

## Validation

| Check                                                    | Result                                                            |
| -------------------------------------------------------- | ----------------------------------------------------------------- |
| Clean lockfile install into fresh temp store             | Completed; no source or lockfile change                           |
| Focused provider Vitest (`packages/provider-openmeteo`)  | Passed: 18 tests in 3 files                                       |
| `corepack pnpm typecheck`                                | Passed                                                            |
| Targeted ESLint for provider implementation/tests        | Passed                                                            |
| `corepack pnpm --filter @atmos/provider-openmeteo build` | Passed                                                            |
| `corepack pnpm --filter @atmos/gateway build`            | Passed (`wrangler deploy --dry-run`; no upload)                   |
| Focused Calendar/AQI Playwright E2E                      | Passed: 6 tests against the local mock gateway/test configuration |
| Prettier and `git diff --check`                          | Passed                                                            |

The first verification attempt was blocked by missing Vite/Workerd package files. After the owner
authorized regeneration of the ignored workspace `node_modules` into a fresh temporary pnpm store,
the focused tests and Worker dry-run build passed. No generated dependency files were retained in
the repository.

No production telemetry was collected after this local edit. Any isolated Worker candidate,
bounded provider workload, or promotion remains a separate owner approval gate. Do not treat local
typecheck/build results as proof that Cloudflare CPU p95 is below 7 ms.
