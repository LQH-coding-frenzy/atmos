# ADR 0005: Public weather and AQI runtime placement

## Status

Accepted by the owner on 2026-10-30 for the public weather/AQI runtime-placement and PERF-002
acceptance change only. Implementation and production changes require separate approval.

## Context

PERF-002 keeps a 7 ms Worker CPU p95 safety gate. The most recent fully sampled candidate measured
`7.471 ms` p95, above that gate. A later candidate remained at 0%; its first bounded weather miss
returned HTTP 503 and the test stopped without a retry. Its CPU result is therefore insufficient.

Expanded weather normalization and cache-variant serialization have already moved to the existing
Next.js runtime. The Worker still owns cache lookup/freshness, response framing, cache writes, CORS,
security headers, correlation, and analytics for these public routes. Continued small Worker
optimizations have not yet demonstrated a passing exact-version CPU result.

Atmos is maintained as a CV-first showcase, not a continuously operated production service. The
showcase already uses Next.js on Vercel and Cloudflare Workers for edge routing. The goal is a clear,
measured runtime-placement decision without paid resources or a loss of the Worker gateway role.

## Decision

1. Move **first-party public dashboard and AQI requests** from the Worker weather handlers to
   dedicated same-origin Next.js Route Handlers on `rainify.dpdns.org`.
2. Keep the Cloudflare Worker for authenticated API proxying, health/version, CORS/security, request
   correlation, analytics, and any other lightweight edge routes. Do not bypass the Worker for the
   entire API.
3. Use bounded `POST` JSON inputs for public weather/AQI API calls. Enforce the existing strict input
   schemas and body-size limit, keep coordinates out of API fetch URLs and logs, and keep provider
   access and any future provider credentials server-only. The existing root-page share-link query
   path must be included in abuse controls because it can initiate server-side provider work.
4. Preserve the existing public `Dashboard`/`AirQuality` JSON contracts, including
   `meta.cached`/`meta.stale`, five-minute freshness, and at most one-hour stale fallback on provider
   failure. Use Next's server cache for the normalized response, not only the upstream provider
   fetch. The cache design must be proven on the pinned Next.js/Vercel runtime before cutover.
5. Keep the current Worker weather path available during an additive compatibility window. Deprecate
   it only after the frontend, synthetic checks, and documented consumers have moved and a rollback
   path is verified.

## Cache and provider constraints

- The existing `weather-runtime.ts` uses Next.js server-side `fetch` with `force-cache` and a
  300-second revalidation interval for upstream provider GETs. That protects provider calls but does
  not, by itself, prove that the normalized Route Handler response or its cache metadata is cached.
- Next.js POST Route Handlers are not cached by default. Public Route Handlers will therefore use the
  existing platform's Vercel Runtime Cache API directly, keyed by normalized input, rather than
  assuming Route Handler or upstream `fetch` caching also caches a normalized response.
- The Runtime Cache API provides explicit `get`/`set` TTLs, which lets the route preserve exact
  five-minute freshness, one-hour stale fallback, and `meta.cached`/`meta.stale` semantics without
  enabling Cache Components globally or using the deprecated `unstable_cache` API.
- Vercel documents Runtime Cache on all plans, with Hobby allowances of 1,000,000 reads and 200,000
  writes per month shared across the team. The design must project and monitor usage within those
  included allowances; stop before overage or any plan upgrade. The regional cache is ephemeral and
  may evict entries early, so a cache miss still must be safe and provider-weighted usage bounded.
- Store the normalized result plus a generation timestamp. On a cache hit younger than 300 seconds,
  return it as cached/fresh; on an older entry, attempt the provider and refresh the record on
  success; on provider failure, return the record as cached/stale only while it is at most 3,600
  seconds old. Older/missing entries fail closed with a sanitized 503. This avoids depending on
  implicit stale-while-revalidate behavior for response metadata.
- Test cold, fresh-hit, stale-if-error, hard expiry, concurrent requests, cross-instance cache
  persistence, provider call counts, and cache-backend failures. If Next/Vercel cannot preserve these
  semantics and the weighted-call budget on the existing plan, stop and return for another decision.
- Before release, project monthly Runtime Cache reads/writes and Open-Meteo weighted calls against
  expected traffic; stop before the included allowance or provider budget would be exceeded. Do not
  add Redis, a paid plan, another vendor, or weaken the public response contract to force the cutover
  through.
- The new routes are anonymous, so review cache-miss amplification and approve bounded abuse/provider
  budget controls before production traffic is switched. Local handlers now require an
  `application/json` content-type and a matching same-origin `Origin`, which blocks browser
  cross-origin simple `text/plain` posts. This is not a shared per-client/provider limiter: non-browser
  clients can supply headers, and the provider quota guard and in-flight coalescing remain per
  process/instance, not global. In addition, the dynamic homepage can call the provider/cache from
  validated `lat`/`lon`/timezone share-link query parameters without passing through the POST checks.
  Project shared Vercel cache and Open-Meteo usage below their 70% warning thresholds and approve/test
  a free-tier-compatible shared abuse control covering both entry paths before release. If a
  sufficiently bounded control cannot be provided within existing free-tier constraints, hold the
  cutover for an owner decision.
- A Vercel WAF rate-limit rule was published after explicit owner approval on 2026-10-30. Hobby docs
  list one rule/project, IP/JA4 keys, fixed 10-second to 10-minute windows, and 1,000,000 included
  allowed requests. The active rule `PERF-002 public weather abuse guard` matches `/` OR
  `/api/public/v1/weather/`, allows 60 requests per 10 minutes per source IP, and returns 429 on
  excess. Counters are per-region, while WAF rate limiting is listed as regionally usage-priced. A
  read-only CLI lookup resolved Hobby and the included allowance, but current-period billing usage was
  unavailable and is not known to be zero. The Atmos Firewall overview had no custom rules before
  publication; Team Usage showed 9.7K CDN requests/1M over 30 days but no distinct WAF meter. Maintain
  the 700,000/month (70%) HOLD threshold; this rule is not a global provider-quota guarantee.
- Runtime Cache is not a suitable distributed quota counter: the documented `get`/`set`/`delete` API
  exposes no atomic counter operation, and region-local eviction/concurrent writers prevent a hard
  aggregate limit. The provider usage guard is likewise process-local.
- The Vercel WAF rule, cost/usage gates, non-production test conditions, and rollback are recorded in
  `docs/operations/perf-002-public-weather-abuse-control.md`. The rule was separately published with
  explicit owner approval; application production propagation remains pending.

## Alternatives considered

- **Continue moving small pieces out of the Worker:** rejected as the primary strategy after several
  iterations and an exact candidate p95 still above 7 ms. Further edits need to demonstrate a
  meaningful reduction rather than repeat speculative micro-optimizations.
- **Raise the CPU limit or adopt Workers Paid:** rejected; the 7 ms threshold and Free-tier constraint
  remain unchanged.
- **Route the entire application API around Cloudflare:** rejected; it would weaken the existing
  edge-gateway, version-affinity, CORS/security, and release-engineering demonstration.
- **Move public weather to Supabase Edge Functions or Azure:** not preferred for this CV-showcase
  slice; Next.js/Vercel is already an approved runtime and the weather path is not database-heavy.

## CV-first assessment

This proposal does **not** compromise the CV-first approach if limited to public weather/AQI. It can
strengthen the portfolio narrative: measured free-tier CPU drove an explicit placement decision;
Cloudflare remains a real, protected gateway for authenticated APIs and edge controls; and no paid
service or threshold exception is introduced. Bypassing Cloudflare for the full API would weaken that
narrative and is not proposed.

The tradeoff must be explicit in the README/architecture materials: first-party weather/AQI is served
by the Vercel server runtime, while authenticated APIs continue through the Worker to Supabase.

## Acceptance and release controls

- This decision changes the location of the PERF-002 route. The Section 29 primary output is updated
  to require (a) first-party public weather/AQI execution on Vercel with contract/cache/stale/provider
  budget evidence, and (b) an exact-version CPU p95 at or below 7 ms for the remaining Worker traffic.
  Zero samples for a retired Worker route are not a CPU pass.
- Add contract, cache/stale, privacy, security, provider-budget, and browser tests before changing the
  frontend path. Keep the authenticated API calls on the existing Worker hostname and preserve their
  version-affinity behavior; public weather/AQI calls use same-origin Next handlers and do not need a
  Worker version key.
- Release the Next.js routes additively, smoke the exact deployment, then switch only the weather/AQI
  frontend calls. Keep the stable Worker at 100% and retain its version for rollback. Any later Worker
  route retirement or traffic change requires its own protected approval.
- Update the Grafana weather synthetic to check the new same-origin route while retaining the edge
  synthetic on the Worker. No synthetic probes may be created merely to inflate Worker samples.

## References

- `docs/architecture/atmos-devsecops-master-plan.md` Sections 0.5, 6, and 29 (especially PERF-002)
- `docs/runbooks/worker-cpu-limit.md`
- `docs/operations/production-worker-canary.md`
- [Next.js server-side `fetch` cache and revalidation](https://nextjs.org/docs/app/api-reference/functions/fetch)
- [Next.js `cacheLife`](https://nextjs.org/docs/app/api-reference/functions/cacheLife)
- [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)
- [Vercel WAF usage and pricing](https://vercel.com/docs/vercel-firewall/vercel-waf/usage-and-pricing)
- [Vercel Runtime Cache](https://vercel.com/docs/caching/runtime-cache)
- [Vercel CLI pricing](https://vercel.com/docs/cli/pricing)
- [Vercel CLI usage](https://vercel.com/docs/cli/usage)
