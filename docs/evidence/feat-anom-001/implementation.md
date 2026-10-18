# FEAT-ANOM-001 — deterministic insights from recorded weather

Status: **REVIEW**. This task adds only browser-side calculations over the existing
RLS-returned user snapshots and fresh dashboard observation. It does not request history
from a provider, backfill prior weather, write additional history, or change production.

## Rules

- Require at least 12 recorded snapshots across at least seven distinct dates in the
  selected location's timezone before comparing the current reading to a baseline.
- For recorded temperature, feels-like, humidity, wind and pressure, calculate an
  arithmetic mean and standard deviation. Surface a deterministic deviation only when it
  is at least two standard deviations and the metric's minimum practical difference
  (temperature/feels-like 3°C, humidity 15 percentage points, wind 12 km/h, pressure 8 hPa).
- Compare only fresh current weather. If the current dashboard is stale, pause insights.
- Count rare rain/snow/thunderstorm _condition snapshots_ only; never claim duration or
  rainfall amount from condition labels. Rainfall amount, AQI and UV baselines are
  unsupported because those values are not in the captured snapshot shape.
- When coverage is insufficient, state the sample count/date requirement and show no
  anomaly claims. Even when coverage is sufficient, insights are descriptive, not alerts,
  health advice or safety advice.

## Validation

- `corepack pnpm exec vitest run apps/web/lib/weather-history-analytics.test.ts` — 5 tests passed.
- `corepack pnpm exec playwright test tests/e2e/history-anomaly-insights.spec.ts tests/e2e/weather-history-analytics.spec.ts tests/e2e/dashboard.spec.ts --workers=1` — 28 browser tests passed.
- TypeScript, targeted ESLint, Prettier/diff checks and the Next.js production build passed.
- Desktop and mobile anomaly-panel screenshots were generated in ignored Playwright output; the E2E also checks 320px page overflow and stale-current suppression.

## Remaining gates

Protected PR security/quality checks and review are pending. No production release or
backfill is part of FEAT-ANOM-001.
