# Atmos Interview & Demo Package (`PORT-002`)

Timed 12-minute portfolio walkthrough, pre-demo checklist, evidence-backed answers to all 23
architecture/DevSecOps questions from Section 35.2 of the
[master plan](../architecture/atmos-devsecops-master-plan.md), and the deferred production hardening
roadmap.

## Pre-Demo Readiness Checklist

Follow [docs/operations/cv-showcase-maintenance.md](../operations/cv-showcase-maintenance.md) before
presenting live:

1. **Local verification gates:** run `corepack pnpm lint`, `corepack pnpm typecheck`,
   `corepack pnpm test`, `corepack pnpm build`, and `corepack pnpm test:e2e`.
2. **Visual responsiveness check:** inspect `https://rainify.dpdns.org/` at desktop and `390 px`
   mobile widths (no horizontal overflow, accessible chart/navigation controls).
3. **Live endpoint verification:**
   - `GET https://rainify.dpdns.org/` renders live Berlin weather (never mock data on failure).
   - `POST https://rainify.dpdns.org/api/public/v1/weather/dashboard` (`Content-Type: application/json`,
     `Origin: https://rainify.dpdns.org`) returns HTTP `200` with `meta.provider: "open-meteo"`.
   - `GET https://atmos-gateway.rainify.workers.dev/health` returns `{"status":"ok"}`.
   - `GET https://atmos-gateway.rainify.workers.dev/health/dependencies` returns
     `{"status":"ok","database":"ok"}`.
   - `GET https://atmos-gateway.rainify.workers.dev/version` returns the active stable release ID.
4. **DR demonstration safety rule:** show the verified evidence in
   [docs/evidence/restore-001/2026-09-19.md](../evidence/restore-001/2026-09-19.md) and
   [docs/evidence/azjob-001/2026-10-07.md](../evidence/azjob-001/2026-10-07.md) rather than
   triggering a live restore drill or Azure Container Apps Job run.

---

## Timed 12-Minute Walkthrough Script

### Minute 0–2 — Product & Truthful Degradation

- **Open:** [`https://rainify.dpdns.org/`](https://rainify.dpdns.org/)
- **Demonstrate:**
  - Live Berlin observation, 12-hour forecast, 7-to-16-day outlook, accessible chart table, metric/imperial
    unit toggle, interactive map marker/RainViewer radar sequence, and on-demand AQI panel.
  - Signed-in capabilities: saved locations (favorites, categories, default sync), manual
    observation capture (7/30/90-day history, no automatic backfill), and in-app alert rules with
    schedules/cooldowns evaluated against the active dashboard.
  - **Key talking point:** unavailable upstream weather shows an explicit unavailable message rather
    than falling back to fake/mock numbers ([apps/web/app/page.tsx](../../apps/web/app/page.tsx)).

### Minute 2–4 — Architecture Decision & Cost Discipline

- **Open:** [README.md](../../README.md),
  [ADR 0005](../adr/0005-public-weather-runtime-placement.md), and
  [docs/cost/quota-budget.md](../cost/quota-budget.md)
- **Explain the active stack:**
  - **Vercel Hobby (Next.js):** frontend + same-origin `/api/public/v1/weather/*` Route Handlers,
    Vercel Runtime Cache (`5m` fresh, `1h` stale-if-error), and Hobby WAF rule (`60 req / 10 min / IP`
    across `/` and `/api/public/v1/weather/`).
  - **Cloudflare Workers Free + Hono:** `api.rainify.dpdns.org` / `workers.dev` edge gateway for
    geocoding search, bounded map/radar routes, `/health` + `/health/dependencies`, CORS/security,
    WAE request telemetry, and authenticated API proxy.
  - **Supabase Free:** Auth, Postgres with Row Level Security (RLS), and release-versioned Edge
    Functions (`api-<sha>` + `api-v1`).
  - **Cloudflare R2 + Azure (on-demand):** client-side encrypted logical backups in private R2 via an
    on-demand Container Instance / manual Workload Profiles ACA Job.
- **Why Kubernetes (GKE) was removed & why `CVRET-001` retired queues:** steady-state traffic for
  a single-owner weather showcase does not justify always-on control-plane/node cost or idle
  operational toil. Under [CVRET-001](../evidence/cvret-001/2026-09-22.md), Cloudflare Queues and
  the idle ACA Log Analytics workspace were also retired so steady-state recurring cost stays **\$0/month**.

### Minute 4–6 — CI / DevSecOps Gates

- **Open:** [pr.yml](../../.github/workflows/pr.yml),
  [security.yml](../../.github/workflows/security.yml),
  [database.yml](../../.github/workflows/database.yml),
  [e2e.yml](../../.github/workflows/e2e.yml), and
  [SBOM-001](../evidence/sbom-001/2026-09-09.md)
- **Show required `main` checks:**
  - Formatting (`prettier`), runbook structure validator (`validate-runbooks.mjs`), Terraform
    `fmt -check`, ESLint (`--max-warnings=0`), TypeScript `tsc -b`, Vitest + Node script tests, and
    full workspace build.
  - Ephemeral local Supabase reset + pgTAP RLS suite (`database`), Playwright UI E2E (`playwright`),
    Gitleaks (`secret-scan`), CodeQL (`codeql`), Semgrep (`semgrep`), Trivy `HIGH,CRITICAL` (`trivy`),
    and CycloneDX SBOM (`sbom`, `4,521` B artifact).
  - HCP Terraform remote speculative plans validate IaC changes with zero auto-apply on production.

### Minute 6–8 — Progressive Backend Delivery & Rollback Lesson

- **Open:** [docs/operations/production-worker-canary.md](../operations/production-worker-canary.md),
  [REL-004](../evidence/rel-004/2026-09-12.md),
  [REL-005](../evidence/rel-005/2026-09-30.md),
  [GAME-002](../evidence/game-002/2026-09-13.md), and
  [Postmortem](../postmortems/2026-09-13-worker-bad-canary-rollback.md)
- **Walk through:**
  - Paired immutable releases: `stable Worker -> api-<old>` alongside `candidate Worker -> api-<new>`
    held at `0%` and smoke-tested via `Cloudflare-Workers-Version-Overrides`.
  - Gradual `10% -> 25% -> 50% -> 100%` rollout gated on WAE + Grafana synthetics (`REL-004`) plus
    tab-scoped `sessionStorage` UUIDv4 affinity (`REL-005`, `97` keys, `0` drift across `261` stable
    and `30` candidate requests).
  - Expand/contract DB migrations so overlapping `api-<old>` and `api-<new>` releases stay schema-compatible.
  - **Real incident finding (`GAME-002` / `DOC-002`):** during the controlled `90/10` fault drill,
    WAE correctly flagged `FAIL` (`0.911` candidate error rate vs `0.02` budget), and `versions deploy`
    failed closed with Cloudflare error `10220` because `SUPABASE_FUNCTION_URL` changed between versions.
    Fixed via Cloudflare's native `wrangler rollback`, cutting recovery to `3m 45s` (`34754470476`).

### Minute 8–10 — Data Reliability, Security & DR

- **Open:** [GAME-003](../evidence/game-003/2026-09-09.md),
  [R2BACK-001](../evidence/r2back-001/2026-09-15.md),
  [RESTORE-001](../evidence/restore-001/2026-09-19.md),
  [GAME-004](../evidence/game-004/2026-09-07.md), and
  [GAME-005](../evidence/game-005/2026-09-07.md)
- **Walk through:**
  - `107` pgTAP RLS assertions (`GAME-003`) across 7 files proving owner-allow and cross-user / forged-JWT
    deny across reads, updates, deletes, and inserts, rolled back cleanly in a transaction.
  - Historical idempotent queue claim (`GAME-004`, `82` pgTAP assertions) and staging DLQ delivery
    (`GAME-005`) retained as verified async engineering evidence prior to `CVRET-001` queue retirement.
  - Client-side encrypted logical backup (`roles.sql`, `schema.sql`, `data.sql` + SHA-256 + HMAC
    sidecar) in private R2, verified by an **11-second** restore into an ephemeral Supabase project
    (`2026-09-19T18:13:52Z`–`18:14:03Z`), followed by immediate cleanup of temporary resources.

### Minute 10–12 — Containers, Observability & Honest Tradeoffs

- **Open:** [CTR-002](../evidence/ctr-002/2026-09-14.md),
  [CTR-003](../evidence/ctr-003/2026-09-14.md),
  [AZJOB-001](../evidence/azjob-001/2026-10-07.md),
  [GAME-007](../evidence/game-007/2026-10-11.md),
  [SLO-001](../evidence/slo-001/2026-09-12.md),
  [SLO-002](../evidence/slo-002/2026-09-12.md),
  [OBS-007](../evidence/obs-007/2026-09-10.md), and
  [PERF-002](../evidence/perf-002/implementation.md)
- **Walk through:**
  - Hardened `node:24.21.0-alpine3.23` job image (`0` HIGH/CRITICAL Trivy vulns, `20`-component SBOM,
    keyless GitHub OIDC Cosign signature + attestation verified by exact digest in `CTR-003`).
  - Manual Workload Profiles ACA Job (`atmos-backup-job-prod-f3kkka1`) + failure drill (`GAME-007`,
    `exit 42`, zero retries).
  - Grafana Cloud Free: 4 Singapore API synthetics (`11,904` / `100K` monthly budget = `11.904%`),
    28-day Availability (`99.5%`) & Latency (`95% <= 2.5 s`) SLOs with 30 rules, OTLP traces from
    Vercel and Supabase, and Workers Analytics Engine sampling-aware SQL gates.
  - **Honest `PERF-002` story:** k6 staging baseline (`p95 87.92 ms` / `248.69 ms`, `0%` errors) and
    warmed cache (`p95 4.731 ms`) passed earlier, but expanded 16-day/42-variable weather misses pushed
    Workers Free CPU above the `7 ms` internal gate. ADR 0005 moved first-party weather/AQI to Vercel;
    check `8198` exercises the Vercel POST endpoint, while `PERF-002` stays honestly `IN_PROGRESS / HOLD`
    until remaining Worker `p95 <= 7 ms` and monthly Vercel billing visibility are verified.

---

## Answers to Master Plan Section 35.2 Interview Questions

### 1. Why Worker + Supabase Edge Function instead of one backend?

The Cloudflare Worker is the stateless edge gateway (input bounds, CORS, security headers, correlation,
WAE metrics, and edge caching for search/map/radar), whereas Supabase Edge Functions sit co-located with
Postgres/Auth to execute authenticated CRUD (`api-<sha>`) using the user's bearer JWT and RLS without
putting database drivers or privileged keys in the Worker.

### 2. What happens when a Worker exceeds 10 ms CPU?

Cloudflare Workers Free enforces a `10 ms` CPU time limit per invocation; requests exceeding it risk
platform termination (`5xx`/exceeded CPU limit). Atmos enforces a stricter internal **`7 ms` p95** gate
and refuses Worker promotion (`HOLD`) whenever exact-version analytics exceed `7 ms`.

### 3. Why not pay \$5 for Workers Paid?

Atmos targets **\$0/month steady-state** and treats the `7 ms` Free CPU boundary as an engineering
forcing function rather than buying headroom. Moving heavy 16-day forecast normalization to existing
Vercel Next.js Route Handlers ([ADR 0005](../adr/0005-public-weather-runtime-placement.md)) resolved
the placement mismatch without adding paid subscriptions.

### 4. Why not Kubernetes?

A single-owner portfolio showcase receives sporadic traffic. Running GKE (control plane, worker nodes,
ingress, cert-manager, upgrade toil, and backup operators) creates fixed monthly cost and operational
overhead disproportionate to the workload. Serverless edges + managed Postgres/Auth + scale-to-zero
one-shot Azure containers match the traffic profile cleanly.

### 5. Why R2 instead of Supabase Storage for backups?

Cross-provider blast-radius isolation: keeping client-side encrypted database dumps (`age`/AES + HMAC)
in a separate Cloudflare R2 bucket with scoped writer/reader credentials ensures a Supabase project
compromise, pause, or accidental deletion cannot wipe out the recovery archive.

### 6. Why Cloudflare Queue instead of Supabase Queue?

_Historical architecture note:_ In Phase 5, Cloudflare Queues offered native Worker consumer integration,
explicit retry bounds (`3` retries), and a dedicated DLQ (`GAME-004`/`GAME-005`) decoupled from the
Postgres instance. In the active showcase, queues were subsequently retired under
[CVRET-001](../evidence/cvret-001/2026-09-22.md) to eliminate unused runtime surface while keeping the
verified DLQ/idempotency evidence.

### 7. What happens when queue retention expires?

_Historical async design:_ Cloudflare Queue retention expiry drops unconsumed messages (including DLQ
items). Atmos prevented silent message loss by treating Postgres (`notification_deliveries`) as the
durable source of truth so a reconciliation sweep could inspect stale non-terminal states (`QUEUE-006`).
_(In the active CV showcase, alert rules are evaluated synchronously in-app only; queues are retired.)_

### 8. How do you prevent duplicate alerts?

Idempotency is anchored in Postgres rather than trusting at-least-once queue delivery: unique
idempotency keys and atomic status claiming (`pending -> processing -> sent/failed`) ensure duplicate
claims leave the row safely in `processing` without double-sending (`GAME-004`, `82` pgTAP assertions).

### 9. How does RLS differ from API authorization?

API authorization checks authentication/input shape at the gateway or Edge Function boundary; if a bug
in application code forgets a `WHERE user_id = ...` filter, API auth alone fails open. Postgres RLS
enforces row ownership inside the database engine for every query executed under the `authenticated`
role + user JWT (`GAME-003`, `107` pgTAP assertions).

### 10. Why are Supabase secret keys (and legacy `service_role`) dangerous?

Secret / `service_role` keys bypass Postgres RLS completely. If leaked into client bundles, Worker logs,
or ordinary CRUD paths, any caller could read or mutate every user's rows. Atmos restricts privileged
keys exclusively to server-side self-service account deletion (`PROJECT_SECRET_KEY` inside the Edge
Function after `DELETE` + 5-minute sign-in checks in [AUTH-002](../evidence/auth-002/2026-10-12.md))
and offline backup jobs.

### 11. How do DB migrations work while old/new functions both serve traffic?

Expand/contract sequencing ([database-migrations.md](../operations/database-migrations.md)): PRs apply
only additive, backward-compatible changes first (new nullable columns, additive tables, additive RPCs)
so both `api-<old>` and `api-<new>` work simultaneously during canary/rollback. Destructive contract
drops wait until old function versions are retired (`REL-007`).

### 12. How does Worker canary cover a Supabase function release?

Each release stamps an immutable 12-character Git SHA slug (`api-<sha>`). The candidate Worker version
binds its `SUPABASE_FUNCTION_URL` secret to `api-<new>` while stable stays bound to `api-<old>`. A
single Worker version split (`90/10`) or `Cloudflare-Workers-Version-Overrides` header therefore tests
and routes the exact paired Worker + Edge Function stack atomically.

### 13. Why can't you claim Vercel canary on Hobby?

Vercel Hobby supports instant promotion and exact-deployment preview/candidate smoke before aliasing,
not weighted percentage traffic splitting across multiple production revisions. Atmos therefore runs
pre-promotion exact-deployment smoke (`vercel-production.yml`) on Vercel and uses Cloudflare Workers
for percentage traffic splits.

### 14. What is the frontend rollback limitation on Hobby?

Hobby has no multi-revision traffic ramp, so rollback is an alias swap back to the captured previous
`.vercel.app` deployment URL (`vercel promote "$PREVIOUS_URL"`) if post-promotion smoke fails. Any
users hitting the domain during the brief promotion window before smoke finishes could see the new
deployment until rollback executes.

### 15. Why Azure Container Apps if the main app is serverless elsewhere?

Logical database backups (`pg_dump` via `supabase db dump` + compression + encryption + R2 upload) and
restore drills need full Linux CLI tooling, unbounded memory/disk streaming, and execution times beyond
Cloudflare Worker (`10 ms` CPU) and Supabase Edge Function (`150 s` / Deno isolate) limits. One-shot
Azure Container Instances and manual scale-to-zero ACA Jobs provide \$0-idle batch compute.

### 16. Why public GHCR?

Public GHCR allows anonymous exact-digest pulls by Azure and the verification workflow without storing
long-lived registry PATs inside Azure or CI. Supply-chain trust comes from immutable `sha256` digests,
Trivy zero-finding gates, CycloneDX SBOMs, and keyless OIDC Cosign signature/attestation checks
(`CTR-002`/`CTR-003`), not from registry obscurity.

### 17. How does GitHub authenticate to Azure?

Passwordless OpenID Connect (OIDC) federated identity (`AZ-OIDC-001` / `AZ-TF-OIDC-001`): GitHub Actions
and HCP Terraform exchange short-lived OIDC JWTs with Microsoft Entra ID (`atmos-github-deploy`)
scoped strictly to the production environment/workspace and resource group—zero client secrets exist.

### 18. Where do Cloudflare/Supabase/Vercel Terraform credentials live?

In HCP Terraform sensitive workspace variables (`atmos-edge-production`, `atmos-data-production`,
`atmos-vercel`, `atmos-azure-production`) configured with remote execution and manual apply
(`terraform-bootstrap.md`). They are never committed to Git, printed in logs, or exposed to PR forks.

### 19. What is your actual RPO/RTO from the last restore test?

- **Measured RTO:** approximately **11 seconds** (`2026-09-19T18:13:52Z` to `18:14:03Z`) for HMAC +
  SHA-256 verification and restore of `roles.sql`, `schema.sql`, and `data.sql` into an ephemeral
  Supabase project ([RESTORE-001](../evidence/restore-001/2026-09-19.md)). Note: archive application
  tables were empty (`COPY 0`) at drill time; larger data volumes would increase restore duration.
- **RPO:** `N/A` in the active `CV_SHOWCASE` profile because backups are manual on-demand rather than
  scheduled (`BACKUP-002` deferred). Target RPO when/if production scheduling is enabled is `<= 24 h`.

### 20. What fails if Supabase pauses?

Public weather (`rainify.dpdns.org`, `/` and `/api/public/v1/weather/*`), Worker `/health`, location
search, and OpenFreeMap/RainViewer map views continue working because they do not depend on Supabase.
Authenticated features (sign-in, saved locations, captured weather history, in-app alert persistence)
and `GET /health/dependencies` (`503 {"status":"degraded","database":"degraded"}`) fail cleanly until
the project wakes or is restored.

### 21. Which telemetry cannot be exported natively from Workers Free, and how do Workers Analytics Engine + Grafana Synthetics mitigate that limitation?

Workers Free does not include paid Logpush / continuous OTLP trace export. Atmos pairs bounded,
privacy-safe Workers Analytics Engine datapoints (`OBS-007` + SQL canary gate `OBS-008` for
per-version sample counts, error rates, and wall duration) with external 15-minute Grafana Cloud API
synthetics (`SLO-001` / `SLO-002`) measuring real black-box availability and latency from Singapore.

### 22. What would make you upgrade to Workers Paid / Supabase Pro / Vercel Pro?

- **Workers Paid (\$5/mo):** sustained daily requests approaching `70K/day`, or genuinely heavy edge
  compute that cannot live on another runtime within the `7 ms` p95 gate.
- **Supabase Pro:** DB size approaching `350 MB`, need for automatic daily backups / PITR (avoiding
  project pausing and manual R2 restore RTO), or > `350K` monthly Edge Function invocations.
- **Vercel Pro:** commercial product launch (Hobby prohibits commercial use), shared cache/WAF traffic
  approaching `70%` of `1M` reads / `200K` writes / `1M` WAF requests, or need for multi-member RBAC
  and advanced deployment protection.

### 23. What would make Kubernetes justified later?

Sustained high-throughput traffic where per-invocation serverless pricing exceeds dedicated node costs,
long-lived stateful workloads (WebSockets/SSE fan-out, ML weather post-processing, custom GPU/GIS tile
servers) that cannot run in edge isolates or one-shot jobs, strict multi-region active-active residency,
or a team large enough to amortize cluster operations.

---

## Optional Production Hardening Roadmap (Considered & Scoped)

### Deferred Section 29 Items (Remain Deferred Under `CV_SHOWCASE`)

| Item         | Deferred Scope                                     | Cost / Quota Impact                                      | Rationale & Trigger to Reopen                                                                                |
| ------------ | -------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `BACKUP-002` | Scheduled ACA backup cron + R2 lifecycle retention | Recurring Azure Student credit burn + R2 lifecycle rules | Keep deferred; reopen only when moving to continuous production with active user data requiring `<= 24h` RPO |
| `GAME-006`   | Recurring DR restore exercises                     | Ephemeral Supabase project slot + operational steps      | Keep deferred; `RESTORE-001` proved recovery mechanics in `11 s`                                             |
| `AZJOB-002`  | Historical weather backfill batch job              | Azure compute + Open-Meteo weighted-call pressure        | Keep deferred; Group Q unselected and conflicts with conservative Open-Meteo limits                          |
| `OBS-005`    | Azure Container Apps Job OTel export               | Requires scheduled runs + Log Analytics / OTLP volume    | Keep deferred; backup job is manual on-demand                                                                |

### Low-Friction Operational Hardening Options (`$0`)

1. **Grafana external alert contact point:** route existing `SLO-002` burn alerts to a free email or
   webhook receiver (currently alerts stay in-Grafana with default `empty` receiver).
2. **GitHub Private Vulnerability Reporting:** currently disabled in repository settings (free toggle).
3. **Verify/delete spare Supabase project `axcigtnxaulqcbegmqhw`:** previously observed unintended
   project occupying the 2-project Free quota; confirm status in Supabase Dashboard.
4. **Close `PERF-002` cleanly:** once remaining-Worker CPU snapshot meets `<= 7 ms` p95 (investigating
   cold-start / `/health/dependencies` latency or retiring legacy Worker weather compatibility routes)
   and Vercel monthly WAF/Runtime Cache usage is confirmed, mark `PERF-002` `DONE` and delete the
   stale `0%` Worker candidate.

### Larger / Paid-Boundary Hardening (Deferred Until Production Profile)

- **Global distributed rate limiter / provider quota store** (replacing regional Hobby WAF counters with
  an atomic store such as Upstash Redis or Durable Objects — rejected now by no-new-vendor/\$0 rule).
- **Maintained Staging Worker lane** (intentionally not maintained post-`CVRET-001`).
- **Unselected product groups L/N/P/Q/R/S** (email/push delivery, SSE streaming, automatic weather
  history collection, scheduled jobs, AI advice).
