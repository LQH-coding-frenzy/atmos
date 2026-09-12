# Supabase Project Paused

## Summary

Use this runbook when the Free production Supabase project is paused or unavailable after inactivity or a platform event.

## User impact

Dependency health returns 503 and authenticated/database-backed features fail; cached public weather may remain available.

## Detection

Confirm `Atmos production dependencies` failure and `GET /health/dependencies` returning 503. Check Supabase project state and status communications.

## Relevant dashboards/logs

Use the Grafana synthetic dashboard, Supabase project/function logs, PostgREST health, and `docs/operations/dependency-synthetics.md`.

## Immediate mitigation

Stop releases and preserve cached public weather. An account owner may restore the existing project through Supabase's supported control plane; do not create replacement projects or fake keep-alive traffic.

## Diagnosis

Distinguish a paused project from function failure, bad key configuration, migration failure, quota enforcement, or broad Supabase outage.

## Recovery

After the project is active, require the real database RPC path to return `{ "status": "ok", "database": "ok" }` and wait for a fresh successful synthetic.

## Rollback

There is no code rollback for a provider pause. If a recent deployment caused failure, restore its known-good Worker/function only after project availability returns.

## Security considerations

Do not expose the database URL or privileged key, relax RLS, or replace the publishable-key health check with privileged access.

## Escalation

Escalate if restore is unavailable, data appears missing, project limits changed, or recovery would require a paid plan or a new project.

## Evidence to preserve

Preserve provider state/status timestamps, synthetic history, sanitized health responses, owner action, and first successful database-backed check.

## Post-incident follow-up

Record downtime and accepted Free-plan risk; keep dependency monitoring genuine and do not generate traffic solely to evade pausing.
