# Supabase Function Failure

## Summary

Use this runbook when a versioned Supabase Edge Function fails while the Worker and project database remain reachable.

## User impact

Protected API proxy routes and database-backed features may fail; public cached weather can remain healthy.

## Detection

Confirm function errors/timeouts in Supabase logs, Worker proxy 5xx, or a failed dependency synthetic with an active project.

## Relevant dashboards/logs

Use Supabase function logs, Worker request IDs, `/version`, WAE backend-release metadata, and `docs/operations/versioned-supabase-functions.md`.

## Immediate mitigation

Stop promotion. Restore a Worker version that references the retained known-good function name; do not overwrite or delete immutable function releases.

## Diagnosis

Compare exact function/release IDs, health/version responses, environment configuration presence, migration compatibility, and sanitized error type.

## Recovery

Deploy a new protected versioned function from an exact Git commit, smoke `/health` and `/version`, then release a compatible Worker through the normal canary path.

## Rollback

Return traffic to the prior Worker/function pair and retain additive schema. Never contract the database during incident rollback.

## Security considerations

Do not print function secrets or JWTs, disable JWT handling, use a privileged database key in the browser, or weaken RLS.

## Escalation

Escalate for secret/configuration loss, cross-user behavior, incompatible schema, no retained function, or broad Supabase runtime outage.

## Evidence to preserve

Preserve function and Worker IDs, release IDs, request IDs, sanitized logs, deployment source SHA, smoke results, and mitigation timing.

## Post-incident follow-up

Add a regression test, update function retention/cleanup guards, and document any configuration contract discovered.
