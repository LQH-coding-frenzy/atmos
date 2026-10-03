# ADR 0003: Worker version affinity key

## Status

Accepted by the owner on 2026-09-30 as the REL-005 production-hardening task.

## Context

Cloudflare gradual deployments can route sequential requests from one browser session to different Worker versions unless the request carries a stable version key. The production API custom hostname `api.rainify.dpdns.org` is active and zone-controlled; the application still used the `workers.dev` hostname and no request-header Transform Rule existed.

## Decision

- Production browser API calls use `https://api.rainify.dpdns.org`; the initial server-rendered weather request stays on the stable `workers.dev` hostname because it has no tab-scoped key.
- The browser creates a random UUIDv4 and stores it in `sessionStorage` under `atmos_version_key` for the current tab session.
- Browser calls send the same value in `X-Atmos-Version-Key` and `Cloudflare-Workers-Version-Key`. The Worker permits both in CORS preflight but does not use either for identity, authorization, or upstream forwarding.
- A zone-scoped Cloudflare Request Header Transform Rule remains on `http_request_late_transform` for `api.rainify.dpdns.org`, mapping a non-empty custom header to `Cloudflare-Workers-Version-Key` for clients that send only `X-Atmos-Version-Key`. The browser also sends the platform header directly so it is available at version assignment time. The client creates UUIDv4 values; Cloudflare only checks presence, keeping the rule within the Free plan.
- Requests with no usable key continue through the ordinary unkeyed routing path.

## Alternatives considered

- **Cookie:** would also work but creates persistent cross-subdomain browser state and extra cookie-scope behavior; the explicit CORS header is narrower and easier to test.
- **IP affinity:** rejected because shared/NAT addresses do not identify one browser session and can group unrelated users.
- **Workers `workers.dev` hostname:** cannot apply the zone Transform Rule, so production browser calls use the existing custom API hostname.

## Consequences

- The first server-rendered dashboard request is unkeyed and uses `workers.dev`; browser requests after hydration use the custom API hostname and reuse the session key for the tab's multi-request flow.
- CORS preflight must permit both version-key headers only for the configured frontend origin.
- The key is random routing state only. It is not logged, stored server-side, or included in telemetry attributes.
- Rollback removes the Transform Rule and reverts the frontend API origin/CORS configuration; the existing custom hostname remains intact.
