# PERF-002 — Expanded weather/AQI Worker CPU remediation

Date: 2026-10-24

Status: **IN_PROGRESS — candidate HOLD**. The local optimization is merged. An owner-approved
isolated Worker candidate was deployed at 0% for bounded CPU sampling; ordinary traffic remains on
the stable version. The Next.js placement and a versioned Worker candidate are deployed, but the
candidate is still held at 0%. No Worker promotion/rollback, database change, or provider-plan change
occurred.

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
  coordinates, provider payload, or token. At the end of this local-only phase, the token had not
  yet been created or configured; its later owner-approved deployment is recorded below.
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

At the end of this local-only phase, PERF-002 remained `IN_PROGRESS`: the initial candidate sample
was too small and exceeded the 7 ms gate, cache-hit CPU was not measured, and no token or deployment
existed yet. The later Vercel deployment is recorded below; a new Worker candidate test still
requires its Cloudflare token binding and separate bounded CPU evidence.

## Owner-approved Next.js transform deployment — 2026-10-24

- PR #323 was merged as `ee0e4172db3f107d452dc3b50556998aef2a185c`; the PR and main-branch security,
  quality, database, and browser checks passed.
- Protected Vercel production run
  [40086346151](https://github.com/LQH-coding-frenzy/atmos/actions/runs/40086346151) ran on that
  exact `main` commit with `promote=true`. The exact deployment and production homepage smoke passed;
  the workflow rollback-on-failure step was not triggered.
- The sensitive Vercel Production variable `ATMOS_WEATHER_TRANSFORM_TOKEN` is configured, and the
  corresponding Cloudflare `WEATHER_TRANSFORM_TOKEN` was included only in the versioned Worker
  candidate. Neither value is recorded here.
- The Vercel workflow's homepage smokes ran against the existing stable Worker; they did not target
  the Worker candidate. Any homepage provider requests were not separately counted.
- Candidate Worker version `fa421e5a-2982-4221-a6f1-2d575eb21c0d`, tagged `ee0e4172db3f`, was
  added to deployment `449f7c5a-7453-43ea-a659-fa657351e4ce` at
  `2026-10-24T11:13:50.38041Z`: stable version `2da40785-0b9e-430c-bdac-c9ad6254ff68` at 100%,
  candidate at 0%. Override-only health/dependency/version smoke passed; ordinary `/version` remained
  `96434d008bd2`.
- The first candidate dashboard request returned HTTP 503 without an `x-cache` status at
  `2026-10-24T11:16:08.757Z`. No response body, query, coordinates, or provider payload was recorded.
  Count this as at most 5 weighted units. No more candidate requests were sent.
- Exact-version Cloudflare `workersInvocationsAdaptive` for `2026-10-24T11:16:00Z`–
  `2026-10-24T11:17:00Z` returned 1 invocation, 0 platform errors, and CPU p50/p95/p99 `7.359 ms`.
  This is insufficient sampling and the observed p95 exceeds 7 ms. No cache-hit workload was sent.
- The generated source token and ephemeral Worker secrets file were removed from the local temp
  directory after upload. The sensitive Vercel variable and candidate-version secret remain
  configured; neither value is recorded here.
- Final read-only verification confirmed stable remains at 100%, candidate at 0%, and no Edge Runtime
  workflow or Worker rollback occurred. The Vercel automatic rollback guard was not triggered because
  its production smoke passed.

PERF-002 remains `IN_PROGRESS` and **HOLD**: the new candidate also has a partial over-budget CPU
signal and a 503. Cache-hit CPU is unmeasured. Do not promote or roll back; a further bounded test
requires separate owner direction after diagnosing the Vercel/provider failure.

## Local diagnostic follow-up — 2026-10-24

- A sanitized Vercel log query returned only homepage entries and no weather-provider failure event.
  This did not establish whether the candidate request failed service-token authorization, network
  access, or the upstream provider; no payload, request URL, coordinates, or secret was inspected.
- Worker transform failures now carry only a bounded `failure_class` (`upstream_4xx`,
  `upstream_5xx`, network/timeout, or invalid response) into sanitized Worker logs. The response
  remains the existing generic 503. Focused tests cover 4xx/5xx classification and verify that
  upstream body/token text is not logged.
- Local Worker tests (37), typecheck, targeted ESLint/Prettier, and `wrangler deploy --dry-run`
  passed. This diagnostic change was **not** uploaded to Cloudflare.
- No further candidate or provider requests were sent. The active deployment remains stable 100% /
  candidate 0%; the CPU sample remains insufficient and above the gate. PERF-002 stays `IN_PROGRESS`.

## Owner-approved diagnostic candidate attempt — 2026-10-24

- PR #324, which adds sanitized transform failure classes, was merged as
  `04c326d1ca0ae4ae35c7dd3a0770278acdfa6921`; all PR and main-branch checks passed.
- The shared token was rotated in the Vercel Production environment without exposing or recording
  its value. Protected Vercel production run
  [40091452631](https://github.com/LQH-coding-frenzy/atmos/actions/runs/40091452631) promoted the
  exact merged `main` deployment and passed homepage smoke; its automatic rollback was not triggered.
- Worker version `0b772e26-9e9f-413d-82ea-fdb8df199bb1`, tag `04c326d1ca0a`, was uploaded with the
  matching transform secret and held in deployment `0d28d1aa-5e09-48ed-8d8a-3114162e7d49` at 0%;
  stable `2da40785-0b9e-430c-bdac-c9ad6254ff68` remained at 100%. Override-only health,
  dependency, version, and unauthenticated-route smoke passed.
- A read-only version manifest showed the candidate has the `WEATHER_TRANSFORM_TOKEN` secret binding;
  the secret value was not accessed. Temporary source and upload files were removed after use.
- The first bounded dashboard request returned HTTP 503 without an `x-cache` status at
  `2026-10-24T11:58:21.105Z`; no response body, URL, coordinates, or provider payload was recorded.
  Count it as at most 5 weighted units. No retries or further candidate requests were sent.
- Exact-version Cloudflare `workersInvocationsAdaptive` for `2026-10-24T11:45Z`–`2026-10-24T12:15Z`
  returned 4 invocations, 0 platform errors, CPU p50 `1.846 ms`, p95 `10.497 ms`, and p99
  `10.497 ms`. This window includes the three candidate smoke invocations and the single failed
  weather request, so it is not a reliable percentile sample. No cache-hit workload was run.
- Read-only checks confirmed the Vercel Production variable name is present, the E2E gateway rewrite
  is absent, and the candidate version manifest includes the transform-token binding name; no secret
  values were read. Filtered Vercel runtime logs showed only homepage entries and no dashboard-route
  failure event, so the source of the 503 remains undetermined.
- The version-filtered Wrangler tail produced no matching event for the failure. Its text filter may
  not include `console.warn`; this does not establish that the Worker emitted no diagnostic. The
  ephemeral local token/secret files were removed after upload; the Vercel and candidate-version
  secrets remain configured.
- Final verification confirmed stable 100% / candidate 0%, ordinary `/version` still
  `96434d008bd2`, and no Edge Runtime workflow or Worker rollback.

PERF-002 remains `IN_PROGRESS` and **HOLD**. The diagnostic candidate still has an insufficient,
over-budget sample; do not promote or send further production traffic without another explicit owner
decision.

## Owner-approved Vercel security release — 2026-10-23

- PR #322 merged as `9a05f8bea27639d74f18b692ed0deabf584ee0e3`. Trivy initially identified two
  critical and one high Next.js 16.3.8 advisories; the PR updated Next.js to fixed version 16.4.1,
  after which all PR checks passed.
- The owner approved a Vercel-only production release. Protected run
  [39972999116](https://github.com/LQH-coding-frenzy/atmos/actions/runs/39972999116) completed on
  that SHA; exact-candidate and production-domain smoke/security-header checks passed, and the public
  homepage returned HTTP 200. No Edge Runtime workflow was dispatched by this release.
- PERF-002 remains `IN_PROGRESS`: all candidate samples were partial and above the 7 ms gate. The
  Next.js transform is deployed and the shared service credential is bound to the current 0%-candidate
  version, but CPU/error sampling has not passed. Stable Worker release `96434d008bd2` remains at 100%.
