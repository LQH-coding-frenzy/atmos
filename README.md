# Atmos

A fast, location-aware weather dashboard with hourly and 16-day forecasts, air quality insights, interactive radar maps, activity planning, and personal weather tracking.

**[Open Atmos](https://rainify.dpdns.org/)** ·
**[Browse Source](https://github.com/LQH-coding-frenzy/atmos)** ·
**[Architecture & DevSecOps Case Study](docs/portfolio/devsecops-case-study.md)**

## Features

- **Current conditions & extended forecasts:** Live temperature, humidity, wind, pressure, visibility, UV, daylight times, hourly details, and a 7-to-16-day outlook with metric/imperial unit switching.
- **Interactive weather charts:** Multi-series forecast trends with range selectors, zoom, and accessible data tables.
- **Air quality & timeline:** Current U.S. and European AQI, pollutant breakdowns, and hourly forecast/history charts powered by Open-Meteo and CAMS.
- **Weather map & radar:** Interactive OpenFreeMap base map with city and custom-coordinate selection, saved-place markers, discrete AQI overlay, and RainViewer radar playback.
- **Activity planner & multi-city comparison:** Suitability scoring for outdoor activities with custom profiles, plus side-by-side comparison and ranking across cities.
- **Weather calendar & official alerts:** Day-by-day forecast breakdown alongside official severe weather alerts for supported U.S. (NWS) and Canadian regions.
- **Personal account sync (optional):** Sign in to organize categorized saved places, configure in-app alert rules with schedules and cooldowns, record weather observations, export CSV/JSON history, and view baseline anomaly insights.

## Tech Stack

- **Frontend & public weather API:** Next.js on Vercel (App Router, Runtime Cache, WAF)
- **Edge API gateway:** Cloudflare Workers + Hono (`api.rainify.dpdns.org`)
- **Database, Auth & Edge Functions:** Supabase (Postgres with Row-Level Security)
- **Data & map providers:** Open-Meteo, CAMS ENSEMBLE, OpenFreeMap, RainViewer, NWS / Environment Canada

## Local Development

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

The public dashboard and AQI endpoints work locally without provider credentials. `ATMOS_GATEWAY_URL` configures the Worker-backed map, location-search, and authenticated API paths when pointing to a custom gateway. Hosted authentication setup is documented in [docs/auth.md](docs/auth.md).

## Engineering & Architecture

Atmos also serves as a full-stack DevSecOps and reliability engineering reference:

- [Architecture, cost guardrails, and DevSecOps case study](docs/portfolio/devsecops-case-study.md)
- [Interview & 12-minute demo walkthrough package](docs/portfolio/interview-demo-package.md)
- [Cost and quota budget](docs/cost/quota-budget.md)
- [Architecture and implementation plan](docs/architecture/atmos-devsecops-master-plan.md)

## Attribution

Weather and air quality data are supplied by [Open-Meteo](https://open-meteo.com/) under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); air quality also attributes [CAMS ENSEMBLE](https://atmosphere.copernicus.eu/). The [Open-Meteo Free API terms](https://open-meteo.com/en/terms) are non-commercial. Map styling uses OpenFreeMap/OpenStreetMap-compatible public map data; see [design provenance](docs/design/provenance.md).

## Security

Do not commit secrets, Terraform state, database dumps, or generated backup archives. Report vulnerabilities according to [SECURITY.md](SECURITY.md).
