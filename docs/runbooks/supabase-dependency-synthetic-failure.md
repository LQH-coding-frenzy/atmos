# Supabase Dependency Synthetic Failure

## Summary

Use this runbook when `Atmos production dependencies` cannot complete Worker to Edge Function to PostgREST to Postgres RPC.

## User impact

Database-backed and authenticated features may fail even while the frontend, edge health, and cached weather remain available.

## Detection

Confirm a fresh failed synthetic or `GET /health/dependencies` returning 503 with the fixed degraded envelope. Missing samples are insufficient data.

## Relevant dashboards/logs

Use the Grafana synthetic dashboard, availability SLO, Worker and Supabase function logs, project state, and `docs/operations/dependency-synthetics.md`.

## Immediate mitigation

Stop backend releases. Check the frontend, edge, and weather synthetics separately, then preserve cached service while isolating the failed dependency hop.

## Diagnosis

Test the public health route once and correlate request ID. Distinguish project pause, function failure, PostgREST/database outage, missing publishable-key configuration, and RPC/grant regression.

## Recovery

Restore the existing dependency or deploy a reviewed compatible fix. Require HTTP 200 with `{ "status": "ok", "database": "ok" }` and a fresh scheduled success.

## Rollback

Restore the prior Worker/function pair for release regressions; preserve additive migration state and the least-privilege health RPC.

## Security considerations

Never replace the publishable-key probe with a privileged key, expose SQL/provider errors, broaden RPC grants, or cache the health response.

## Escalation

Escalate for project pause, data loss suspicion, grant/RLS changes, prolonged provider outage, or failure after rollback.

## Evidence to preserve

Preserve check ID/time/probe, sanitized response, request ID, project/function state, release IDs, logs without payloads, and recovery sample.

## Post-incident follow-up

Add the missing hop-specific test, update dependency risk, and review alert routing once an external receiver is approved.
