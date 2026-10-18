# HIST-ANALYTICS-001 — ranges and analytics for recorded weather

Status: **DONE locally**, merged in [PR #315](https://github.com/LQH-coding-frenzy/atmos/pull/315). This task uses only the existing authenticated history endpoint and
user-recorded snapshots. No provider history, automatic backfill, schema change or
production release was added.

## Scope and invariants

- Adds 24-hour, 7-day, 30-day, 90-day, and custom calendar-date ranges. Custom ranges are
  interpreted in the selected location's timezone and limited to the most recent 90 days;
  the client maps these ranges to the API's existing 7/30/90-day query choices.
- The existing endpoint's 100-snapshot response cap is disclosed. Values are filtered from
  snapshots the signed-in user chose to record; no provider history or unobserved values
  are backfilled.
- Adds selectable temperature, feels-like, humidity, wind, and pressure series, plus
  min/average/max aggregates. The chart uses one dot per recorded observation with no
  connecting/interpolated line; exact values and times remain in the list/CSV.
- Adds condition counts labelled as counts of recorded snapshots, not event duration or a
  count of unsampled weather events.
- Existing record, delete, CSV export, account JWT/RLS, and location scoping remain intact.
  Export includes only observations visible in the selected range.

## Validation

- `corepack pnpm exec vitest run apps/web/lib/weather-history-analytics.test.ts apps/web/lib/weather-history-export.test.ts` — 6 tests passed.
- `corepack pnpm exec playwright test tests/e2e/weather-history-analytics.spec.ts tests/e2e/dashboard.spec.ts --workers=1` — 27 browser tests passed.
- `corepack pnpm typecheck` — passed.
- Targeted ESLint for the history panel/helper and browser tests — passed with zero warnings.
- Prettier/diff checks and the Next.js production build — passed.
- The browser test covers 24-hour filtering, location-timezone custom dates, sample aggregates,
  discrete-dot charts, recorded-condition counts and 320px overflow. Desktop and mobile
  screenshots are in ignored Playwright output.

The dashboard E2E output includes existing OpenFreeMap glyph-range 404s with renderer
fallback glyphs; all tests pass and the history implementation does not use those requests.

## Remaining gates

PR #315 quality, database, Playwright, CodeQL, Semgrep, secret-scan, Trivy, SBOM and Vercel
preview checks passed. No production release, database change or provider backfill is part
of HIST-ANALYTICS-001.
