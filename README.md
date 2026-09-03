# Atmos

Atmos is a serverless-first weather intelligence platform built as a public DevSecOps portfolio project.

## Architecture

The implementation plan is the source of truth: [Atmos master plan](docs/architecture/atmos-devsecops-master-plan.md).

- Next.js on Vercel for the frontend.
- Cloudflare Workers and Hono for the thin edge gateway and public cache.
- Supabase Postgres, Auth, Edge Functions, and RLS for durable user data and authenticated APIs.
- Cloudflare Queues and R2 for asynchronous delivery and encrypted backups.
- Azure Container Apps Jobs for bounded container workloads.

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

The dashboard uses deterministic mock data by default, so no provider credentials are required locally.

Hosted authentication setup is documented in [docs/auth.md](docs/auth.md).

## Attribution

Live weather data is supplied by [Open-Meteo](https://open-meteo.com/) under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) and its [Free API terms](https://open-meteo.com/en/terms). The Free endpoint is limited to non-commercial use; it must not be used with ads or subscriptions. Map styling uses OpenFreeMap/OpenStreetMap-compatible public map data; see [design provenance](docs/design/provenance.md).

## Security

Do not commit secrets, Terraform state, database dumps, or generated backup archives. Report vulnerabilities according to [SECURITY.md](SECURITY.md).
