# Atmos

A live, location-aware weather dashboard and public DevSecOps case study.

**[Open the live demo](https://rainify.dpdns.org/)** ·
**[Browse the source](https://github.com/LQH-coding-frenzy/atmos)** ·
**[Read the remediation evidence](docs/evidence/cv-audit/2026-09-22-remediation.md)**

## What You Can Do

- Search for a city, select a result, and share the resulting URL.
- View current conditions, the next 12 hours, and a seven-day forecast from Open-Meteo.
- Switch temperature and wind units between metric and imperial.
- Read a chart with an accessible textual equivalent and explicit data freshness.
- Use the dashboard on desktop or mobile without mock-data fallbacks.

Berlin remains the reliable default. The public journey intentionally avoids authentication, saved
locations, alerts, queues, and notification features until there is a concrete product need.

## Architecture At A Glance

```text
Browser
  -> Next.js dashboard on Vercel
  -> Cloudflare Worker + Hono gateway
  -> Open-Meteo forecast and geocoding APIs

Protected backend boundary
  -> Supabase Edge Functions, Postgres, Auth, and RLS

One-time recovery evidence
  -> Encrypted Cloudflare R2 archive + Azure Container Instance restore drill
```

The Worker validates bounded public inputs, canonicalizes cache keys, coalesces concurrent location
searches per isolate, and returns typed sanitized errors. A protected release path uses a zero-percent
Worker candidate, exact smoke checks, and a content-gated Vercel promotion.

## Engineering Decisions

- **Truthful failure mode:** unavailable live data is shown as unavailable, never substituted with mock weather.
- **Small public surface:** Open-Meteo is accessed only through typed provider and gateway boundaries.
- **Accessible by default:** keyboard-operable mobile navigation, textual chart data, explicit units, and responsive layouts are part of the tested journey.
- **Controlled operations:** protected `main`, database/RLS checks, security scanning, signed supply-chain evidence, and scheduled live-content smoke checks protect the showcase.
- **Honest operating profile:** recovery evidence is retained, while recurring backup/restore, paging, and paid resources remain intentionally deferred.

## Evidence

- [Live production audit remediation](docs/evidence/cv-audit/2026-09-22-remediation.md)
- [CV runtime retirement](docs/evidence/cvret-001/2026-09-22.md)
- [Verified ephemeral restore drill](docs/evidence/restore-001/2026-09-19.md)
- [CV showcase maintenance boundary](docs/operations/cv-showcase-maintenance.md)
- [Architecture and original implementation plan](docs/architecture/atmos-devsecops-master-plan.md)

## Local development

Prerequisites: Node 24.14.1, Corepack, Docker Desktop, and the Supabase CLI supplied by this workspace.

```bash
corepack pnpm install --frozen-lockfile
cp .env.example .env
corepack pnpm dev
```

Run the quality gate:

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

The dashboard fetches public Open-Meteo data through the deployed gateway by default, so no provider
credentials are required locally. Set `ATMOS_GATEWAY_URL` only to use another compatible gateway.

Hosted authentication setup is documented in [docs/auth.md](docs/auth.md).

## Attribution

Live weather data is supplied by [Open-Meteo](https://open-meteo.com/) under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) and its [Free API terms](https://open-meteo.com/en/terms). The Free endpoint is limited to non-commercial use; it must not be used with ads or subscriptions. Map styling uses OpenFreeMap/OpenStreetMap-compatible public map data; see [design provenance](docs/design/provenance.md).

## Security

Do not commit secrets, Terraform state, database dumps, or generated backup archives. Report vulnerabilities according to [SECURITY.md](SECURITY.md).

## Deliberately Deferred

Atmos is a maintained portfolio showcase, not a continuously operated commercial weather service. Do
not add paid providers, user accounts, notifications, recurring backup/restore operations, AI advice,
AQI/history products, or multi-provider failover without a defined user need and explicit owner approval.
