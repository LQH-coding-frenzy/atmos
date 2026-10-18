# FEAT-CMP-003 — expanded multi-city comparison

Status: **REVIEW**. No production release, schema, provider, secret, or paid-service
change is included.

## Scope

- Compare the current dashboard city with at most three explicitly selected destination
  cities. Coordinates are deduplicated; a duplicate/current city cannot be added.
- Show current temperature, feels-like, humidity, wind/gust, next-hour rain chance and
  precipitation, UV, current U.S./European AQI when loaded, and deterministic activity
  suitability with its input coverage.
- Rank all compared places by activity score, then coverage. The user selects the built-in
  activity profile. Missing metrics remain “Not loaded” or “Unavailable” and lower
  coverage; no comparison value is fabricated as zero.
- Weather dashboard calls occur only after selecting a search result. AQI timeline calls
  occur only after the user activates the control; one existing timeline request per
  compared location, at most four total and two concurrent. The existing gateway validates,
  caches and coalesces requests.
- Keep comparison data, search selections and AQI response cache in bounded component
  memory only. Do not persist comparison history, add telemetry, or change the dashboard
  current location until the user chooses **Make [city] current**.

## Safety and compatibility

- Uses only current public `/api/v1/weather/dashboard` and `/api/v1/weather/air-quality`
  contracts and existing Open-Meteo/CAMS attribution.
- No database changes, backend routes, Worker work, new provider, keys or paid resources.
- Search and weather errors remain visible and recoverable. AQI values are modeled
  estimates, not station readings; incomplete timeline data is excluded from scoring and
  reported through coverage.
- Rollback restores the existing single-destination comparison; no persistent state or
  contract changes need migration.

## Validation

- `corepack pnpm exec vitest run apps/web/lib/weather-comparison.test.ts packages/domain/src/index.test.ts` — 14 tests passed.
- `corepack pnpm exec playwright test tests/e2e/weather-comparison.spec.ts tests/e2e/dashboard.spec.ts --workers=1` — 27 browser tests passed.
- The focused browser test verifies three destination additions, a disabled fourth result,
  current plus destination metrics, no AQI request before explicit action, four timeline
  calls with at most two concurrent, activity-score ranking, and a 320px no-overflow check.
- TypeScript, targeted ESLint, Prettier/diff check and the Next.js production build passed.
- Desktop and 390px comparison-panel screenshots were generated in ignored Playwright
  output. The activity comparison shows the chosen profile, ranking and coverage without
  overlap; the mobile panel scrolls the ranked list within the weather-tools drawer.

The dashboard E2E run logged OpenFreeMap glyph-range 404 responses and used the renderer
fallback glyphs; assertions still passed. This existing external map-style behavior is
unmodified by FEAT-CMP-003.

## Remaining gates

Protected PR security/quality checks and review are pending. No production changes are
included in FEAT-CMP-003.
