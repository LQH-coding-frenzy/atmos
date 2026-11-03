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
- Expand an on-demand Open-Meteo/CAMS air-quality panel with U.S./European AQI and pollutant values.
- Create in-app weather rules and see whether the current dashboard/forecast matches them.
- Sign in to save locations, record current observations, and delete entries from a personal 7/30/90-day history.
- Mark saved places as favorites, assign home/work/university/travel categories, reorder them, and sync a default place with your account.
- Reopen one of eight recent selections stored locally, or enter coordinates directly.
- Click or tap a city or map point to select it immediately; browser Back and Forward restore map selections.
- Play a short, bounded sequence of recent RainViewer radar frames; playback pauses on map interactions and has a cooldown.
- Use the dashboard on desktop or mobile without mock-data fallbacks.

Berlin remains the reliable default. The public weather journey works without an account; users may
sign in with email/password to save places, create in-app alert rules, switch between them, and
explicitly record observations. Alert status is evaluated only from the open dashboard/forecast;
email/push delivery, schedules, queues, automatic history collection, and provider history/backfill
remain deferred; no earlier observations are backfilled.

## Architecture At A Glance

```text
Browser
  -> Next.js dashboard on Vercel
      -> same-origin dashboard/AQI handlers and normalized-response cache
          -> Open-Meteo forecast and on-demand air-quality APIs
      -> Cloudflare Worker + Hono API gateway
          -> location search, bounded map/radar APIs, health, and authenticated API proxy
              -> versioned Supabase Edge Function -> Postgres/Auth/RLS
      -> OpenFreeMap base-map and RainViewer past-radar tiles

Optional current-map layers
  -> OpenWeather through the Cloudflare Worker

One-time recovery evidence
  -> Encrypted Cloudflare R2 archive + Azure Container Instance restore drill
```

First-party public dashboard and AQI requests use same-origin Vercel handlers, which own provider
normalization and normalized-response caching. The Worker remains responsible for bounded location
search and map-related APIs, health/version, and the authenticated Supabase API proxy. Legacy expanded
weather Worker routes remain as compatibility paths; they are not the first-party browser data path.
Protected release workflows preserve exact-deployment smoke checks and rollback controls.

## Engineering Decisions

- **Truthful failure mode:** unavailable live data is shown as unavailable, never substituted with mock weather.
- **Small public surface:** Open-Meteo is accessed only through typed provider and gateway boundaries.
- **Accessible by default:** keyboard-operable mobile navigation, textual chart data, explicit units, and responsive layouts are part of the tested journey.
- **Controlled operations:** protected `main`, database/RLS checks, security scanning, signed supply-chain evidence, and scheduled live-content smoke checks protect the showcase.
- **Honest operating profile:** recovery evidence is retained, while recurring backup/restore, paging, and paid resources remain intentionally deferred.

## Evidence

- [Live production audit remediation](docs/evidence/cv-audit/2026-09-22-remediation.md)
- [Authenticated user-captured weather history](docs/evidence/hist-cap-001/2026-09-27.md)
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

The public dashboard and AQI journey use same-origin Vercel handlers and require no provider
credentials locally. `ATMOS_GATEWAY_URL` controls the Worker-backed map, location-search, and
authenticated API paths; set it only when using another compatible gateway.

Hosted authentication setup is documented in [docs/auth.md](docs/auth.md).

## Attribution

Live weather and AQI model data are supplied by [Open-Meteo](https://open-meteo.com/) under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); AQI also attributes [CAMS ENSEMBLE](https://atmosphere.copernicus.eu/). The [Free API terms](https://open-meteo.com/en/terms) are non-commercial and do not allow ads or subscriptions. Map styling uses OpenFreeMap/OpenStreetMap-compatible public map data; see [design provenance](docs/design/provenance.md).

## Security

Do not commit secrets, Terraform state, database dumps, or generated backup archives. Report vulnerabilities according to [SECURITY.md](SECURITY.md).

## Deliberately Deferred

Atmos is a maintained portfolio showcase, not a continuously operated commercial weather service. Do
not add paid providers, email/push alert delivery, recurring backup/restore operations, AI advice,
historical AQI analysis, provider history/backfill, or multi-provider failover without a defined user
need and explicit owner approval. Google OAuth is implemented; Google Auth Platform branding
verification/publication remains an owner-operated external step.
