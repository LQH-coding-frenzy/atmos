# Atmos — Architecture & DevSecOps Case Study

This document preserves the full architecture, reliability engineering, free-tier cost controls, and verification evidence for Atmos. For the product overview and local setup, see the [README](../../README.md).

## Architecture At A Glance

```text
Browser
  -> Next.js dashboard on Vercel (Hobby + WAF rate limit + Runtime Cache)
      -> same-origin dashboard/AQI handlers and normalized-response cache
          -> Open-Meteo forecast and on-demand air-quality APIs
      -> Cloudflare Worker + Hono API gateway (api.rainify.dpdns.org / workers.dev)
          -> location search, bounded map/radar APIs, health, and authenticated API proxy
              -> versioned Supabase Edge Function -> Postgres/Auth/RLS
      -> OpenFreeMap base-map and RainViewer past-radar tiles

Optional current-map layers
  -> OpenWeather through the Cloudflare Worker

One-time recovery evidence (on-demand)
  -> Encrypted Cloudflare R2 archive + Azure Container Apps Job / ACI + ephemeral restore drill
```

First-party public dashboard and AQI requests use same-origin Vercel Route Handlers behind a Vercel Hobby WAF rate-limit rule (`60` requests per 10 minutes per IP on `/` and `/api/public/v1/weather/`) and Vercel Runtime Cache (`5`-minute fresh TTL, `1`-hour stale-if-error window). The Worker remains responsible for bounded location search and map/radar APIs, health/version, CORS/security, request correlation, Workers Analytics Engine telemetry, and the authenticated Supabase API proxy. Legacy expanded weather Worker routes remain as compatibility paths; they are not the first-party browser data path. Protected release workflows preserve exact-deployment smoke checks and rollback controls.

## Engineering Decisions

- **Truthful failure mode:** unavailable live data is shown as unavailable, never substituted with mock weather.
- **Runtime placement by CPU budget:** measured Workers Free CPU (`> 7 ms` p95 on expanded 16-day forecasts) drove [ADR 0005](../adr/0005-public-weather-runtime-placement.md) to move public weather/AQI normalization to Vercel while keeping authenticated APIs and lightweight edge controls on Cloudflare Workers.
- **Small public surface:** Open-Meteo is accessed only through typed provider and gateway boundaries with coordinate bounds and sanitized error envelopes.
- **Accessible by default:** keyboard-operable mobile navigation, textual chart data, explicit units, and responsive layouts are part of the tested journey.
- **Controlled operations:** protected `main`, database/RLS checks, security scanning, signed supply-chain evidence, and scheduled live-content smoke checks protect the showcase.
- **Honest operating profile:** encrypted backup and ephemeral restore evidence are retained, while recurring backup/restore, external paging, and paid resources remain intentionally deferred.

## Steady-State Cost & Free-Tier Quota Summary

Target recurring steady-state cost is **\$0/month out-of-pocket** with a strict **70% internal warning** threshold before any free-tier limit (see [docs/cost/quota-budget.md](../cost/quota-budget.md)).

| Platform                   | Active / On-Demand Role                                                | Free-Tier Quota                                             | 70% Warning / Guardrail                                           |
| -------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| Vercel Hobby               | Next.js frontend, `/api/public/v1/weather/*`, Runtime Cache, WAF       | `1M` Runtime Cache reads, `200K` writes, `1M` WAF req/mo    | `700K` reads / `140K` writes / `700K` WAF req/mo (non-commercial) |
| Cloudflare Workers Free    | Hono edge gateway, `/health`, auth proxy, WAE telemetry                | `100K` req/day, `10 ms` CPU limit                           | `70K` req/day; internal `p95 <= 7 ms` CPU gate                    |
| Cloudflare R2              | Private encrypted logical backup archive (on-demand)                   | `10 GB` storage + included operations                       | `7 GB`; client-side encrypted archive + HMAC                      |
| Supabase Free              | Auth, Postgres, RLS, versioned Edge Functions (`api-<sha>`)            | `500 MB` DB, `500K` EF invocations/mo                       | `350 MB` DB, `350K` EF invocations/mo                             |
| Grafana Cloud Free         | 4 Singapore API synthetics (15m), 2 SLOs, OTLP traces                  | `100K` API synthetics/mo, `10K` series, `50 GB` logs/traces | `11,904` 31-day synthetics (`11.9%`); `70%` across series/OTLP    |
| HCP Terraform Free         | Remote state and speculative/approved applies                          | `500` managed resources                                     | `350` resources; no auto-apply on prod workspaces                 |
| Azure for Students         | On-demand backup ACI / manual Workload Profiles ACA Job                | Student credit + ACA monthly free grants                    | `\$10/mo` alert budget; idle/manual only, never PAYG              |
| Open-Meteo Free            | Weather forecast (`5` weighted units/miss), AQI (`1–2`), geocode (`1`) | `600/min`, `5K/hr`, `10K/day`, `300K/mo` (non-commercial)   | `70%` per window + CC BY 4.0 attribution                          |
| Queues & ACA Log Analytics | Notification queues (`CVRET-001`) & ACA environment                    | Retired                                                     | Removed to eliminate idle ops/credit risk                         |

## DevSecOps & Reliability Evidence

| Area                             | Implemented Control & Verified Result                                                                                                                                                                                                                                                                                 | Evidence                                                                                                                                                                                                                                                                                                                               |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI & Supply Chain Security       | Protected `main` requires `quality`, `database`, `playwright`, Gitleaks, CodeQL, Semgrep, Trivy (`HIGH,CRITICAL`), and CycloneDX SBOM (`4,521` B)                                                                                                                                                                     | [SBOM-001](../evidence/sbom-001/2026-09-09.md)                                                                                                                                                                                                                                                                                         |
| Hardened Container Provenance    | Pinned `node:24.21.0-alpine3.23`, `0` HIGH/CRITICAL Trivy vulns, `20`-component SBOM, keyless GitHub OIDC Cosign signature & attestation verified by exact digest                                                                                                                                                     | [CTR-002](../evidence/ctr-002/2026-09-14.md) · [CTR-003](../evidence/ctr-003/2026-09-14.md)                                                                                                                                                                                                                                            |
| Progressive Canary & Affinity    | `10% -> 25% -> 50% -> 100%` Worker rollout gated by WAE + Grafana synthetics; `REL-005` session-storage UUIDv4 affinity (`97` keys, `0` drift, `0%` error)                                                                                                                                                            | [REL-004](../evidence/rel-004/2026-09-12.md) · [REL-005](../evidence/rel-005/2026-09-30.md) · [REL-006](../evidence/rel-006/2026-09-13.md)                                                                                                                                                                                             |
| Bad Canary Rollback & Postmortem | `GAME-002` `90/10` fault test detected `0.911` candidate error rate; exposed Cloudflare `10220` binding error, fixed with `wrangler rollback` (`3m 45s` recovery)                                                                                                                                                     | [GAME-002](../evidence/game-002/2026-09-13.md) · [Postmortem](../postmortems/2026-09-13-worker-bad-canary-rollback.md)                                                                                                                                                                                                                 |
| Postgres Auth & RLS Isolation    | pgTAP verification across `profiles`, `preferences`, `weather_snapshots`, `alert_rules`, and `notification_deliveries` (`20`, `66`, and `107` assertions)                                                                                                                                                             | [RLS-001](../evidence/rls-001/2026-09-03.md) · [RLS-002](../evidence/rls-002/2026-09-05.md) · [GAME-003](../evidence/game-003/2026-09-09.md)                                                                                                                                                                                           |
| Backup & Ephemeral Restore DR    | Client-side encrypted R2 archive + HMAC via private ACI & manual ACA Job (`f3kkka1`); failure drill (`exit 42`, `0` retries); `11 s` ephemeral Supabase restore                                                                                                                                                       | [R2BACK-001](../evidence/r2back-001/2026-09-15.md) · [AZJOB-001](../evidence/azjob-001/2026-10-07.md) · [GAME-007](../evidence/game-007/2026-10-11.md) · [RESTORE-001](../evidence/restore-001/2026-09-19.md)                                                                                                                          |
| Observability, WAE & SLOs        | Correlation IDs + `traceparent`, Vercel/Supabase OTLP traces, WAE SQL canary gate, 4 Singapore synthetics (`11.904%` quota), 28d `99.5%` / `2.5 s` SLOs                                                                                                                                                               | [OBS-001](../evidence/obs-001/2026-09-09.md) · [OBS-003](../evidence/obs-003/2026-09-30.md) · [OBS-004](../evidence/obs-004/2026-09-30.md) · [OBS-007](../evidence/obs-007/2026-09-10.md) · [OBS-008](../evidence/obs-008/2026-09-10.md) · [SLO-001](../evidence/slo-001/2026-09-12.md) · [SLO-002](../evidence/slo-002/2026-09-12.md) |
| Performance & Runtime Placement  | Staging k6 baselines (`p95 87.92 ms` / `248.69 ms`, `0%` fail) & warmed CPU (`p95 4.731 ms`); `PERF-002` Vercel cutover live & Hobby usage verified (`<= 0.82%` WAF / `<= 2.79%` cache writes), Worker slimmed to `137.48 KiB` (`605b084d`, pending 24h `<= 7 ms` CPU check; prior `a7b9c500` `p95 11.631 ms` `HOLD`) | [LOAD-001](../evidence/load-001/2026-09-08.md) · [PERF-001](../evidence/perf-001/2026-09-05.md) · [ADR 0005](../adr/0005-public-weather-runtime-placement.md) · [PERF-002](../evidence/perf-002/implementation.md)                                                                                                                     |
| Release Controls & Operations    | Exact-deployment Vercel smoke + rollback, fail-closed `REL-007` cleanup, 19 incident runbooks, live audit fix, and CV runtime retirement                                                                                                                                                                              | [FRONTREL-001](../evidence/frontrel-001/2026-09-12.md) · [REL-007](../evidence/rel-007/2026-09-13.md) · [DOC-001](../evidence/doc-001/2026-09-12.md) · [CV Audit](../evidence/cv-audit/2026-09-22-remediation.md) · [CVRET-001](../evidence/cvret-001/2026-09-22.md)                                                                   |
| Async & History Controls         | Historical queue duplicate (`82` pgTAP assertions) & DLQ evidence prior to retirement; manual signed-in snapshot history (no backfill)                                                                                                                                                                                | [GAME-004](../evidence/game-004/2026-09-07.md) · [GAME-005](../evidence/game-005/2026-09-07.md) · [HIST-CAP-001](../evidence/hist-cap-001/2026-09-27.md)                                                                                                                                                                               |

## Evidence & Architecture References

- [Interview & 12-minute demo walkthrough package](interview-demo-package.md)
- [Live production audit remediation](../evidence/cv-audit/2026-09-22-remediation.md)
- [Authenticated user-captured weather history](../evidence/hist-cap-001/2026-09-27.md)
- [CV runtime retirement](../evidence/cvret-001/2026-09-22.md)
- [Verified ephemeral restore drill](../evidence/restore-001/2026-09-19.md)
- [CV showcase maintenance boundary](../operations/cv-showcase-maintenance.md)
- [Cost and quota budget](../cost/quota-budget.md)
- [Architecture and original implementation plan](../architecture/atmos-devsecops-master-plan.md)

## Intentionally Deferred Production Hardening

Atmos is maintained as a CV-first portfolio showcase under the [CV Showcase Completion Boundary](../operations/cv-showcase-maintenance.md), not a continuously operated commercial SaaS service. On 2026-11-19, the owner reaffirmed keeping the following production hardening items deferred unless an active production operating profile is selected:

- **Scheduled Backup Retention (`BACKUP-002`) & Recurring Restore Drills (`GAME-006`):** Demonstrated once via encrypted R2 archive and 11-second ephemeral Supabase restore (`RESTORE-001`), without R2 lifecycle policies, recurring database dumps, or ongoing student-credit burn.
- **Historical Backfill Batch Job (`AZJOB-002`) & Azure Job OTel (`OBS-005`):** Omitted because background historical ingestion and persistent Log Analytics conflict with Open-Meteo non-commercial/quota limits and Azure credit preservation.
- **Operational & Edge Hardening Beyond Free Tiers:** External Grafana alert paging (burn alerts stay visible in Grafana UI until a receiver is approved), distributed global rate limiting beyond the regional Hobby WAF rule (`60 req / 10 min / IP`), a continuously maintained Staging Worker lane (`CVRET-001`), and unselected product groups (email/push notifications, SSE streaming, automatic history capture, and AI advice).
- **External Provider Setup:** Google OAuth is implemented; Google Auth Platform branding verification/publication remains an owner-operated external step.

## Security

Do not commit secrets, Terraform state, database dumps, or generated backup archives. Report vulnerabilities according to [SECURITY.md](../../SECURITY.md).
