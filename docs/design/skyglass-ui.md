# Atmos Skyglass and Observatory

## Design contract

The owner selected two compositions of the same working weather application:

- `/` is **weather-first Skyglass**: location, current temperature, near-term forecast, seven-day outlook, trends, activity windows, then a generous map preview.
- `/#map` is **map-first Observatory**: an unobstructed map, compact search/navigation, a collapsible weather inspector, and grouped layer/playback controls.

Both compositions share the selected city, units, theme, weather, tool instances, and one MapLibre map. Hash-only navigation must not fetch weather again or clear a device location. Existing location share URLs and browser history remain functional.

Feature expansion from the wider master-plan inventory is on hold during this UI/UX overhaul. This work presents the existing features and data; it does not add deferred weather measurements or background services.

## Visual system

- Semantic colors in `apps/web/app/theme.css`: cloud/slate light surfaces, ink/navy dark surfaces, glacial-blue actions, and restrained warm condition accents.
- Large tabular temperature readings, deliberate system typography, and aligned forecast values.
- Tonal content surfaces. Glass is reserved for navigation, map controls, and transient headers. Use readable opaque surfaces for detailed tools and forms.
- Consistent control/panel radii and a small elevation vocabulary; grouping and spacing carry the hierarchy.
- The mobile navigation becomes a safe-area-aware bottom dock. Weather tools use a native modal dialog, presented as a bottom sheet on phones and a side drawer on larger screens.
- Observatory reuses the mounted dashboard sections as an inspector with Now, 7 days, Trends, and Plan views. On phones it starts collapsed to prioritize the map.
- Motion communicates state. Honor reduced motion/transparency and provide an opaque glass fallback.

## Finish conditions

Current weather appears within the first phone viewport. Desktop charts do not stretch to match unrelated content. Tool disclosures, focus restoration, empty/error states, account flows, and map interactions remain usable. Search, navigation, inspector, playback, and provider attribution must not overlap at the verified sizes.

Verify 1440×900 desktop, 768px tablet, 390×844 phone, and 320px narrow layouts in both themes. Exercise direct map entry, Back/Forward, map state retention, device-location privacy, keyboard access, and existing authenticated flows using fixtures. Distinguish fixtures and local public-request routing from production verification.

## References

- [UI Taste by Uizze](https://uizze.sh/): new-work, product/dashboard, and craft playbooks loaded for this redesign.
- [Google: the research behind Material 3 Expressive](https://design.google/library/expressive-material-design-google-research): hierarchy through scale, shape, color, and containment.
- [Apple Human Interface Guidelines: Materials](https://developer.apple.com/design/human-interface-guidelines/materials): glass as a functional navigation/control layer, used sparingly with legibility and accessibility fallbacks.

The interface uses original CSS and the existing Lucide icons. Web glass styling is CSS-based; native Apple assets, proprietary fonts, and native Liquid Glass APIs are not bundled.

## Implementation verification

- `corepack pnpm exec vitest run apps/web/lib` — 37 tests passed across 13 files.
- `corepack pnpm exec playwright test tests/e2e/dashboard.spec.ts --workers=1` — all 24 browser tests passed. The affected dashboard/map cases were rechecked after the final map-control spacing adjustment.
- Frontend TypeScript, ESLint, targeted Prettier checks, and the web production build passed.
- Production-build screenshots were inspected at 1440×900, 768×1024, 390×844, and 320×740 across light/dark dashboard and map compositions. Narrow-page overflow, tablet navigation names, floating-dock positioning, map-control overlap, and focus wrapping were corrected during review.
- Browser tests cover authenticated behavior with fixtures. Local visual checks routed public weather GET requests through Playwright to avoid the production gateway's localhost CORS restriction; these are local verification results, not a production deployment.

The design maintains existing provider/API contracts and device-location privacy. Closing the tools drawer also closes its disclosures, so on-demand AQI stays inactive while the drawer is closed. Weather selection preserves the current history-entry metadata to prevent a queued App Router transition from overwriting rapid Back navigation.
