# FEAT-PLAN-002 — expanded activity profiles and scoring

Status: **REVIEW**. No production release, schema, secret, provider or paid service
change is included.

## Scope

- Expand the existing deterministic planner to all nine built-in activities and an
  editable custom profile. Custom name/thresholds are component-local and are not stored
  or synchronized to an account.
- Score available temperature, feels-like, humidity, rain probability, hourly
  precipitation, wind/gust, UV, U.S. AQI, and forecast-condition inputs with explicit
  per-activity thresholds and deterministic factors.
- Report per-window input coverage and missing dimensions. Missing data is not converted
  to zero or a positive factor; the final suitability score is moderated toward neutral
  as weighted input coverage decreases.
- Request the existing seven-day-past/five-day-forecast AQI timeline only after the user chooses
  **Load AQI forecast**. One bounded gateway request supplies the whole timeline; the
  planner matches forecast hours by UTC hour and never fans out per time window. AQI is
  model output, explicitly not a ground-station reading.
- Preserve the existing weather and AQI contracts, caching, attribution and account
  boundaries. No database migration, Worker route, new source or analytics event is added.

## Validation

- `corepack pnpm exec vitest run packages/domain/src/index.test.ts` — 10 tests passed,
  covering all built-in profiles, deterministic custom thresholds, missing/null coverage,
  AQI matching, and bounded scoring.
- `corepack pnpm exec playwright test tests/e2e/activity-planner.spec.ts tests/e2e/dashboard.spec.ts --workers=1` — 27 browser tests passed.
- `corepack pnpm typecheck` — passed.
- Targeted ESLint for the domain, planner/dashboard components and browser suites — passed
  with zero warnings.
- Prettier checks for changed source/docs and `git diff --check` — passed.
- `NEXT_PUBLIC_SUPABASE_URL=https://auth-e2e.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=e2e-test corepack pnpm --filter @atmos/web build` — Next.js production build passed.
- Local Playwright planner screenshots were generated at desktop and 390px; the browser
  test also checks 320px viewport overflow. The deterministic fixture verifies no AQI
  request before selection and exactly one existing `view=timeline` request after the
  user action.

## Remaining gates

Protected PR security/quality checks and review are pending. Production deployment is
not part of FEAT-PLAN-002.
