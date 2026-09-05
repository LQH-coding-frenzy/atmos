# Database Migration Runbook

## Scope

Use this runbook for all `supabase/migrations/*.sql` changes. Migrations are the schema source of truth; production Dashboard edits are prohibited.

## Expand/Contract

1. Expand with additive, backward-compatible tables, nullable columns, indexes, functions, or policies. Keep old paths working.
2. Migrate data in bounded, resumable batches when required. Record progress and validation evidence.
3. Switch application code only after the expand migration is available to every active backend version.
4. Contract only after candidate rollout reaches 100%, the rollback window expires, old function versions retire, and data validation completes.

## Required Gates

Before a pull request:

- create a new ordered migration; never edit an applied migration;
- document compatibility, rollback/forward-fix, and affected RLS/grants;
- run `corepack pnpm exec supabase db reset`;
- run `corepack pnpm test:db`;
- add allow and cross-user deny tests for each exposed user-owned relation.

Before a production apply:

- review migration SQL and the protected PR checks;
- record `supabase db push --dry-run` evidence;
- verify backup freshness for destructive or high-risk work;
- confirm the migration is expand-only when stable and candidate backend versions can overlap;
- obtain the required protected deployment approval.

## RLS Releases

Changes to grants, revokes, policies, `SECURITY DEFINER` functions, or privileged credentials are security releases. Include negative tests and do not use a secret key for normal user CRUD.

## Recovery

Prefer forward fixes for deployed migrations. A destructive rollback requires a reviewed new migration and must not remove schema referenced by a retained rollback target.
