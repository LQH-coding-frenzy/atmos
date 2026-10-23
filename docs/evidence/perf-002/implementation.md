# PERF-002 — Expanded weather/AQI Worker CPU remediation

Date: 2026-10-23

Status: **IN_PROGRESS — candidate HOLD**. The local optimization is merged. An owner-approved
isolated Worker candidate was deployed at 0% for bounded CPU sampling; ordinary traffic remains on
the stable version. A follow-up Next.js placement is implemented locally but not deployed. No
promotion, database change, provider-plan change, or production token was created or configured.

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

Before the isolated candidate measurement below, no production telemetry had been collected after
this local edit. Do not treat local typecheck/build results as proof that Cloudflare CPU p95 is below
7 ms.

## Candidate CPU measurement — owner-approved, partial HOLD (2026-10-23)

The regular `Release Edge Runtime` workflow promotes its Worker to 100% after smoke and was not
used. The merged source tree matched `main` at
`9a05f8bea27639d74f18b692ed0deabf584ee0e3`; PR checks, focused tests, and the Worker dry-run build
passed before the remote action. The approved bounded test used the REL-003 hold pattern from
`docs/operations/production-worker-canary.md`:

### Deployment and smoke

- Candidate Worker version `a1be3ca0-7aa0-4845-a6d9-4e14e2424a74`, tagged
  `9a05f8bea276`, was uploaded from the exact merged `main` tree. No Supabase function or database
  was changed; the candidate retained the existing healthy backend release `96434d008bd2`.
- Deployment `1a6b1edf-7471-469b-be67-0725e47380aa` was created at
  `2026-10-23T15:04:38.861654Z` with stable Worker version
  `2da40785-0b9e-430c-bdac-c9ad6254ff68` at 100% and candidate at 0%.
- Override-only candidate `/health`, `/health/dependencies`, and `/version` checks passed; the
  unauthenticated protected route returned 401. Ordinary `/version` continued to report stable
  release `96434d008bd2`.

### Bounded cache-miss sample and CPU result

- The unique-location miss workload was throttled and stopped at the first application failure:
  13 requests returned HTTP 200 with `x-cache: MISS`; the 14th returned HTTP 503 without a cache
  status. No response body, provider payload, coordinates, or request URL was recorded. The
  successful misses represent 65 estimated weighted Open-Meteo units; counting the failed request
  conservatively adds at most 5, for no more than 70 estimated units total.
- Exact-version Cloudflare `workersInvocationsAdaptive` query (`scriptName=atmos-gateway`, candidate
  `scriptVersion`, `isPreview=0`) for `2026-10-23T15:06:44.752Z`–`2026-10-23T15:07:06.671Z` returned
  13 invocations, 0 platform errors, CPU p50 `8.477 ms`, p95 `11.607 ms`, and p99 `11.607 ms`.
- The sample is too small to establish a reliable percentile, and the observed p95 is above the
  7 ms gate. Per PERF-002 stop conditions, no cache-hit workload or further candidate requests were
  sent. Cache-hit CPU is therefore **not measured**, and PERF-002 does **not** pass.
- Final read-only verification confirmed the same stable-100/candidate-0 deployment and ordinary
  production `/version` still on `96434d008bd2`. No promotion, rollback, Vercel release, database
  operation, or other traffic shift occurred. Keep the candidate at 0% pending owner direction and
  further remediation; any additional production CPU workload requires separate approval.

This partial result is not authorization for promotion, rollback, or more production traffic.

## Local Next.js placement follow-up — 2026-10-23

After the partial CPU result, the owner approved a local-only move of the expanded transformations:

- Added bounded Next.js POST handlers for dashboard weather and AQI timelines. They validate the
  request body and normalized response, use the existing `OpenMeteoProvider`, and cache upstream
  provider fetches for 300 seconds using Next's server fetch cache.
- The Worker retains public input validation, request correlation, cache/stale behavior, CORS, and
  response contracts. For tagged releases it delegates dashboard misses and AQI timeline misses to
  the Vercel server handler. Local and staging Worker configurations keep the direct provider path.
- Worker-to-Next requests use a bounded JSON body rather than forwarding coordinates in a query
  string, and do not forward browser authorization or cookies. The Next handler requires a shared
  service credential (`WEATHER_TRANSFORM_TOKEN` on the Worker and
  `ATMOS_WEATHER_TRANSFORM_TOKEN` on Vercel), uses a constant-time comparison, and logs no body,
  coordinates, provider payload, or token. The token was **not** created or configured; its setup
  requires separate explicit owner approval.
- The Cloudflare candidate deployed for the earlier partial measurement was not replaced or
  updated. No Vercel release, Worker deployment, database action, provider traffic, or production
  route change occurred during this local follow-up. The candidate remains at 0% and stable remains
  at 100%.

### Local validation

| Check                                                       | Result                                    |
| ----------------------------------------------------------- | ----------------------------------------- |
| Focused provider/contracts, Worker, and Next handler Vitest | Passed: 84 tests in 6 files               |
| Full-weather and AQI-timeline provider tests                | Passed: 10 tests in 2 files               |
| TypeScript typecheck                                        | Passed                                    |
| Targeted ESLint                                             | Passed with zero warnings                 |
| Worker production-config dry-run build                      | Passed; no upload                         |
| Worker staging-config dry-run build                         | Passed; transform origin explicitly empty |
| Next.js 16.4.1 production build                             | Passed; both new POST routes were dynamic |
| Calendar/AQI timeline Playwright E2E                        | Passed: 6 tests                           |
| Prettier                                                    | Passed                                    |

PERF-002 remains `IN_PROGRESS`: the initial candidate sample was too small and exceeded the 7 ms
gate; cache-hit CPU was not measured. The new code is local-only and cannot use the Next.js transform
until the owner-approved shared token is configured. Do not deploy or run another production CPU
workload without separate approval.

## Owner-approved Vercel security release — 2026-10-23

- PR #322 merged as `9a05f8bea27639d74f18b692ed0deabf584ee0e3`. Trivy initially identified two
  critical and one high Next.js 16.3.8 advisories; the PR updated Next.js to fixed version 16.4.1,
  after which all PR checks passed.
- The owner approved a Vercel-only production release. Protected run
  [39972999116](https://github.com/LQH-coding-frenzy/atmos/actions/runs/39972999116) completed on
  that SHA; exact-candidate and production-domain smoke/security-header checks passed, and the public
  homepage returned HTTP 200. No Edge Runtime workflow was dispatched by this release.
- PERF-002 remains `IN_PROGRESS`: its first candidate received a partial exact-version CPU sample
  above the 7 ms gate, and local Next.js placement remediation is pending separate token setup and
  candidate approval. Stable Worker release `96434d008bd2` remains at 100%.
