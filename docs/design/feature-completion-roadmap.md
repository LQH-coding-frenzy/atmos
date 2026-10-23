# Owner-selected feature completion

Status: selected groups A–K, M, and O were released to production on 2026-10-22. This is not a
completion claim for unselected work or the outstanding Worker CPU gate.

The owner selected groups A–K, M, and O after the Skyglass/Observatory release.
Google OAuth is complete and is not part of this work. Preserve the current design,
public gateway boundary, local-device geolocation privacy, RLS, and protected releases.

| Group | Scope                                                                                      | State / prerequisite                                                                                                                 |
| ----- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| A     | Full weather readings, local sun/daylight details, 7–16-day outlook                        | Production released 2026-10-22; post-release CPU p95 exceeds 7 ms; PERF-002 pending                                                  |
| B     | Additional chart series, ranges, annotations, and appropriate zoom                         | DONE locally: FEAT-CHART-002 merged in PR #310; chart changes are browser-only                                                       |
| C     | Favorites/categories, recent searches, account-synced place preferences, coordinate search | Production migration/release completed 2026-10-22; Saved Locations GET recovered after migration                                     |
| D     | Saved-place markers, arbitrary map-point selection, AQI overlay, legends                   | DONE locally: FEAT-MAP-002 merged in PR #312; discrete model AQI points only, no interpolation                                       |
| E     | AQI forecasts and historical AQI charts                                                    | Production released 2026-10-22; post-release Worker CPU p95 gate failed; PERF-002 pending; modeled history, not station/diary data   |
| F     | Weather calendar with day-specific hourly, sun, AQI, planner and rule context              | DONE locally: FEAT-CAL-001 adds selected-day detail, on-demand AQI, activity score, and scheduled-rule context; no background work   |
| G     | Full activity set, custom profile, richer deterministic scoring                            | DONE locally: FEAT-PLAN-002 merged in PR #313; AQI timeline remains opt-in                                                           |
| H     | Multi-city comparison with the expanded metrics and suitability ranking                    | DONE locally: FEAT-CMP-003 merged in PR #314; explicit AQI load and bounded destinations                                             |
| I     | Custom/24-hour history ranges, aggregates, additional charts and event counts              | DONE locally: HIST-ANALYTICS-001 merged in PR #315; recorded snapshots only, no backfill                                             |
| J     | Deterministic anomaly insights                                                             | DONE locally: FEAT-ANOM-001 merged in PR #316; minimum coverage and unsupported metrics disclosed                                    |
| K     | Expanded in-app rules, schedules and cooldown configuration                                | DONE locally: ALERT-INAPP-002/003 add schedule controls and on-demand full-weather/AQI/official-warning conditions; no delivery path |
| M     | Official warning center with honest geographic coverage                                    | Production released 2026-10-22; FEAT-WARN-002 remains on the existing Next.js server path                                            |
| O     | Profile, account preferences, timezone and owner/user roles                                | Production UI released 2026-10-22; owner bootstrap reported complete and Owner role visible in signed-in smoke                       |

## Delivery sequence

1. A: additive contracts/provider/readings with old-response compatibility and quota accounting.
2. E/B/G/H/F: forecast consumers; use bounded on-demand queries rather than fan-out on every render.
3. C/O/I/K: authenticated features with additive migrations, owner-scoped APIs, negative RLS tests and account deletion compatibility.
4. J/M/D: baseline-dependent insights, official-feed integration and map capabilities after source/coverage validation.

One canonical task is implemented and verified at a time. L (notification delivery),
N (SSE), P (push), Q (automatic history/backfill), R (recurring operations), and S (AI)
remain unselected. Configurable in-app schedules do not authorize reactivating cron/queues.

Each task needs a separate completion/evidence record; no task is DONE merely because
its schema, placeholder, or presentation exists. Production changes require a separately
approved protected release. Paid services, new secrets, and provider expansion are approval gates.
