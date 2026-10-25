# PERF-002 — Expanded weather/AQI Worker CPU remediation

Date: 2026-10-25

Status: **IN_PROGRESS — candidate remains at 100% per owner direction; post-exposure CPU is over
budget in the 31-event Worker Observability sample.** Pre-exposure exact-version CPU p95 and bounded
cache-miss/cache-hit p95 were below 7 ms. The post-exposure exact-version event sample has CPU p95
`17 ms` (max `19 ms`); its route-specific dashboard subset is still below its own 30-event floor.
The latest WAE check (`11:53Z`) returned `INSUFFICIENT_DATA`; the last Grafana PASS was at `11:45Z`
and is no longer fresh. No additional weather/provider requests were generated after promotion. Two
application-level 5xx responses were counted in the bounded test; at least one correlated 503 is
confirmed as an upstream provider timeout.

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
  values were read. Direct read-only probes confirmed the Vercel route returns 405 for GET and 401
  for an unauthenticated POST before provider work. Filtered Vercel logs showed those probes and
  homepage entries, but no authenticated candidate-route event.
- After separate owner approval, one additional version-override request returned HTTP 503 with no
  `x-cache` status (request ID `e1756520-81fa-4233-9ef7-bb8af0aab422`); count it as at most 5
  weighted units. Exact-version analytics for the surrounding five-minute window returned 1
  invocation, 0 platform errors, and p50/p95/p99 `6.258 ms`. The sample is insufficient and the
  application request still failed; no cache-hit workload or further requests were sent.
- The version-filtered Wrangler tail did not return a failure-class event, so the Worker-to-Vercel
  failure boundary remains unknown. The ephemeral local token/secret files were removed after
  upload; the Vercel and candidate-version secrets remain configured.
- After PR #327's redirect-safe change was merged, a new candidate
  `4aca9ef3-87b9-40ac-8980-4ed4723d1982` was held at 0% in deployment
  `0cbd4371-175f-43d4-8064-44edb5ceaed1`; stable remained at 100%. Its no-provider
  `/health/transform` probe returned 200. A single dashboard request then returned HTTP 200 with
  `x-cache: MISS` at `2026-10-24T14:44:55.732Z` (request ID
  `c64095ac-ef13-48d6-84fd-143bd13d50a0`), for at most 5 weighted units.
- Exact-version analytics for `2026-10-24T14:44:00Z`–`2026-10-24T14:45:00Z` returned 1 invocation,
  0 platform errors, and p50/p95/p99 `7.136 ms`. This is not a reliable percentile and is slightly
  above the 7 ms gate. No cache-hit workload was run. The redirect-safe path succeeded, but one
  request cannot establish why earlier attempts returned 503 or whether the CPU gate passes.
- After a separate bounded-test approval, 69 unique dashboard requests returned HTTP 200 with
  `x-cache: MISS` during `2026-10-24T14:49:41.270Z`–`2026-10-24T14:51:07.546Z`; estimated provider
  usage was 345 weighted units. Exact-version analytics reported 64 invocations, 0 platform errors,
  CPU p50 `3.161 ms`, p95 `4.839 ms`, and p99 `6.962 ms` for the miss window.
- The subsequent 100 repeated requests all returned HTTP 200 with `x-cache: HIT` during
  `2026-10-24T14:55:09.662Z`–`2026-10-24T14:55:34.117Z`, with no additional provider calls. The
  first one-minute analytics read reported only 16 invocations, 0 platform errors, CPU p50
  `1.328 ms`, p95 `5.856 ms`, and p99 `5.856 ms`, below the 30-request analysis floor. A later
  exact-window re-query is recorded in the final evidence section below.
- The bounded miss/hit sample used 345 weighted units, below its approved budget. No more requests
  were sent after this initial hit window.
- Final verification confirmed stable 100% / candidate 0%, ordinary `/version` still
  `96434d008bd2`, and no Edge Runtime workflow or Worker rollback.

At the time of this initial read, PERF-002 remained **HOLD** because the hit sample was not yet
sufficient. The later read-only analytics re-query and bounded hit sample below resolve that hold.

## Owner-approved Vercel security release — 2026-10-23

- PR #322 merged as `9a05f8bea27639d74f18b692ed0deabf584ee0e3`. Trivy initially identified two
  critical and one high Next.js 16.3.8 advisories; the PR updated Next.js to fixed version 16.4.1,
  after which all PR checks passed.
- The owner approved a Vercel-only production release. Protected run
  [39972999116](https://github.com/LQH-coding-frenzy/atmos/actions/runs/39972999116) completed on
  that SHA; exact-candidate and production-domain smoke/security-header checks passed, and the public
  homepage returned HTTP 200. No Edge Runtime workflow was dispatched by this release.
- PERF-002 remains `IN_PROGRESS`: candidate samples are partial and inconsistent, and an override
  request returned HTTP 503. The Next.js transform is deployed and the shared service credential is
  bound to the current 0%-candidate version, but CPU/error sampling has not passed. Stable Worker
  release `96434d008bd2` remains at 100%.

## Final bounded CPU evidence — 2026-10-24

- During the CPU-sampling phase, candidate Worker version `4aca9ef3-87b9-40ac-8980-4ed4723d1982`,
  tagged with merged `main` commit `cba92d072d7f`, was held at 0% and stable version
  `2da40785-0b9e-430c-bdac-c9ad6254ff68` remained at 100%. Its later owner-approved promotion is
  recorded below.
- The exact-version Cloudflare Analytics GraphQL query used
  `workersInvocationsAdaptive`, `scriptName=atmos-gateway`,
  `scriptVersion_in=[4aca9ef3-87b9-40ac-8980-4ed4723d1982]`, `isPreview=0`, and the bounded UTC
  windows listed below. CPU values are reported in milliseconds after converting Cloudflare's
  microsecond values.
- Cache-miss sample: 69 unique dashboard requests returned HTTP 200 with `x-cache: MISS` during
  `2026-10-24T14:49:41.270Z`–`2026-10-24T14:51:07.546Z`; estimated provider usage was 345 weighted
  units. Analytics recorded 64 invocations, 0 platform errors, CPU p50 `3.161 ms`, p95 `4.839 ms`,
  and p99 `6.962 ms`. The client-response count and analytics invocation count differ; the
  analytics sample itself exceeds the 30-invocation floor.
- Initial cache-hit sample: 100 repeated requests returned HTTP 200 with `x-cache: HIT` during
  `2026-10-24T14:55:09.662Z`–`2026-10-24T14:55:34.117Z`, with no provider calls. Re-querying that
  exact interval returned 89 analytics invocations, 0 platform errors, CPU p50 `1.202 ms`, p95
  `2.239 ms`, and p99 `7.082 ms`. This resolves the earlier immediate read of 16 invocations; both
  the re-query and the later hit sample exceed the analysis floor.
- After cache expiry, one repeat returned HTTP 200 with `x-cache: MISS` at
  `2026-10-24T14:59:26.385Z` (request ID `32ef288b-d4a4-4970-84e7-d525f38d713f`), for at most 5
  weighted units. The subsequent 199 repeats all returned HTTP 200 with `x-cache: HIT` during
  `2026-10-24T15:01:36.824Z`–`15:02:34.716Z`, with no provider calls. Exact-window analytics recorded
  194 invocations, 0 platform errors, CPU p50 `1.229 ms`, p95 `2.135 ms`, and p99 `5.491 ms`.
- For this candidate's bounded weather workload, the 69 misses, the initial successful miss, and
  the post-expiry miss represent at most 355 estimated weighted provider units; repeated cache hits
  made no additional provider calls. The post-promotion smoke below included one weather request,
  conservatively adding at most 5 units. Earlier failed candidate attempts remain documented above
  and were stopped at the first failure. No response body, provider payload, raw request URL, or
  coordinates were recorded.
- Both cache-miss and cache-hit samples have at least 30 exact-version analytics invocations, zero
  platform errors, and CPU p95 below the unchanged 7 ms gate. All sampled candidate weather requests
  after the redirect-safe deployment returned HTTP 200. Earlier 503 failures occurred on prior
  candidates; their precise cause was not conclusively established.
- The pre-promotion cache-miss/cache-hit CPU checks passed, but PERF-002 remains **IN_PROGRESS**
  pending post-exposure validation. The later owner-approved promotion and subsequent CPU regression
  are recorded next. No database change or paid-resource change occurred.

## Owner-approved production promotion and monitoring — 2026-10-24

- The owner explicitly approved full promotion of the already measured candidate. Before promotion,
  WAE release-gate run [40107720236](https://github.com/LQH-coding-frenzy/atmos/actions/runs/40107720236)
  returned `PASS`: stable 31 / candidate 371 weighted samples, 0% errors for both, p95 wall time
  2,188 ms stable / 313 ms candidate. The configured limits were 2% error rate and 3,282 ms candidate
  p95. Two earlier reads were `INSUFFICIENT_DATA` (stable 29, then 28); six bounded stable `/health`
  probes returned HTTP 200 without provider calls before the passing read.
- A fresh Grafana `probe_success{job=~"Atmos.*"}` evaluation immediately before promotion returned
  `PASS` for all four production checks. A second evaluation at
  `2026-10-24T15:42:16.908Z`, after promotion, also returned `PASS` for the frontend, edge,
  dependencies, and weather checks; each latest sample was from `15:42:13.746Z` (about 3 seconds
  old).
- Wrangler deployed `2da40785-0b9e-430c-bdac-c9ad6254ff68@0` and
  `4aca9ef3-87b9-40ac-8980-4ed4723d1982@100` at `2026-10-24T15:40:50.158Z`, deployment
  `0db515e6-2017-4e74-8a46-53ccf4a36752`. No new Worker version or backend function was created;
  the exact CPU-measured version was promoted. Stable remains attached at 0% for rollback.
- Ordinary `/health`, `/health/transform`, and `/version` returned HTTP 200; `/version` reported
  `cba92d072d7f`. The documented post-promotion smoke passed health, release identity, public
  weather, and unauthenticated-route checks (HTTP 401 for the protected route).
- Exact-version CPU analytics for `2026-10-24T14:44:00Z`–`2026-10-24T15:43:50.222Z` recorded 372
  invocations, 0 platform errors, CPU p50 `1.328 ms`, p95 `4.251 ms`, and p99 `8.150 ms`. This
  bounded window includes the pre-promotion override sample and the initial 100%-traffic period; it
  is not presented as a production-only percentile.
- The first post-promotion-only CPU snapshot (`15:40:50.158Z`–`15:42:48.869Z`) contained 7
  invocations and 0 errors; one adaptive bucket reported p95 `10.170 ms`. That window is below the
  30-invocation floor and is not treated as a reliable pass or fail. The larger exact-version window
  above passes the CPU gate, the post-promotion WAE run below passes, and fresh synthetics are green.
- Post-promotion WAE release-gate run
  [40108324584](https://github.com/LQH-coding-frenzy/atmos/actions/runs/40108324584) returned
  `PASS`: stable 34 / candidate 377 weighted samples, 0% errors for both, p95 wall time 2,188 ms
  stable / 313 ms candidate. This wall-duration gate did not replace the Worker CPU gate.
- Later exact-version CPU analytics for `2026-10-24T15:40:50.158Z`–`2026-10-24T16:51:27.018Z`
  recorded 33 invocations, 0 platform errors, CPU p50 `8.177 ms`, p95 `19.913 ms`, and p99
  `23.052 ms`. This exceeds the 7 ms CPU limit with at least the 30-invocation floor. The broader
  exact-version window `2026-10-24T14:44:00Z`–`2026-10-24T16:51:27.018Z` recorded 398 invocations,
  0 platform errors, CPU p50 `1.341 ms`, p95 `8.150 ms`, and p99 `13.661 ms`.
- The protected rollback plan
  [40113501573](https://github.com/LQH-coding-frenzy/atmos/actions/runs/40113501573) validated the
  version identities but stopped before changing traffic because its stable-target smoke on
  `api.rainify.dpdns.org` returned HTTP 403. The exact stable version passed the documented smoke on
  `atmos-gateway.rainify.workers.dev` (health, release, weather, and unauthenticated-route checks).
- Under the owner's rollback authorization, Wrangler's documented rollback primitive restored
  stable Worker `2da40785-0b9e-430c-bdac-c9ad6254ff68` / release `96434d008bd2` to 100% at
  `2026-10-24T16:56:20.670Z`, deployment `cd43ba33-690d-41fc-922e-73c3e30d8de0`. The post-rollback
  smoke passed. The candidate was later attached at 0% for route-isolated diagnosis; stable remained
  at 100% in deployment `3e1a3c28-546f-4ec2-af72-3319b8ef5630`.
- At this point, PERF-002 remained **IN_PROGRESS** because the mixed-route CPU regression was not
  resolved by the cache serialization change alone. The later startup-profile follow-up is below.
  No database or paid-resource changes occurred.

## Route diagnosis and local cache-miss optimization — 2026-10-24

- Read-only WAE route-group rows from the failed 100% window included `weather_dashboard` MISS events
  at `15:48:29`, `15:49:59`, and `16:03:29` UTC. The exact-version CPU query had above-budget adaptive
  buckets immediately adjacent to those events at `15:48:28` (`11.580 ms`), `15:49:59` (`9.001 ms`),
  and `16:03:27` (`23.052 ms`). This correlation points to the weather cache-miss path; the dashboard
  hit samples remained substantially lower.
- With the candidate held at 0%, five-request route-isolated probes returned HTTP 200 for `/health`,
  `/health/transform`, `/version`, and `/health/dependencies`, and HTTP 401 for `/api/v1/me`. Exact
  version CPU samples were: health p95 `5.107 ms`; transform-health first sample p95 `18.519 ms`,
  then a warmed sample p95 `3.824 ms`; version p95 `4.887 ms`; dependency-health first sample p95
  `7.542 ms`, with a later two-invocation sample p95 `5.789 ms`. The warm operational paths are not
  sufficient to explain the sustained production regression; the first transform sample indicates
  an additional cold/first-call cost to investigate.
- A bounded dashboard MISS followed by four HITs returned HTTP 200 throughout. The short exact-version
  window had six analytics invocations, 0 errors, and p95 CPU `7.244 ms`; WAE sampled five weather
  dashboard HIT events for that interval, so this small probe is not treated as a conclusive miss
  percentile. The potential provider usage was at most 5 weighted units.
- Source review identified repeated serialization on every dashboard/AQI cache miss: the large
  normalized payload was serialized for the client response and again for both fresh and stale cache
  variants. The Worker now serializes the non-metadata payload once and appends the small cache-state
  metadata variants for the client/fresh/stale responses. This preserves response/cache metadata and
  applies to both dashboard and AQI miss paths.
- New Worker tests assert that dashboard and AQI cache misses serialize the full payload once while
  preserving their distinct cache metadata. Validation passed: 41 focused Worker tests, repository
  typecheck, targeted ESLint, Prettier, `git diff --check`, and the gateway dry-run build.
- The serialization optimization was merged in PR #328 and tested in a later candidate. Its
  post-exposure regression and rollback are recorded below; the additional startup change remains
  local.

## Post-merge candidate verification and startup diagnosis — 2026-10-25

- PR #328 merged to `main` as `3cffd47794c0789175117166a2a9beff7052c555`. The first two 0%-candidate
  uploads used an 11-character release ID and failed `/version`/`/health/transform`; they received no
  weather requests. The corrected 12-character release ID is `3cffd47794c0`.
- Optimized candidate `cdff2ef6-2834-4f50-bae9-b26e3ebd200f` passed no-provider smoke: `/health`,
  `/health/transform`, and `/version` returned HTTP 200 (`3cffd47794c0`); unauthenticated `/api/v1/me`
  remained HTTP 401. Stable stayed at 100% during the bounded samples.
- Thirty unique dashboard requests returned HTTP 200 with `x-cache: MISS`; estimated maximum
  provider use was 150 weighted units. Exact-version CPU analytics for `2026-10-25T08:43:00Z`–
  `08:44:00Z` recorded 32 invocations, 0 errors, p50 `2.920 ms`, p95 `5.563 ms`, and p99 `9.327 ms`.
- One hundred repeated requests returned HTTP 200 with `x-cache: HIT` and no provider calls. The
  combined exact-version hit window (`08:44:00Z`–`08:47:00Z`) recorded 120 invocations, 0 errors,
  p50 `1.775 ms`, p95 `5.514 ms`, and p99 `11.177 ms`. An initial 70-invocation subwindow reported
  p95 `9.402 ms`; the later warmed 50-invocation subwindow reported p95 `5.364 ms`. Both readings
  are retained here rather than hiding the early outlier.
- WAE route data for the bounded sample recorded 30 weighted `weather_dashboard` misses and 48
  weighted hits, both with 0% errors; p95 wall time was 617 ms for misses and 27 ms for hits. The
  count is sample-weighted and differs from client response totals.
- After the owner-authorized full promotion, the exact candidate had 39 invocations and 0 errors in
  `2026-10-25T09:06:07.586Z`–`09:14:59.819Z`, but CPU p95 was `9.651 ms` (p99 `9.748 ms`). Stable
  version `2da40785-0b9e-430c-bdac-c9ad6254ff68` was restored to 100% in deployment
  `8871b6ee-1b5f-4855-b88f-24cde39bd9cc`; the candidate is no longer serving. The pre-promotion WAE
  and Grafana gates passed, so CPU remains the blocker.
- A local `wrangler check startup` profile of the merged Worker showed `41.1 ms` active startup CPU
  across 21 samples; its top frames included Zod schema construction from eagerly imported runtime
  contracts. The follow-up lazily imports `OpenMeteoProvider` and route-specific runtime schemas.
  Local profile active time fell to `3.2 ms` (3 samples; bundle `999.28 KiB`, gzip `159.06 KiB`).
  This is local diagnostic evidence, not a Cloudflare CPU measurement.
- The startup optimization and a lazy-provider regression test are local in this follow-up PR. Local
  validation passed: 42 focused Worker tests, repository typecheck, targeted ESLint, Prettier,
  `git diff --check`, and gateway dry-run build. Stable remains at 100%; no version containing the
  startup change has been uploaded.
- PERF-002 remains **IN_PROGRESS** until a new exact-version candidate verifies the startup change
  with cache-miss and cache-hit CPU p95 at or below 7 ms. No further production traffic was sent after
  the stable rollback.

## Cache serialization candidate revalidation and startup follow-up — 2026-10-25

- The cache-miss serialization code from PR #328 was tested as candidate
  `cdff2ef6-2834-4f50-bae9-b26e3ebd200f`, release `3cffd47794c0`. Preliminary uploads with an
  11-character release ID remained at 0% and failed `/version`/`/health/transform`; they received no
  weather requests. The corrected candidate passed `/health`, transform-health, version, and
  unauthenticated-route smoke.
- Bounded workload: 30 distinct dashboard requests returned HTTP 200 `MISS`; estimated provider use
  was at most 150 weighted units. Exact-version CPU analytics for
  `2026-10-25T08:43:00Z`–`08:44:00Z` recorded 32 invocations, 0 errors, p50 `2.920 ms`, p95
  `5.563 ms`, and p99 `9.327 ms`.
- One hundred repeats returned HTTP 200 `HIT` with no provider calls. The combined cache-hit window
  `08:44:00Z`–`08:47:00Z` recorded 120 invocations, 0 errors, p50 `1.775 ms`, p95 `5.514 ms`, and
  p99 `11.177 ms`. The initial 70-invocation slice had p95 `9.402 ms`; the later warmed
  50-invocation slice had p95 `5.364 ms`. Both readings are retained; the broader hit sample is below
  the 7 ms p95 gate.
- The pre-promotion WAE gate
  [40179160434](https://github.com/LQH-coding-frenzy/atmos/actions/runs/40179160434) passed with
  stable 32 / candidate 138 weighted samples, 0% errors for both, and p95 wall time `1,633 ms`
  stable / `593 ms` candidate. The post-promotion gate
  [40179439361](https://github.com/LQH-coding-frenzy/atmos/actions/runs/40179439361) also passed
  (stable 62 / candidate 146; 0% errors). All four Grafana synthetics passed after promotion.
- Owner-approved deployment `23cc2a87-e9cc-4c01-bdac-c9ad6254ff68` assigned stable 0% / candidate
  100% at `2026-10-25T09:06:07.586Z`. The post-exposure exact-version CPU window
  `09:06:07.586Z`–`09:14:59.819Z` recorded 39 invocations, 0 errors, CPU p95 `9.651 ms` (p99
  `9.748 ms`). The CPU gate failed despite cache-specific samples passing; Wrangler restored stable
  release `96434d008bd2` to 100% at `09:14:59.819Z`.
- Current state remains stable 100% with no candidate attached. The merged cache-miss optimization
  improves the weather miss sample but is not sufficient for the mixed-route production CPU p95.
  Subsequent local startup profiling found eager provider/schema initialization: active startup
  profile time fell from `41.1 ms` (21 samples) to `3.2 ms` (3 samples) after lazy imports. This is
  local-only evidence, not a Cloudflare candidate result.
- At that point, the lazy-startup change was in a follow-up PR and had passed 42 focused Worker tests,
  repository typecheck, targeted ESLint, Prettier, `git diff --check`, and gateway dry-run build. It
  was later merged as PR #329 and is covered by the candidate verification below. No database or
  paid-resource changes occurred.

## Lazy-startup candidate verification and release hold — 2026-10-25

- PR #329 merged the lazy imports for `OpenMeteoProvider` and runtime schemas as
  `d81923250215005dc776b660d740b024f9c0cf32`. Candidate Worker version
  `2503a1f0-985f-4026-a368-bd9bb5504d23`, release `d81923250215`, is attached at 0% in deployment
  `b934665e-27a9-446f-871e-09f7aa0085f1`; stable version
  `2da40785-0b9e-430c-bdac-c9ad6254ff68` / release `96434d008bd2` remains at 100%.
- Candidate-only smoke passed: `/health`, `/health/transform`, and `/version` returned HTTP 200;
  `/version` identified `d81923250215`; unauthenticated `/api/v1/me` returned HTTP 401.
- Exact-version Cloudflare adaptive CPU analytics over `2026-10-25T09:55:40Z`–`10:20:00Z` recorded
  162 invocations, 0 platform errors, p50 `2.194 ms`, p95 `6.269 ms`, and p99 `11.307 ms`. Separately,
  the bounded cache-miss interval `10:19:05.560Z`–`10:19:23.752Z` recorded 27 analytics invocations
  (28 client requests), 0 errors, p50 `4.489 ms`, p95 `5.087 ms`, p99 `5.141 ms`. The 50 repeated
  cache hits in `10:19:37.754Z`–`10:19:53.106Z` measured p50 `1.675 ms`, p95 `5.248 ms`, p99
  `12.612 ms`, with 0 errors. These cache-specific p95 results are below the 7 ms CPU threshold.
- A route-level join of Workers Observability events to WAE cache-status events (±2 seconds) over
  `09:55:40Z`–`10:20:00Z` matched 57 MISS events and 102 HIT events. CPU values are rounded to whole
  milliseconds: MISS p50 `4 ms`, p95 `6 ms`, max `11 ms`; HIT p50 `1 ms`, p95 `6 ms`, max `12 ms`.
  This independently supports the bounded route-specific p95 readings; it is not the WAE release
  gate.
- The WAE release-gate workflow remained `INSUFFICIENT_DATA`. Run
  [40184650262](https://github.com/LQH-coding-frenzy/atmos/actions/runs/40184650262) had stable 19
  and candidate 166 weighted samples, candidate weighted error rate about `1.20%`, and candidate p95
  wall time `468 ms`. A later run,
  [40185392457](https://github.com/LQH-coding-frenzy/atmos/actions/runs/40185392457), also returned
  `INSUFFICIENT_DATA` (stable sample count 16). These results do not satisfy the release gate.
- The WAE candidate window counted two application-level 5xx responses (the bounded client batch
  included an HTTP 503). The sanitized Worker diagnostic classified the correlated failure as
  `upstream_5xx`; its matching Vercel log recorded `AbortError` after the five-second upstream fetch
  timeout. This pinpoints at least one observed 503 to an upstream timeout, not Worker CPU or
  authorization. No automatic retry was added, to avoid increasing provider load; the failed
  coordinates were not retried.
- **Provider-budget accounting caveat:** the request history contains 31 distinct cache-key attempts:
  30 successful unique MISS responses and one timed-out 503. At the conservative maximum of five
  weighted provider units per attempt, potential usage is at most 155 units if the timed-out request
  reached the provider—up to five above the originally stated 150-unit cap. Actual provider billing
  units for the timeout were not confirmed. No further production requests will be sent under this
  test authorization.
- No Grafana candidate release gate was run after this sample. With WAE returning `INSUFFICIENT_DATA`,
  and without a fresh passing Grafana gate, promotion is not authorized. Stable remains at 100% and
  candidate at 0%; no production traffic shift or rollback was made. PERF-002 remains **IN_PROGRESS**.

## Read-only release-gate recheck — 2026-10-25

- The owner authorized up to 20 stable `/health` probes only if the candidate still had at least 30
  WAE samples. No probes were needed or sent: a read-only WAE gate rerun passed without additional
  test traffic.
- WAE release-gate run
  [40186106356](https://github.com/LQH-coding-frenzy/atmos/actions/runs/40186106356), evaluated at
  `2026-10-25T10:46:05Z` with a 60-minute lookback and 30-sample floor, returned `PASS`. Stable had
  67 weighted samples, 0% errors, and p95 wall `1,330 ms`; candidate had 166 weighted samples,
  `1.2048%` errors, and p95 wall `468 ms`. Limits were 2% error rate and `2,500 ms` p95 wall time.
- A read-only Grafana query using the gate's exact PromQL,
  `probe_success{job=~"Atmos.*"}`, returned value `1` for production frontend, edge, weather, and
  dependencies. All four latest samples were timestamped `2026-10-25T10:47:12.505Z` (about one
  second old), inside the gate's 30-minute freshness limit.
- A final read-only Wrangler deployment inventory confirmed deployment
  `b934665e-27a9-446f-871e-09f7aa0085f1` still assigns stable version
  `2da40785-0b9e-430c-bdac-c9ad6254ff68` 100% and candidate version
  `2503a1f0-985f-4026-a368-bd9bb5504d23` 0%. No traffic shift occurred.
- The exact-version CPU results above remain below the 7 ms p95 gate, and the WAE/Grafana release
  gates now pass. This is not promotion approval: no traffic change was made without a separate
  explicit owner decision. PERF-002 remains **IN_PROGRESS** pending that decision and any requested
  post-exposure validation.

## Owner-approved promotion and immediate post-exposure checks — 2026-10-25

- Evidence PR #330 was merged as `f473156dacdc6e05bdcd87fd311da190c284806f`. With explicit owner
  approval and all pre-exposure gates passing, Wrangler deployed stable version
  `2da40785-0b9e-430c-bdac-c9ad6254ff68` at 0% and candidate
  `2503a1f0-985f-4026-a368-bd9bb5504d23` / release `d81923250215` at 100% in deployment
  `977c9882-24cf-4140-8fe8-3bf9cf6e1ae8` at `2026-10-25T10:53:37.623Z`.
- Post-exposure no-provider smoke passed: `/health` and `/health/transform` returned HTTP 200 with
  `{"status":"ok"}`; `/version` reported `d81923250215`; unauthenticated `/api/v1/me` returned
  HTTP 401. No weather endpoint was called.
- Post-exposure WAE read-only gate
  [40186922785](https://github.com/LQH-coding-frenzy/atmos/actions/runs/40186922785) returned
  `PASS` with a 60-minute lookback: stable 66 weighted samples, 0% errors, p95 wall `1,129 ms`;
  candidate 165 weighted samples, `0.6061%` errors, p95 wall `468 ms`. Limits were 2% errors and
  `2,500 ms` p95 wall. This is a rolling window, not a post-promotion-only sample.
- A fresh read-only Grafana gate query returned `1` for all four production synthetics
  (`frontend`, `edge`, `weather`, `dependencies`) at `2026-10-25T11:02:31.270Z`; samples were about
  one second old and within the 30-minute freshness limit.
- A sanitized Workers Observability query from the promotion time through the immediate smoke found
  four candidate events: three HTTP 200 and one expected HTTP 401, all with outcome `ok`; observed
  CPU median was `2 ms`, maximum `7 ms`. This small smoke-only sample is below the 30-invocation
  analysis floor and does **not** establish a post-exposure CPU p95. The pre-exposure exact-version
  adaptive CPU result remains p95 `6.269 ms`; no new provider workload was authorized or sent.
- The candidate remains at 100% under the owner's explicit promotion approval. No rollback was
  performed because the post-exposure CPU sample is insufficient rather than over budget. PERF-002
  remains **IN_PROGRESS** pending sufficient naturally observed exact-version CPU data or further
  owner direction.

## Natural post-exposure CPU monitoring — 2026-10-25

- A read-only Workers Observability query through `2026-10-25T11:30:09Z` found 13 exact-candidate
  events since the approved promotion. Overall observed CPU p50 was `5 ms`, nearest-rank p95 `16 ms`,
  max `16 ms`; all 13 outcomes were `ok`. This remains below the 30-event analysis floor, so the
  p95 is provisional and must not be reported as a conclusive gate result.
- The four `weather_dashboard` events were HTTP 200 with outcomes `ok`; their observed CPU median was
  `9 ms`, max `16 ms`. This is an early route-specific warning above the 7 ms target, not a
  statistically sufficient route p95. Health, transform-health, version, and protected-route
  observations were lower and the expected protected-route response remained HTTP 401.
- Per owner direction, the candidate remains at 100% while only read-only natural monitoring
  continues. No synthetic weather requests, provider calls, or rollback were performed. PERF-002
  remains **IN_PROGRESS** until a sufficient exact-version CPU sample is available and reviewed.

### Follow-up sample — 2026-10-25T11:40Z

- A later read-only query found 16 exact-candidate events since promotion. Observed CPU p50 was
  `8 ms`, nearest-rank p95 estimate `17 ms`, and max `17 ms`; all outcomes were `ok` (15 HTTP 200,
  one expected HTTP 401). This remains below the required 30-event floor and is not a conclusive
  post-exposure p95.
- The six `weather_dashboard` events had observed CPU median `9 ms`, nearest-rank p95 estimate
  `17 ms`, and max `17 ms`. This strengthens the early warning on that route but remains a small
  sample. The candidate remains at 100% per owner direction; monitoring has generated no traffic.

### Rolling-gate and natural-sample update — 2026-10-25T11:53Z

- The post-promotion WAE workflow
  [40190756424](https://github.com/LQH-coding-frenzy/atmos/actions/runs/40190756424) returned
  `INSUFFICIENT_DATA` at the 30-sample floor. The candidate had 20 weighted samples, 0% errors, and
  p95 wall `1,735 ms`; stable also lacked the required sample row. The earlier post-promotion WAE
  `PASS` above used a 60-minute rolling window that still contained the pre-promotion candidate
  workload; it is not evidence of a post-exposure-only pass.
- A fresh Grafana query at `2026-10-25T11:45:38.707Z` still returned `1` for all four production
  synthetics, within the 30-minute freshness limit.
- Natural CPU monitoring found 20 candidate events since promotion: observed CPU p50 `8 ms`,
  nearest-rank p95 estimate `16 ms`, max `17 ms`; eight were `weather_dashboard` events with observed
  maximum `17 ms`. Both CPU and WAE sample counts remain below their 30-event floor. Keep the
  candidate at 100% per owner direction, make no synthetic/provider requests, and do not claim a
  post-exposure pass or fail until the sample is sufficient.

### Natural CPU sample reaches invocation floor — 2026-10-25T12:33Z

- A sanitized Cloudflare Workers Observability query from the approved promotion time through
  `2026-10-25T12:33:27Z` found 31 exact-candidate per-invocation CPU events. Nearest-rank CPU p50 was
  `9 ms`, p95 `17 ms`, max `19 ms`. All outcomes were `ok` (30 HTTP 200 and one expected HTTP 401).
  This exceeds the unchanged 7 ms CPU budget. It is an event-level Workers Observability sample,
  not a refreshed `workersInvocationsAdaptive` GraphQL result.
- The 13 `weather_dashboard` events had CPU p50 `10 ms`, p95 `19 ms`, max `19 ms`; that route subset
  is still below its 30-event analysis floor, so its percentile is preliminary. The overall sample
  reached the 30-event floor and is an over-budget warning requiring local remediation.
- The latest WAE workflow remains the `11:53Z` `INSUFFICIENT_DATA` run above. The last Grafana PASS
  was at `11:45Z`; it is stale by this observation time. Per owner direction, candidate stays at
  100% while diagnosis/fix work remains local. No rollback or additional production traffic was
  performed.
