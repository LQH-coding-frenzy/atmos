# CV Showcase Maintenance

Atmos is maintained as a public portfolio demonstration. Its goal is a reliable, understandable live
weather journey backed by credible DevSecOps evidence, not continuous production operations.

## Active Demonstration

| Component                                                    | Decision       | Purpose                                                                                                          |
| ------------------------------------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------- |
| Vercel dashboard and weather API                             | keep active    | presents live Berlin weather, forecast, chart, map marker, unit selection, and same-origin dashboard/AQI caching |
| Cloudflare Worker gateway                                    | keep active    | handles bounded location search, map/radar APIs, health, security headers, and authenticated API proxying        |
| Supabase project and edge API                                | keep active    | serves RLS-backed saved-location, snapshot-history, and in-app alert APIs                                        |
| Grafana synthetics                                           | keep active    | detects public frontend, gateway, dependency, and Vercel weather-route outages                                   |
| GitHub Actions and branch protection                         | keep active    | verifies build, browser, database, security, SBOM, and supply-chain controls                                     |
| Terraform and HCP Terraform configuration                    | keep active    | documents reproducible infrastructure and provider boundaries                                                    |
| GHCR backup image, R2 archive, and restore tooling           | keep on demand | supports one verified backup and ephemeral restore demonstration                                                 |
| Backup secret bootstrap                                      | disabled       | retained evidence does not justify rotating the project-wide database password                                   |
| Staging Worker                                               | not maintained | dependency health is intentionally unavailable; do not treat it as a release lane                                |
| Production release controls                                  | keep on demand | protected Vercel and Edge Runtime workflows preserve candidate and rollback evidence                             |
| Cloudflare Queues and alert delivery runtime                 | retired        | removed; in-app alert status does not publish notifications                                                      |
| Azure Container Apps environment and Log Analytics workspace | retired        | removed; backup evidence uses a one-shot Container Instance (plus on-demand manual ACA Job), not an Apps env     |

Provider-side retirement completed under the owner-approved CVRET-001 plan. See
`docs/evidence/cvret-001/2026-09-22.md` for the sanitized release and provider evidence.

## Active PERF-002 Vercel Cutover (Verification Pending)

First-party public dashboard and AQI requests now execute on same-origin Vercel Next.js Route
Handlers (`dpl_FDWsmrXFswDc5HRSZjTDaZKLZAxQ` live on `https://rainify.dpdns.org/`), and Grafana
synthetic check `8198` exercises `POST https://rainify.dpdns.org/api/public/v1/weather/dashboard`.
The Worker remains active for authenticated API proxying, location search, bounded map/radar routes,
health/version, CORS/security, correlation, and retained compatibility paths; Worker version
`605b084d-a40c-4c0e-8ba7-f68f905b7dca` (`48559e421950`, `137.48 KiB` / `31.15 KiB` gzip) is at 100%
following PR #355 (runtime Zod removal), PR #366 (pre-Hono fast-path probes, `hono/tiny`, and
geocoding subpath split), and Edge release `45535843367`.

A Vercel WAF rule is active: 60 requests/10 minutes per source IP on `/` and
`/api/public/v1/weather/`, returning HTTP 429 on excess (covering both the POST handlers and the
dynamic homepage's share-link query path). Authenticated Vercel `/v2/usage` and
`/v1/security/firewall/*` queries on `2026-11-25T02:25Z` confirmed Vercel compliance (`PASS`: Nov MTD
`8,183` total requests `<= 0.82%` of `1M` WAF allowance, `5,586` function invocations bounding
Runtime Cache reads `<= 0.56%` of `1M` and writes `<= 2.79%` of `200K`, `0` firewall mitigation
events). `PERF-002` remains `IN_PROGRESS` / `HOLD` pending the 24-hour Worker CPU snapshot
(`p95 <= 7 ms`) on `605b084d-a40c-4c0e-8ba7-f68f905b7dca` (prior `a7b9c500` snapshot `45533597237`
measured `223` reqs, `p50 5.032 ms`, `p95 11.631 ms`, `p99 14.042 ms`). See `docs/cost/quota-budget.md`,
`docs/operations/perf-002-public-weather-abuse-control.md`, `docs/evidence/perf-002/implementation.md`,
and ADR 0005.

## Maintenance Routine

### Monthly

1. Open the public dashboard and confirm it shows a current Berlin observation.
2. Check `/health`, `/health/dependencies`, and the public weather route return successful responses.
3. Review GitHub dependency and security alerts; merge only updates that pass protected checks.
4. Check provider free-tier usage and any student credit balance. Do not upgrade paid plans by default.

### Before a Demo or Interview

1. Run `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, and `corepack pnpm build`.
2. Run `corepack pnpm test:e2e` and inspect the dashboard at desktop and mobile widths.
3. Confirm the live endpoint, gateway health, dependency health, and weather response work.
4. Review `docs/evidence/restore-001/2026-09-19.md` rather than running a new restore drill.

### On Change

1. Keep the public dashboard truthful: never replace a failed live request with mock data.
2. Remove or implement every exposed control. Do not leave a visible placeholder feature.
3. Use protected `main` checks, `Vercel production release`, and `Release Edge Runtime` for production promotion.
4. Update this document and relevant evidence when the active architecture changes.

## Deferred Production Work

The master plan remains a future-hardening roadmap. On 2026-11-19, the owner confirmed keeping
Section 29 production-only items `BACKUP-002` (automatic retention and scheduled backups),
`GAME-006` (recurring restore drills), `AZJOB-002` (historical backfill job), and `OBS-005`
(Azure job telemetry), along with external paging and new vendor resources, deferred until an owner
explicitly chooses a production operating profile.
