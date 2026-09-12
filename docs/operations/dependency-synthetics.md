# Dependency Synthetics

SLO-001 uses Grafana Cloud API synthetics as the external source of truth for the production frontend, Cloudflare edge, Supabase/Postgres dependency, and public weather path. These are availability checks, not traffic generated solely to prevent a Free project from pausing.

## Dependency Contract

`GET /health/dependencies` follows this fixed path:

```text
Grafana public probe -> Cloudflare Worker -> Supabase Edge Function -> PostgREST -> Postgres RPC
```

The Edge Function sends one three-second-bounded `GET` request to `public.atmos_dependency_health()`. The `STABLE SECURITY INVOKER` SQL function executes only `select true`, has default `PUBLIC` execution revoked, and grants execution only to `anon`. The request uses the hosted `SUPABASE_PUBLISHABLE_KEYS` default entry only in the `apikey` header, so no privileged secret is involved. No authorization header, row data, credential, SQL error, provider response, or topology leaves the Edge Function. Failure logs contain only a fixed reason, HTTP status, or error type.

The public response is always one of:

```json
{ "status": "ok", "database": "ok" }
```

```json
{ "status": "degraded", "database": "degraded" }
```

Degraded responses use HTTP 503. Both states use `Cache-Control: no-store` so every scheduled execution is a real dependency observation.

## Check Set

Keep exactly four enabled API checks in Grafana folder `Atmos` after the protected implementation reaches a zero-percent production candidate:

| ID     | Check                           | Request                                                                                                                             | Assertion                                |
| ------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `8192` | `Atmos production frontend`     | `GET https://rainify.dpdns.org/`                                                                                                    | status 200                               |
| `8193` | `Atmos production edge`         | `GET https://atmos-gateway.rainify.workers.dev/health`                                                                              | status 200 and `"status":"ok"`           |
| `8194` | `Atmos production dependencies` | `GET https://atmos-gateway.rainify.workers.dev/health/dependencies`                                                                 | status 200 and `"database":"ok"`         |
| `8198` | `Atmos production weather`      | `GET https://atmos-gateway.rainify.workers.dev/api/v1/weather/dashboard?lat=52.52&lon=13.405&timezone=Europe%2FBerlin&units=metric` | status 200 and `"provider":"open-meteo"` |

Use one available public probe and a 15-minute frequency for every check. Do not create browser checks, a private probe, an access token, an alert, another stack, or a paid feature in SLO-001. SLO-002 owns SLO objects and alerts.

Grafana's monthly calculator reports 2,976 executions per check and 11,904 for all four checks, 11.904 percent of the 100,000 Cloud Free API allowance. The calculator uses a 31-day month; the equivalent 30-day arithmetic is 11,520. Stop before enabling if projected usage reaches the 70 percent warning threshold.

## Dashboard

Dashboard `atmos-synthetics` in folder `Atmos` visualizes availability, execution counters, HTTP status, probe duration, and TLS certificate lifetime from the `grafanacloud-prom` data source. Its reproducible Grafana HTTP API payload is `docs/operations/atmos-synthetics-dashboard.json`.

Apply the payload only with the existing locally supplied `GRAFANA_URL` and `GRAFANA_SERVICE_ACCOUNT_TOKEN`. Never print or commit the token. Grafana stores the dashboard as a `dashboard.grafana.app/v2beta1` resource and performs the Classic-to-V2 schema conversion; read the stored resource back after each update rather than hand-authoring unvalidated V2 panel kinds.

## Release Gate

During REL-004, keep the previous stable available for rollback and target the candidate explicitly until promotion completes. After the candidate reaches 100 percent, remove the override and use the dependency check as an ordinary production-path monitor. A failed or missing synthetic is `FAIL` or `INSUFFICIENT_DATA`; it never authorizes candidate traffic. WAE and external synthetic evidence must both pass before each REL-004 promotion step.

Capture check names, IDs, probe, frequency, enabled state, latest successful execution time, and non-sensitive assertions in `docs/evidence/slo-001/2026-09-12.md`. Never record headers containing credentials; the Cloudflare version override is a non-secret immutable deployment identifier.
