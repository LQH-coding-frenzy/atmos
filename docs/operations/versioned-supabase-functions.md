# Versioned Supabase Edge Functions

REL-002 deploys immutable candidate names while retaining `api-v1` as the current stable rollback target.

1. Merge the implementation through protected `main`.
2. Run `corepack pnpm release:id` once from that exact commit.
3. Run `corepack pnpm release:supabase:stage` from the same commit to generate ignored wrapper source at `supabase/functions/api-<release-id>/index.ts`. The generator rejects release overrides.
4. Deploy that exact name to the intended project with `supabase functions deploy api-<release-id> --no-verify-jwt`.
5. Smoke `/health` and require `/version` to return the same release ID.

The wrapper contains only the public release ID. It imports the canonical `api-v1` source, accepts requests only under its exact versioned prefix, rewrites that prefix for the canonical Hono routes, and passes release metadata without modifying global function secrets.

Do not delete `api-v1`, the previous candidate, or any function referenced by a retained Worker version. REL-007 owns cleanup after the rollback window and reference checks.
