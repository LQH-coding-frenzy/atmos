# FEAT-CAL-001 implementation evidence

Date: 2026-10-22

Status: DONE locally on `feature/profile-preferences-001`; no production release.

## Delivered

- Added a Calendar tool with selectable available forecast dates. The selected date shows its available hourly forecast, daily measurements and sun/daylight context.
- The AQI timeline loads only when the Calendar tool is opened and clearly reports dates outside model coverage instead of substituting zeros.
- The activity panel scores the selected day's hourly window and displays coverage/missing dimensions. Users can select a built-in activity profile.
- Signed-in users see in-app rules scheduled for the selected location day. Rules are fetched through the existing gateway with the caller JWT and remain RLS-scoped; the calendar reports schedule context, not a future trigger or delivery.
- No schema, RLS, provider, Worker route, secret, paid resource, cron, queue, or background process was added.

## Verification

- `corepack pnpm exec vitest run apps/web/lib/weather-calendar.test.ts packages/domain/src/index.test.ts` — 14 tests passed.
- `corepack pnpm exec playwright test tests/e2e/weather-calendar.spec.ts --workers=1` — 1 test passed at desktop and 390px viewport with mocked Auth, AQI, and rule APIs.
- Focused ESLint and `corepack pnpm typecheck` — passed.
- `corepack pnpm --filter @atmos/web build` — passed.
- Prettier check and `git diff --check` — passed.

The browser test uses mocked API responses; it does not claim a live provider or Supabase integration. The existing local RLS suite was not rerun for this UI-only task; no database access policy changed.

## Rollback

Revert the Calendar component and helper files. No persistent state, schema, or scheduled work is created.
