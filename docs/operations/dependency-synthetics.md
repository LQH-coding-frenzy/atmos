# Dependency Synthetics

SLO-001 uses Grafana Cloud API synthetics as the external source of truth for the production frontend, Cloudflare edge, Supabase/Postgres dependency, and public weather path. These are availability checks, not traffic generated solely to prevent a Free project from pausing.

## Dependency Contract

`GET /health/dependencies` follows this fixed path:

```text
Grafana public probe -> Cloudflare Worker -> Supabase Edge Function -> PostgREST -> public.profiles
```

The Edge Function sends one three-second-bounded `GET` request for at most one `profiles.id` and discards the response body. It uses the hosted `SUPABASE_SECRET_KEYS` default entry only in the `apikey` header. No authorization header, row body, database result, credential, SQL error, provider response, or topology leaves the Edge Function. Failure logs contain only a fixed reason, HTTP status, or error type.

The public response is always one of:

```json
{ "status": "ok", "database": "ok" }
```

```json
{ "status": "degraded", "database": "degraded" }
```

Degraded responses use HTTP 503. Both states use `Cache-Control: no-store` so every scheduled execution is a real dependency observation.

## Check Set

Create exactly four API checks in Grafana folder `Atmos` after the protected implementation reaches a zero-percent production candidate:

| Check                          | Request                                                                                                                             | Assertion                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `Atmos production frontend`    | `GET https://rainify.dpdns.org/`                                                                                                    | status 200                               |
| `Atmos production edge`        | `GET https://atmos-gateway.rainify.workers.dev/health`                                                                              | status 200 and `"status":"ok"`           |
| `Atmos candidate dependencies` | `GET https://atmos-gateway.rainify.workers.dev/health/dependencies` with the exact non-secret Cloudflare version-override header    | status 200 and `"database":"ok"`         |
| `Atmos production weather`     | `GET https://atmos-gateway.rainify.workers.dev/api/v1/weather/dashboard?lat=52.52&lon=13.405&timezone=Europe%2FBerlin&units=metric` | status 200 and `"provider":"open-meteo"` |

Use one available public probe and a 15-minute frequency for every check. Do not create browser checks, a private probe, an access token, an alert, another stack, or a paid feature in SLO-001. SLO-002 owns SLO objects and alerts.

The four-check plan projects 11,520 one-minute API executions in a 30-day month, 11.52 percent of the 100,000 Cloud Free API allowance. Stop before enabling if the Grafana UI calculator disagrees or projected usage reaches the 70 percent warning threshold.

## Release Gate

Keep production stable at 100 percent and the new candidate at zero percent. The dependency check targets the candidate explicitly until REL-004 completes promotion. A failed or missing synthetic is `FAIL` or `INSUFFICIENT_DATA`; it never authorizes candidate traffic. WAE and external synthetic evidence must both pass before each REL-004 promotion step.

Capture check names, IDs, probe, frequency, enabled state, latest successful execution time, and non-sensitive assertions in `docs/evidence/slo-001/2026-09-12.md`. Never record headers containing credentials; the Cloudflare version override is a non-secret immutable deployment identifier.
