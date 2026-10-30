# CV Showcase Maintenance

Atmos is maintained as a public portfolio demonstration. Its goal is a reliable, understandable live
weather journey backed by credible DevSecOps evidence, not continuous production operations.

## Active Demonstration

| Component                                                    | Decision       | Purpose                                                                              |
| ------------------------------------------------------------ | -------------- | ------------------------------------------------------------------------------------ |
| Vercel dashboard                                             | keep active    | presents live Berlin weather, forecast, chart, map marker, and unit selection        |
| Cloudflare Worker gateway                                    | keep active    | validates input, applies cache and security controls, and calls Open-Meteo           |
| Supabase project and edge API                                | keep active    | serves RLS-backed saved-location, snapshot-history, and in-app alert APIs            |
| Grafana synthetics                                           | keep active    | detects public frontend, gateway, dependency, and weather-route outages              |
| GitHub Actions and branch protection                         | keep active    | verifies build, browser, database, security, SBOM, and supply-chain controls         |
| Terraform and HCP Terraform configuration                    | keep active    | documents reproducible infrastructure and provider boundaries                        |
| GHCR backup image, R2 archive, and restore tooling           | keep on demand | supports one verified backup and ephemeral restore demonstration                     |
| Backup secret bootstrap                                      | disabled       | retained evidence does not justify rotating the project-wide database password       |
| Staging Worker                                               | not maintained | dependency health is intentionally unavailable; do not treat it as a release lane    |
| Production release controls                                  | keep on demand | protected Vercel and Edge Runtime workflows preserve candidate and rollback evidence |
| Cloudflare Queues and alert delivery runtime                 | retired        | removed; in-app alert status does not publish notifications                          |
| Azure Container Apps environment and Log Analytics workspace | retired        | removed; backup evidence uses a one-shot Container Instance, not an Apps environment |

Provider-side retirement completed under the owner-approved CVRET-001 plan. See
`docs/evidence/cvret-001/2026-09-22.md` for the sanitized release and provider evidence.

## Accepted PERF-002 Target (Not Yet Deployed)

The owner accepted moving first-party public dashboard/AQI requests to same-origin Vercel Next.js
Route Handlers so provider normalization and normalized-response caching do not execute in Workers
Free. The Worker remains active for authenticated API proxying, health/version, CORS/security,
correlation, and other lightweight edge responsibilities. The production browser path has not yet
been switched; stable Worker `d81923250215` remains at 100%, and candidate `5105fa59910b` remains at
0% after a bounded provider failure. Do not claim PERF-002 complete until the Next.js cache/stale
contract is verified and remaining Worker CPU p95 is measured at or below 7 ms.
Local handlers now enforce and test same-origin/JSON request checks. The production cutover remains
blocked until a shared abuse control is approved and tested, and account-level Runtime Cache plus
weighted Open-Meteo usage is projected below the 70% warning thresholds. The control must also cover
the dynamic homepage's coordinate share-link query path, which can initiate provider work without
passing through the POST handler. A Vercel WAF rule is now active: 60 requests/10 minutes per source
IP on `/` and `/api/public/v1/weather/`, 429 on excess. Hobby includes 1,000,000 allowed requests/month
with a 700K HOLD threshold. Team Usage shows 9.7K CDN requests/1M in the last 30 days but no
WAF-specific meter; the limit is per-region, not a global provider quota. See
`docs/cost/quota-budget.md`, `docs/operations/perf-002-public-weather-abuse-control.md`, and ADR 0005.

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

The master plan remains a future-hardening roadmap. Automatic retention, scheduled backups, recurring
restore exercises, external paging, and new vendor resources are deferred until an owner explicitly
chooses a production operating profile.
