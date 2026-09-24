# CV Showcase Maintenance

Atmos is maintained as a public portfolio demonstration. Its goal is a reliable, understandable live
weather journey backed by credible DevSecOps evidence, not continuous production operations.

## Active Demonstration

| Component                                                    | Decision       | Purpose                                                                                 |
| ------------------------------------------------------------ | -------------- | --------------------------------------------------------------------------------------- |
| Vercel dashboard                                             | keep active    | presents live Berlin weather, forecast, chart, map marker, and unit selection           |
| Cloudflare Worker gateway                                    | keep active    | validates input, applies cache and security controls, and calls Open-Meteo              |
| Supabase project and edge API                                | keep active    | retains the API, RLS, and dependency-health evidence without exposing unused account UI |
| Grafana synthetics                                           | keep active    | detects public frontend, gateway, dependency, and weather-route outages                 |
| GitHub Actions and branch protection                         | keep active    | verifies build, browser, database, security, SBOM, and supply-chain controls            |
| Terraform and HCP Terraform configuration                    | keep active    | documents reproducible infrastructure and provider boundaries                           |
| GHCR backup image, R2 archive, and restore tooling           | keep on demand | supports one verified backup and ephemeral restore demonstration                        |
| Backup secret bootstrap                                      | disabled       | retained evidence does not justify rotating the project-wide database password          |
| Staging Worker                                               | not maintained | dependency health is intentionally unavailable; do not treat it as a release lane       |
| Production release controls                                  | keep on demand | protected Vercel and Edge Runtime workflows preserve candidate and rollback evidence    |
| Cloudflare Queues and alert delivery runtime                 | retired        | removed; no active CV user journey publishes notifications                              |
| Azure Container Apps environment and Log Analytics workspace | retired        | removed; backup evidence uses a one-shot Container Instance, not an Apps environment    |

Provider-side retirement completed under the owner-approved CVRET-001 plan. See
`docs/evidence/cvret-001/2026-09-22.md` for the sanitized release and provider evidence.

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
