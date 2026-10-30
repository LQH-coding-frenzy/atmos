# Quota Budget

Atmos targets zero recurring out-of-pocket cost while within free-tier quotas. Provider entitlements must be revalidated before provisioning.

| Platform                |                                          Quota |            Internal warning |
| ----------------------- | ---------------------------------------------: | --------------------------: |
| Cloudflare Workers      |                           100,000 requests/day |                         70% |
| Worker CPU              |                               10 ms/invocation |                    p95 7 ms |
| Cloudflare Queues       |                          10,000 operations/day |                         70% |
| Cloudflare R2           |                  10 GB and included operations |                         70% |
| Supabase database       |                                 500 MB/project |                         70% |
| Supabase Edge Functions |                      500,000 invocations/month |                         70% |
| Vercel Hobby            |                             provider allowance |                         70% |
| Azure for Students      |                remaining credit and ACA grants | 70%; stop before exhaustion |
| HCP Terraform           |                          500 managed resources |                         70% |
| Grafana Cloud           |                          free allowances below |       70% of each allowance |
| Open-Meteo              | 600/min, 5,000/hour, 10,000/day, 300,000/month |                         70% |

## PERF-002 Vercel weather/AQI cache budget

The Vercel Runtime Cache Hobby allowance reviewed for PERF-002 is 1,000,000 reads and 200,000
writes per month, shared across the Vercel team. Apply the repository's 70% warning rule: 700,000
reads or 140,000 writes is a HOLD-and-review threshold; the allowance is not a target to consume.
Before a release, check current team usage and expected monthly usage in Vercel's account usage view.
This repository has no measured production request baseline for the new endpoints, so it cannot
currently assert a safe percentage or traffic capacity.

Each public dashboard/AQI request attempts one Runtime Cache read. A successful cold miss or stale
revalidation attempts one write. Writes can increase with unique coordinates, cache eviction,
concurrent Vercel instances/regions, and provider-successful revalidations. The in-flight map is
instance-local; it does not deduplicate work across instances. Treat `expected reads ~= endpoint
requests` and `expected writes ~= successful cold/revalidation misses` as a lower-bound planning model,
not a quota guarantee.

Open-Meteo usage is also shared across the weather application. The existing provider guard is
process/isolate-local, not a global quota enforcer. Use the existing conservative weights—five units
per expanded dashboard miss, one per current-AQI miss, and two per timeline-AQI miss—and apply the
70% warnings across the documented provider windows: 420 weighted units/minute, 3,500/hour,
7,000/day, and 210,000/month. For scale only, if every miss were a dashboard miss, the monthly
warning corresponds to 42,000 misses; that is not an approved request target and excludes all other
Open-Meteo consumers. Cache hits use no provider units, but cache misses and duplicate cross-instance
misses do.

The new Vercel routes are anonymous and accept arbitrary valid coordinates. Local handlers now require
an `application/json` content type and a matching same-origin `Origin`, which blocks browser
cross-origin simple `text/plain` posts. This is not a shared per-client/provider limiter: non-browser
clients can supply headers, and the provider guard/coalescing remain instance-local. Therefore **do not
switch production traffic** until an owner-approved, free-tier-compatible shared abuse control is
selected and tested, and expected account-level Runtime Cache/provider usage is shown below the 70%
warning thresholds. If a sufficiently bounded control is unavailable without paid resources, hold the
cutover for another decision.

The homepage is also `force-dynamic` and can call the same provider/cache directly from validated
`lat`/`lon`/timezone share-link query parameters. That SSR entry path does not pass through the new
POST handler's Origin/content-type checks. Any approved shared abuse control and traffic projection
must cover both the public POST handlers and the homepage query path; otherwise the root URL remains a
cache-miss amplification path.

Vercel WAF rate limiting is active for PERF-002. The read-only Vercel CLI pricing lookup resolved the
current plan as Hobby and listed 1,000,000 allowed requests/month included; the internal 70% warning
is 700,000 requests/month. The CLI's current-period usage query returned no billing data and explicitly
warned this does not mean usage is zero. Before the change, the Atmos Firewall overview showed zero
Custom Rules; Team Usage reports 9.7K CDN requests against 1M over the last 30 days but no WAF-specific
meter, so this is only a coarse baseline. The published rule `PERF-002 public weather abuse guard`
matches `/` OR `/api/public/v1/weather/`, limits to 60 requests per 10 minutes per source IP, and
returns 429 on excess. Hobby counters are regional, and this feature is listed as regionally
usage-priced. Monitor usage after propagation; HOLD at 700,000 allowed requests/month and stop before
any charge/plan change. This is a per-source ingress bound, not a global provider quota.

Do not use Runtime Cache `get`/`set` as a distributed rate counter: its documented API has no atomic
increment/compare-and-set, and its regional, evictable records plus concurrent writers cannot enforce
a hard aggregate quota. The existing provider guard is also instance-local.
The implementation and rollout gates are recorded in
`docs/operations/perf-002-public-weather-abuse-control.md`.

No task may silently upgrade a paid plan. Azure credit exhaustion blocks Azure work; it never authorizes pay-as-you-go.

The dashboard AQI panel calls Open-Meteo only when expanded. Its Worker route shares the provider quota guard, coalesces concurrent misses, caches for five minutes, and retains a one-hour stale response. The quota guard is isolate-local, not a distributed counter; the free-tier limits remain the hard service boundary.

`FEAT-WX-002` expands dashboard forecast selections to 16 days with 42 requested
variables counted conservatively across the current/hourly/daily groups. It reserves
**5 weighted call units** per upstream dashboard request, rounded up from
`(42 / 10) × (16 / 14)`, rather than counting each HTTP fetch as one call.
This follows the [provider's weighting guidance](https://open-meteo.com/en/pricing)
for requests above ten variables or two weeks. Cache hits do not reserve new upstream
units. This remains conservative isolate-local accounting, not a guarantee about
aggregate vendor usage or provider billing. Geocoding and the existing eight-variable
current-AQI query continue to reserve one unit. Do not use load tests that bypass the
weather cache to measure CPU against the live provider.

`FEAT-AQI-TIMELINE-001` adds an explicit `view=timeline` AQI mode. Only the user's
forecast/history action requests it. The eight hourly variables plus eight current
variables over seven past-model days and five forecast days reserve **2 weighted units**
conservatively. Range and measurement changes reuse the downloaded timeline. Current
and timeline responses use separate canonical cache/in-flight keys, five-minute fresh
TTLs and one-hour stale retention. Requests cannot select unbounded date ranges. This
does not enable automatic history collection or persist user observations.

Grafana Cloud limits tracked for Atmos are 10,000 active metric series, 50 GB/month each for logs and traces, 100,000 API synthetic executions/month, and 10,000 browser synthetic executions/month.

SLO-001 uses four API checks, one Singapore public probe per check, and a 15-minute frequency. Grafana's 31-day monthly calculator projects 11,904 executions, or 11.904 percent of the API synthetic allowance.
