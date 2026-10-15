# Owner-selected feature completion

Status: implementation started. This is not a completion claim or production approval.

The owner selected groups A–K, M, and O after the Skyglass/Observatory release.
Google OAuth is complete and is not part of this work. Preserve the current design,
public gateway boundary, local-device geolocation privacy, RLS, and protected releases.

| Group | Scope                                                                                      | State / prerequisite                                                                               |
| ----- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| A     | Full weather readings, local sun/daylight details, 7–16-day outlook                        | REVIEW: FEAT-WX-002 locally implemented; production and live CPU gate pending                      |
| B     | Additional chart series, ranges, annotations, and appropriate zoom                         | PLANNED: normalized A/E data first                                                                 |
| C     | Favorites/categories, recent searches, account-synced place preferences, coordinate search | PLANNED: persisted preferences need additive migrations/RLS tests                                  |
| D     | Saved-place markers, arbitrary map-point selection, AQI overlay, legends                   | PLANNED: verify AQI tile availability/licensing; do not fake a continuous layer from sparse points |
| E     | AQI forecasts and historical AQI charts                                                    | REVIEW: FEAT-AQI-TIMELINE-001 locally implemented; modeled history, not recorded observations      |
| F     | Weather calendar with day-specific hourly, sun, AQI, planner and rule context              | PLANNED: A/E/G/K                                                                                   |
| G     | Full activity set, custom profile, richer deterministic scoring                            | PLANNED: A/E; missing inputs must reduce coverage, not imply good weather                          |
| H     | Multi-city comparison with the expanded metrics and suitability ranking                    | PLANNED: A/E/G; bound requests/concurrency                                                         |
| I     | Custom/24-hour history ranges, aggregates, additional charts and event counts              | PLANNED: user-recorded history remains the source until separate backfill approval                 |
| J     | Deterministic anomaly insights                                                             | PLANNED: meaningful historical baseline and minimum sample coverage required                       |
| K     | Expanded in-app rules, schedules and cooldown configuration                                | PLANNED: A/E/M plus additive validation; no background delivery implied                            |
| M     | Official warning center with honest geographic coverage                                    | RESEARCH: broadest verifiable free coverage; new vendors/credentials require approval              |
| O     | Profile, account preferences, timezone and owner/user roles                                | PLANNED: owner and users only; no admin tier, no client-controlled privilege assignment            |

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
