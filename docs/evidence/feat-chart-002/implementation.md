# FEAT-CHART-002 — expanded weather analytics charts

Status: **REVIEW**. Chart implementation and local validation are complete; protected PR review is pending. No production release.

## Scope

- Existing chart surface now has selectable temperature, feels-like, mean humidity,
  precipitation, rain probability, accumulated rainfall, pressure, maximum wind/gusts,
  maximum UV, mean visibility, and mean cloud cover.
- Time windows are 12 hourly forecast points, 7 daily points, and up to 16 daily points.
  The 16-day control disables when an older server provides only seven days. The
  accumulated-rainfall metric is unavailable in the hourly window and is guarded in
  both the native selector and its change handler.
- Series use metric-aware units, data-zoom on the long outlook, crosshair axis pointer,
  tooltip points, minimum/maximum annotations and summary, and exact accessible values.
  Precipitation remains a bar series. Long daily periods visibly mark higher rain-chance
  bands; hourly charts shade night intervals and mark sunrise/sunset when in range.
- Missing values remain gaps. Cumulative rain is withheld after the first missing total,
  because later totals cannot be represented as complete accumulation. No extra API fetch
  is performed on chart metric/window changes.
- AQI model history/forecast remains its own independently attributed chart in group E.

## Validation completed 2026-10-16

- `corepack pnpm exec vitest run apps/web/lib/forecast-trend.test.ts packages/provider-openmeteo/src/full-weather.test.ts`: 11 passed.
- `corepack pnpm test`: 142 Vitest tests and 78 script tests passed.
- Combined dashboard, AQI timeline and chart Playwright suites: 32 passed serially.
- TypeScript, ESLint, Prettier, Worker dry-run and web production build passed.
- Desktop, mobile and 320px narrow chart states were visually inspected in light/dark themes. Chart-range and series changes perform no API request.

## Data semantics

Daily apparent maximum, humidity/pressure/cloud/visibility means are summarized from
available future hourly model samples for each local forecast date. First-day means cover
only the remaining forecast hours; they are not full-day observed averages. Precipitation,
rain and snowfall totals, UV max, wind max and gust max use Open-Meteo daily aggregates.
Visibility/UV/precipitation estimates remain model values, not station measurements.

## Validation

- Focused `forecast-trend.test.ts` and `full-weather.test.ts` validate each series,
  conversions, missing-data gaps, cumulative-rainfall behavior, and local-hour labels.
- `tests/e2e/forecast-charts.spec.ts` covers data from an API fixture, 12h/7d/16d ranges,
  metric selection, disabled hourly-only-incompatible choices, exact-value disclosure,
  no refetch, and 320px layout.
- Protected PR review/scans and protected production release remain pending.

## Rollback

The chart component can be reverted independently of weather data. Keep A's optional
normalized daily fields; no persistent state or migration is introduced. Production CPU
and release controls remain unchanged because this chart runs in the browser.
