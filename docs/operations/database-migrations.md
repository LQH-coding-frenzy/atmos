# Database Migration Runbook

Use expand/contract whenever deployed backend versions can overlap.

1. Expand: add nullable columns, new tables, indexes, or compatible APIs only. Do not remove or tighten existing behavior.
2. Validate locally with `corepack pnpm exec supabase db reset` and `corepack pnpm test:db`; review SQL and collect `supabase db push --dry-run` evidence before production.
3. Migrate: deploy the additive migration, then observe application and database errors while both versions remain supported.
4. Switch: deploy code that writes and reads the new shape; backfill only through a reviewed, bounded process.
5. Contract: remove old reads/writes only after validation, rollback-window expiry, and retirement of old backend versions. Destructive production work requires backup-freshness and owner approval.

RLS, grants, policies, and privileged functions are security releases. Require allow and cross-user-deny tests plus security review before deployment.

If validation fails, stop before contract. Roll back application traffic to the prior compatible version or forward-fix with another additive migration; do not restore data destructively without explicit approval.
