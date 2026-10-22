# ALERT-INAPP-003 implementation evidence

Date: 2026-10-22

Status: DONE locally on `feature/profile-preferences-001`; no production release or background delivery.

## Delivered

- Added supported in-app conditions for the full-weather measurements, AQI, PM2.5, freeze risk, extreme heat, and official severe-warning presence using the completed Groups A/E/M contracts and routes.
- Weather values are evaluated from the current dashboard snapshot and loaded hourly forecast. AQI uses current values and the next 24 hours of the existing on-demand timeline. Official-warning presence is true only for supported coverage with at least one active alert; missing or unsupported source data does not become a false “no alert” result.
- AQI and warning requests are issued only while the user has opened Alerts and a selected or enabled rule requires that source. Existing response bounds, cache paths, and provider adapters are reused.
- The `owner/user` roles, in-app alert schedule, and cooldown behavior are unchanged. Cooldown remains stored for future delivery; no queue, cron, email, push, or background evaluator was added.
- No migration, new table, grant, RLS policy, Worker route, vendor, credential, or paid resource was added.

## Verification

- `corepack pnpm exec vitest run supabase/functions/_shared/alert-rules.test.ts packages/domain/src/index.test.ts packages/contracts/src/index.test.ts` — 42 tests passed.
- `corepack pnpm exec playwright test tests/e2e/dashboard.spec.ts --grep "authenticates, saves the current place" --workers=1` — 1 end-to-end test passed; it verifies on-demand AQI/warning requests with mocked responses.
- `deno check --node-modules-dir=auto supabase/functions/api-v1/index.ts supabase/functions/_shared/alert-rules.ts` — passed.
- Focused ESLint, `corepack pnpm typecheck`, `corepack pnpm --filter @atmos/domain build`, `corepack pnpm --filter @atmos/web build`, Prettier check, and `git diff --check` — passed.

The local `corepack pnpm test:db` attempt could not connect to `127.0.0.1:54322` (connection refused). No SQL schema or RLS policy changed; the existing RLS suite passed earlier in this session. The local Supabase stack was not reset or restarted to avoid disturbing existing local state.

## Rollback

Revert the additive metric parsing, on-demand context fetches, and UI options. Existing alert records, schedules, and user-owned RLS remain unchanged.
