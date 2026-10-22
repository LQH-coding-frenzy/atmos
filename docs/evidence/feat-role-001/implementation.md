# FEAT-ROLE-001 implementation evidence

Date: 2026-10-22

Status: DONE locally on `feature/profile-preferences-001`; owner reports the one-time Auth bootstrap succeeded; no deployment.

## Delivered

- `GET/PATCH /api/v1/me` returns the role derived from the caller returned by `auth.getUser()` and that user's Auth-owned `app_metadata.atmos_role`.
- The only recognized role values are `owner` and `user`. Missing or unknown metadata resolves to `user`; the browser contract tolerates an older backend with no role field.
- Account Settings displays the role but has no role-changing controls. `PATCH /api/v1/me` continues to reject a `role` field.
- Added `apps/web/scripts/bootstrap-owner.mjs` for one-time, bootstrap-only assignment. It defaults to dry-run, requires the exact owner-confirmed Auth UUID and matching project ref, requires `--apply` for a write, checks that no owner already exists, preserves existing `app_metadata`, and only accepts the current `sb_secret_` Secret Key format. It never prints IDs, emails, or credentials.
- ADR 0004 records the source and bootstrap-only policy. No SQL migration, role table, Auth Hook, grant, RLS change, new secret, or in-app role manager was added.

## Verification

- `corepack pnpm exec vitest run packages/contracts/src/index.test.ts supabase/functions/_shared/app-role.test.ts` — 26 tests passed.
- `corepack pnpm --filter @atmos/web exec node --test scripts/bootstrap-owner.test.mjs` — 6 tests passed, covering dry-run, explicit apply, metadata preservation, single-owner checks, and target validation.
- `corepack pnpm test:db` — 9 SQL test files / 144 tests passed; existing RLS allow/deny behavior remains unchanged.
- `corepack pnpm exec playwright test tests/e2e/profile-preferences.spec.ts --workers=1` — 1 test passed; role display is exercised for user and owner responses using a mocked API.
- `corepack pnpm exec playwright test tests/e2e/dashboard.spec.ts --grep "persists unit and theme preferences|keeps tools exclusive" --workers=1` — 2 regression tests passed.
- `deno check --node-modules-dir=auto supabase/functions/api-v1/index.ts supabase/functions/_shared/app-role.ts` — passed.
- Focused ESLint, `corepack pnpm typecheck`, `corepack pnpm --filter @atmos/web build`, Prettier check, and `git diff --check` — passed.

## Approval and remaining limitation

The agent did not run the bootstrap or access the secret. The owner reports running `--apply` against the confirmed production target and receiving `Owner role assigned.` The Auth record was not independently verified, and its UUID is omitted from evidence. The list-then-update Auth Admin check is not atomic, so the manual bootstrap must not be run concurrently. After assignment, the owner must refresh the Supabase session; the production app still needs its separately approved release to display the role.
