# FEAT-WX-002 — full weather readings and extended outlook

Status: **REVIEW**, local implementation verified on 2026-10-15. No production release,
database mutation, new secret, paid service, or warning-feed integration was performed.

## Scope and compatibility

Group A is the first vertical slice of the owner-selected A–K, M, O expansion.
The full sequence and owner/user role decision are tracked in
`docs/design/feature-completion-roadmap.md`; later groups are not complete.
Dependencies WX-004, WEB-012, and CACHE-001 are DONE in `.agent/status.yaml`.

- Added optional normalized current wind direction/gusts, cloud cover, precipitation,
  rain, snowfall, day/night flag, and timestamped hourly visibility/UV estimates.
- Added optional detailed hourly measurements and daily solar events, daylight,
  precipitation totals, maximum UV, wind and gusts.
- The existing `daily` array remains a seven-day compatible response. A separate
  optional `extendedDaily` array supports up to 16 days with **nullable rain probability**.
  Old cached responses still parse. Missing values render as unavailable; they are not
  manufactured as zero. Other consumers continue using the stable daily/hourly arrays.
- Model forecast variables are explicitly requested in °C, km/h and mm; snowfall
  remains the provider's cm. Browser formatting converts mm/cm to inches independently
  and meters to kilometers/miles. Local daylight times use the location's timezone.
- Daily dates advance by calendar day from the first model date, avoiding duplicate
  dates when fixed-86400-second provider arrays cross a DST transition. Event timestamps
  are not rewritten. Zero/null polar sunlight events are presented as “No event.”
- The 7/16-day switch is client-side over existing normalized data and does not trigger
  another provider request. Current, hourly and daily detail disclosures retain the
  Skyglass layout and semantic `dl`/`dt`/`dd` measurements.

## Provider and budget checks

Reviewed the official forecast documentation through Context7 and the public pricing
page: <https://open-meteo.com/en/pricing>. No account/configuration changes were made.
Keep non-commercial usage and attribution. The conservative isolate-local guard reserves
5 weighted units for 42 temporal-group variable selections over 16 days. This is not a
distributed quota enforcer or a claim about exact provider billing.

A bounded read-only request using the actual adapter successfully returned 7 legacy
days, 16 unique extended dates, 12 near-term hours, and approximately 12 KB of normalized
JSON. Six later days lacked rain probabilities, validating the nullable extension.
After the DST correction the local dates advanced consecutively from October 15–30.
Provider responses were not committed.

## Validation

| Check                                                | Result                                      |
| ---------------------------------------------------- | ------------------------------------------- |
| Focused contracts/provider/web helpers/gateway tests | 101 passed in 18 files                      |
| Full `corepack pnpm test`                            | 130 Vitest tests and 78 script tests passed |
| `corepack pnpm typecheck`                            | Passed                                      |
| Targeted ESLint                                      | Passed                                      |
| Gateway build (`wrangler deploy --dry-run`)          | Passed; no upload/deployment                |
| Dashboard Playwright suite                           | All 26 tests passed                         |
| Web production build                                 | Passed                                      |

Tests cover old responses, range rejection, null long-range probabilities, aligned
array sizes, canonical units, atomic quota reservation, polar events, both DST clock
changes, timezone offsets, imperial formatting, disclosures, and 320px layout overflow.

Manual inspection used a local Worker and Next.js with live public Open-Meteo data at
1440px, 390px and 320px widths in dark/light themes. Current readings and extended-day
details were inspected, including long-range unavailable rain probability and no page
overflow. Screenshots are local temporary artifacts, not deployed assets. The local
development CSP correctly blocked localhost cross-port browser map requests and React
development eval; CSP was not weakened. This is not a clean production-console claim.

## Remaining review and release gates

- Protected PR security scans and review remain pending; do not represent them as run.
- Measure candidate Worker **p95 CPU ≤7 ms** before production exposure. Local build
  success and Node timings are not a Cloudflare CPU measurement. If the budget fails,
  move richer normalization off the Worker rather than raising the threshold.
- Backend/provider release must precede the frontend for live richer data. Frontend-only
  deployment tolerates old data but cannot manufacture missing measurements/horizon.
- Retain prior immutable releases. Rolling back the web/provider code requires no schema
  rollback, data deletion, or migration.
