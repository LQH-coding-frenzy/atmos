# Architecture Index

Use this file to route work to the owning subsystem. Read detailed architecture material only when a concrete task requires it.

| Area                       | Primary code                     | Detail                                               |
| -------------------------- | -------------------------------- | ---------------------------------------------------- |
| Dashboard UI               | `apps/web`                       | `apps/web/AGENTS.md`                                 |
| Edge gateway               | `workers/gateway`                | `workers/gateway/AGENTS.md`                          |
| Shared API contracts       | `packages/contracts`             | master plan Sections 11 and 15                       |
| Domain rules               | `packages/domain`                | master plan Section 11                               |
| Weather provider adapter   | `packages/provider-openmeteo`    | master plan Sections 11 and 12                       |
| Schema, Auth, RLS          | `supabase`                       | `supabase/AGENTS.md`, master plan Sections 13 and 20 |
| CI and supply chain        | `.github/workflows`              | master plan Sections 18 and 26                       |
| Infrastructure and release | `infra`, `jobs`, platform config | master plan Sections 19, 22, and 23                  |

## Accepted Target Dependency Direction

The PERF-002 Vercel weather/AQI placement is accepted but not yet implemented. Until its protected
cutover, the production browser path continues to use the Worker.

```text
browser -> Vercel public weather/AQI Route Handlers -> contracts/provider-openmeteo
browser -> Cloudflare Worker -> versioned Supabase API (authenticated operations)
workers/gateway -> contracts or versioned Supabase API
```

Shared packages must not import application packages. Cloudflare Workers remain thin and never own durable user state.

## Task Routing

- UI behavior: start at `apps/web`.
- Public API/cache/routing: start at `workers/gateway`.
- Weather normalization: start at `packages/provider-openmeteo`.
- Persisted data, RLS, or migrations: start at `supabase` and load `database-migration`.
- Unknown ownership: search by domain term before reading the master plan.
