# Atmos

Atmos is a serverless-first weather intelligence platform built as a public DevSecOps portfolio project.

## CV Showcase Scope

The public demo presents live weather for Berlin through the Cloudflare gateway, including a forecast,
trend chart, location marker, and metric/imperial units. The repository also demonstrates protected
CI, IaC, signed container supply chain, and one verified encrypted backup and ephemeral restore drill.

Recurring backups, automated retention, continuous disaster recovery, and user-account features are
deliberately out of scope. See [CV showcase maintenance](docs/operations/cv-showcase-maintenance.md)
for the active components and lightweight maintenance routine.

## Architecture

The implementation plan is the source of truth: [Atmos master plan](docs/architecture/atmos-devsecops-master-plan.md).

- Next.js on Vercel for the frontend.
- Cloudflare Workers and Hono for the thin edge gateway and public cache.
- Supabase Postgres, Auth, Edge Functions, and RLS for durable user data and authenticated APIs.
- Cloudflare R2 for one-time encrypted backup evidence.
- Azure Container Instances for one-time backup and restore demonstrations.

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
