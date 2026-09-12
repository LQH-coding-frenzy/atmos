# High API Error Rate

## Summary

Use this runbook when the public weather SLO burns because Worker requests return elevated 5xx responses.

## User impact

Weather data, dependency health, or API-backed features may fail; the frontend may show unavailable or stale data.

## Detection

Confirm a Grafana availability burn alert or failed `Atmos production weather`/`Atmos production edge` synthetic. Treat a missing or stale sample as insufficient data, not health.

## Relevant dashboards/logs

Use the Grafana synthetic and availability SLO dashboards, Cloudflare Worker logs, and exact-release rows in `atmos_worker_requests`. Correlate by UTC window, `release_id`, Worker version, route group, and safe `request_id`.

## Immediate mitigation

Stop promotion. If errors began with a Worker release, deploy the retained stable Worker version alone at 100 percent as documented in `docs/operations/production-worker-canary.md`.

## Diagnosis

Separate edge 5xx from provider failures, Supabase dependency failures, and client 4xx. Compare candidate and stable WAE error rates and inspect sanitized Worker events without recording payloads.

## Recovery

Restore the failed dependency or deploy a protected forward fix, then require `/health`, `/health/dependencies`, weather smoke, fresh synthetics, and a healthy burn-alert evaluation.

## Rollback

Keep the compatible database expansion and retained Supabase functions. Roll back only the Worker/frontend release implicated by evidence; never apply a destructive schema rollback.

## Security considerations

Do not disable authorization, RLS, TLS, CSP, rate limits, or scanners to reduce errors. Do not expose upstream details in client responses.

## Escalation

Escalate immediately for suspected data exposure, cross-user access, credential failure, sustained SLO burn after rollback, or no known-good release.

## Evidence to preserve

Preserve alert timestamps, synthetic results, WAE query/result, deployment and release IDs, sanitized logs, mitigation time, and post-recovery checks.

## Post-incident follow-up

Tune tests or alerts only from measured evidence, document error-budget impact, and create a corrective backlog item before closing.
