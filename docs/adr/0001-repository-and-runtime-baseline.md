# ADR 0001: Repository and runtime baseline

## Status

Accepted on 2026-09-01.

## Decision

Atmos uses one pnpm TypeScript monorepo. The production frontend is Next.js. Cloudflare Workers use Hono only for thin edge responsibilities; Supabase Edge Functions own database-heavy authenticated logic. Supabase migrations, not Terraform, own the database schema.

The canonical Supabase function source will be `supabase/functions/api/`. Release automation may create and remove temporary release-named bundles without creating permanent source directories.

## Consequences

- The Vite design sample is reference material, not a deployable runtime.
- Root scripts use pnpm and must work in CI on Ubuntu.
- Future Worker features require a measured p95 CPU result at or below 7 ms.
