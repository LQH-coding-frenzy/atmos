# ALERT-INAPP-002 implementation evidence

Date: 2026-10-22

Status: DONE locally on `feature/profile-preferences-001`; no production release or background delivery.

## Delivered

- In-app-only alert creation accepts a unique weekday mask, optional start/end instants, and a cooldown from 1 to 10,080 minutes. Older clients that omit a schedule retain all weekdays and the existing 60-minute cooldown.
- In-app status respects the selected location's weekday and the optional absolute time window. Date/time form values use the device's local timezone and are stored as offset-aware ISO timestamps.
- The panel displays the saved schedule. Cooldown is persisted for future delivery only and does not suppress the current on-demand status. Rules are still paused/deleted rather than edited after creation.
- No email, push, queue, cron, background evaluator, migration, table, grant, or RLS change was added.

## Verification

- `corepack pnpm exec vitest run supabase/functions/_shared/alert-rules.test.ts packages/domain/src/index.test.ts packages/contracts/src/index.test.ts` — 39 tests passed.
- `corepack pnpm exec playwright test tests/e2e/dashboard.spec.ts --grep "authenticates, saves the current place" --workers=1` — 1 test passed, including weekday, time-window, and cooldown creation through the authenticated UI.
- `deno check --node-modules-dir=auto supabase/functions/api-v1/index.ts supabase/functions/_shared/alert-rules.ts` — passed.
- Focused ESLint, `corepack pnpm typecheck`, `corepack pnpm --filter @atmos/domain build`, `corepack pnpm --filter @atmos/web build`, Prettier check, and `git diff --check` — passed.

`corepack pnpm test:db` was attempted but the local database port `127.0.0.1:54322` refused the connection. The existing 144-test RLS suite passed earlier in this session; this task made no schema or policy change. The local stack was not reset or restarted to avoid disturbing existing local state.

## Rollback

Revert the schedule form, parser, and in-app date-window evaluation. Existing stored schedule JSON remains readable; notification delivery and RLS are unaffected.
