# FEAT-PROFILE-001 implementation evidence

Date: 2026-10-21

Status: DONE locally on `feature/profile-preferences-001`; no production release.

## Delivered

- Added account profile editing for `display_name` and account-synced `units`, `theme`, and `timezone` through the existing `GET/PATCH /api/v1/me` API.
- The dashboard now applies an IANA display timezone to its date/time labels, charts, and activity planner. `auto` follows the selected location's local timezone. Weather requests and location data continue to use the selected location timezone.
- Profile and preference reads/writes use the configured Supabase publishable key plus the verified caller JWT. Row IDs come from `auth.getUser()`; updates are restricted to the caller's RLS-owned rows. Request fields are strict and bounded; role/ownership fields are rejected.
- Existing `profiles` and `user_preferences` rows, grants, and RLS policies are reused unchanged. No migration, new secret, hosted resource, or deployment was created.
- Group O is partial: ADR 0004 records Auth `app_metadata.atmos_role` as the owner/user source. Role management/bootstrap remain deferred pending the owner UUID, role-management policy, and separate approval for any hosted metadata mutation. No admin tier or client-controlled privilege assignment was introduced.

## Verification

- `corepack pnpm exec vitest run packages/contracts/src/index.test.ts supabase/functions/_shared/profile-preferences.test.ts` — 24 tests passed.
- `corepack pnpm exec vitest run workers/gateway/src/index.test.ts` — 33 tests passed, including authenticated PATCH forwarding.
- `corepack pnpm test:db` — 9 SQL test files / 144 tests passed, including existing own-row allow and cross-user deny checks.
- `corepack pnpm exec playwright test tests/e2e/profile-preferences.spec.ts --workers=1` — 1 test passed; uses mocked local Auth/API responses and verifies JWT forwarding, persistence, timezone rendering, and a 390px viewport.
- `corepack pnpm exec playwright test tests/e2e/dashboard.spec.ts --grep "persists unit and theme preferences|keeps tools exclusive|authenticates, saves the current place" --workers=1` — 3 tests passed.
- `deno check --node-modules-dir=auto supabase/functions/api-v1/index.ts supabase/functions/_shared/profile-preferences.ts` — passed.
- `corepack pnpm exec eslint` on the affected TypeScript files with `--max-warnings=0` — passed.
- `corepack pnpm typecheck` — passed.
- `corepack pnpm --filter @atmos/web build` — passed.
- Prettier check and `git diff --check` — passed.

The browser test mocks the API and does not claim a live Supabase endpoint integration. The local SQL suite verified the existing RLS own-row allow and cross-user deny behavior; no schema, grant, or policy changed. A failure between the two existing-table updates can leave one row updated; retries are idempotent and converge without requiring a migration or privileged transaction.

## Release and rollback

No production/staging deploy or hosted database mutation was performed. Reverting the API and UI returns the dashboard to its existing device-local units/theme behavior; no schema rollback is needed.
