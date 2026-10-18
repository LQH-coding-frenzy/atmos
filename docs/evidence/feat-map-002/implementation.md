# FEAT-MAP-002 — saved places, coordinate previews and AQI map samples

Status: **REVIEW**. This evidence is local-only; no production release, secret, map
provider, database schema, Worker or infrastructure change was made.

## Shipped in this task

- Passes only authenticated saved-place rows returned by the existing RLS-backed UI API
  to MapLibre as saved-place GeoJSON points. Server-provided favorite/default metadata
  styles the pins. There is no new API or persistence path.
- Clicking a map label/pin opens a place preview. Clicking an arbitrary map point opens
  a forecast preview using those coordinates directly; the user must press **Use this
  location** to change the selected weather location. No geocoder request is made.
  Existing coordinate search remains the keyboard-accessible alternative.
- Adds an opt-in modeled-AQI layer using only the existing
  `/api/v1/weather/air-quality` gateway contract. It requests the current location and at
  most seven saved places visible in the current map bounds, deduplicates coordinates,
  uses at most two requests concurrently, limits new map requests to 12/minute/open map session,
  keeps a 32-entry bounded memory cache, caches successful data for five minutes and
  negative results for 30 seconds. User refresh invalidates negative entries, not good
  data. Panning/zooming only samples another bounded set when the layer is active.
- AQI markers and the accessible value list retain U.S./European values, model time and
  stale-cache metadata. Missing, failed and rate-limited values are explicitly distinct;
  missing AQI is gray/“Unavailable” or “Not sampled”, never zero. Markers are discrete
  points and are never interpolated into a heatmap.
- Adds U.S. AQI breakpoint colors and quantitative stop legends for existing OpenWeather
  current raster layers. Published provider pressure stops are converted from Pa to hPa
  for display; temperature and wind thresholds follow selected display units. The map's
  existing attribution control and provider links remain in place.
- Discloses Open-Meteo/CAMS model attribution, CC BY 4.0, approximate model resolution
  and that samples are not ground-station readings. Map-only selections are not added to
  saved places, recent-search storage or telemetry.

## Safety and compatibility

- No database migrations or RLS policy changes. The signed-in saved-place API and its
  current owner checks are reused unchanged.
- No new vendor, data source, paid service, API key, secret or Worker CPU work.
- Public AQI traffic is user-triggered, bounded in candidate count, concurrency and
  per-open-map-session request rate; the existing gateway cache and rate controls still apply.
- Rollback is limited to removing the new client-side map GeoJSON sources/layers, legend
  and click handler. Existing map, city preview, saved places and AQI API remain intact.

## Validation

- `corepack pnpm exec vitest run apps/web/lib/map-overlays.test.ts apps/web/lib/map-city.test.ts apps/web/lib/weather-radar.test.ts packages/contracts/src/index.test.ts` — 30 tests passed.
- `corepack pnpm exec playwright test tests/e2e/map-feature-completion.spec.ts tests/e2e/dashboard.spec.ts --workers=1` — 27 browser tests passed.
- `corepack pnpm typecheck` — passed.
- Targeted ESLint over contracts, dashboard/map components, map overlay helpers and browser tests — passed with zero warnings.
- Prettier checks for all changed source/docs plus `git diff --check` — passed.
- `NEXT_PUBLIC_SUPABASE_URL=https://auth-e2e.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=e2e-test corepack pnpm --filter @atmos/web build` — Next.js production build passed.
- Playwright screenshots were generated at desktop, 390px and 320px in the ignored `test-results` output directory. At 320px the AQI panel stays within the viewport and does not overlap map zoom controls.

The new browser test uses a deterministic background-only map style to avoid depending
on external vector tiles. These captures validate overlay layout and behavior, not
OpenFreeMap tile availability or label styling. The existing production vector style was
not changed.

## Remaining gates

Protected PR checks/review and merge are pending. Do not release this frontend or change
production; no migration or infrastructure promotion is part of this task.
