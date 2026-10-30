# PERF-002 Public Weather Abuse-Control Plan

## Status

Production WAF guard published 2026-10-30 after explicit owner approval. A read-only Vercel CLI
pricing lookup resolved the current plan as Hobby and listed `Firewall Rate Limit Requests` with
1,000,000 allowed requests/month included. The current-period `vercel usage` query returned no billing
data; Vercel explicitly says this does not imply zero usage. Before configuration, the Atmos Firewall
overview showed `Custom Rules 0`; Team Usage showed 9.7K CDN requests against 1M over the last 30 days,
but no WAF-specific meter. This is a broad baseline, not an exact WAF allowance reading. The rule is
active; application production propagation and WAF behavior testing remain pending. This plan does not
authorize paid usage beyond the Hobby included allowance.

## Scope

The control must cover every anonymous entry point that can invoke expanded weather/AQI provider work:

- `GET /` — the dynamic homepage can call the Vercel provider/cache using `lat`, `lon`, and `timezone`
  share-link query parameters.
- `POST /api/public/v1/weather/dashboard`
- `POST /api/public/v1/weather/air-quality`

The public POST handlers also enforce `application/json` and matching same-origin `Origin` before body
processing. That is a browser cross-site request defense, not a rate limit: non-browser clients can
supply headers. The local in-flight maps and `OpenMeteoUsageGuard` are process/instance-local.

Do not include the retained authenticated/compatibility `/api/v1/weather/*` transform paths or the
separate Cloudflare Worker hostname in this public-page rule. The Worker path remains available for
rollback and is governed by its existing controls.

## Applied production control — Vercel WAF

One Vercel WAF Rate Limiting custom rule is configured on the `atmos` project:

- Match request path `/` **OR** paths beginning `/api/public/v1/weather/`. The root path is included
  because SSR runs before browser API calls; matching only the POST handlers would leave the share-link
  path uncovered.
- Use the IP address key with a fixed 600-second window and a limit of **60 requests** for the combined
  paths. The last-30-day team total was 9.7K CDN requests across projects; this is only a coarse
  baseline and the threshold must be reviewed against Vercel firewall metrics after rollout.
- The action is `Too Many Requests (429)`. Because one Hobby rule is
  shared by `/` and both POST paths, it uses one threshold for the combined request set and may affect
  ordinary page navigation as well as API calls.
- No `@vercel/firewall` SDK integration is proposed initially. A WAF edge rule can cover both a Route
  Handler and the Server Component homepage before either invokes the cache/provider; an SDK check in
  each handler alone would miss the homepage path. If edge-rule matching cannot cover both paths, stop
  for a design decision rather than silently protecting only the APIs.

### Known limitations and cost gate

- Vercel documents rate-limit counters as **per-region**. Requests from the same IP can exceed a
  configured limit across regions; distributed clients also have separate source keys. This is a
  per-source ingress brake, not a global Open-Meteo weighted-call quota.
- Vercel lists rate limiting as regionally usage-priced; the authenticated pricing lookup reports
  1,000,000 allowed requests/month included on this Hobby plan. Before publication, no custom WAF
  rules were active on `atmos`. Current WAF-specific utilization could not be
  retrieved: `vercel usage` reported billing data unavailable for 2026-10-01 through 2026-10-30 and
  warned this is not equivalent to zero usage. The internal 70% warning is 700,000 allowed requests
  per month. The Team Usage view showed no distinct WAF Rate Limit Requests meter; its 9.7K CDN request
  total is not a direct WAF usage measurement. The Atmos Firewall overview showed zero Custom Rules and
  no displayed rate-limited events in its selected recent window, but this does not establish
  historical month-to-date usage. Stay under the 700,000 internal warning and stop if usage approaches
  the included allowance or any charge/plan change could occur.
- Runtime Cache `get`/`set`/`delete` exposes no documented atomic increment/compare-and-set. Region-local
  eviction and concurrent writers make it unsuitable as a strict distributed counter.
- The existing provider quota guard is isolate-local. A WAF limit cannot guarantee the shared
  Open-Meteo 600/minute, 5,000/hour, 10,000/day, or 300,000/month limits across regions and consumers.
  Maintain the existing 70% review thresholds and do not claim a global quota guarantee.

## Release gates and remaining verification

1. **Owner decision:** production WAF configuration and route propagation were explicitly authorized
   on 2026-10-30 after disclosing the usage meter and per-region limitations; the rule is active.
2. **Usage/rule slot:** before publication, Atmos showed zero Custom Rules. Team Usage showed 9.7K CDN
   requests over 30 days, but no WAF-specific meter. Keep the 70% HOLD threshold (700,000 allowed
   requests/month), monitor after propagation, and disable the rule if usage or billing approaches the
   included limit.
3. **Normal-traffic baseline:** the 9.7K team CDN total is a coarse baseline, not route-specific. The
   selected 60-per-10-minute/IP limit is provisional and should be reviewed against Vercel Firewall
   metrics after propagation. Do not use a high-volume probe to manufacture samples.
4. **Path and behavior test:** the published rule matches `/` OR `/api/public/v1/weather/` and excludes
   compatibility Worker-to-Next routes. The saved configuration is verified as a 600-second fixed
   window, 60 requests, IP key, and 429 action. The actual 429 threshold behavior has not been
   load-tested. Verify route behavior with a bounded provider-safe smoke; do not generate extra
   provider traffic to test the limiter.
5. **Residual-risk acceptance:** WAF limits are per-region/per-IP and do not enforce a strict
   account-wide monthly provider quota. If a hard aggregate limit is required, this remains insufficient
   and the cutover must HOLD absent another approved solution.
6. **Production record:** WAF changes apply immediately without an app redeploy. Preserve the exact
   rule, region/usage observation, threshold, test result, and rollback decision without request PII.

## Rollback

If the approved rule blocks normal traffic or behaves unexpectedly, disable/remove that WAF rule using
the same owner-approved change process. This restores the previous unthrottled edge behavior; it does
not roll back the application routes or Worker. Keep the production route cutover on HOLD until a
safe abuse-control decision is made.

## References

- [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)
- [Vercel WAF usage and pricing](https://vercel.com/docs/vercel-firewall/vercel-waf/usage-and-pricing)
- [Vercel WAF custom rules](https://vercel.com/docs/vercel-firewall/vercel-waf/custom-rules)
- [Vercel WAF rule conditions](https://vercel.com/docs/vercel-firewall/vercel-waf/rule-configuration)
- [Vercel Runtime Cache](https://vercel.com/docs/caching/runtime-cache)
- [Vercel CLI pricing](https://vercel.com/docs/cli/pricing)
- [Vercel CLI usage](https://vercel.com/docs/cli/usage)
- `docs/cost/quota-budget.md`
- `docs/adr/0005-public-weather-runtime-placement.md`
