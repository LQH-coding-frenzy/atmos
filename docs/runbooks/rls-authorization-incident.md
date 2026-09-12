# RLS Authorization Incident

## Summary

Use this runbook for suspected cross-user access, unauthorized mutation, policy bypass, or excessive database grants.

## User impact

User profiles, saved locations, alerts, or notification state may be disclosed or modified across authorization boundaries.

## Detection

Treat a failed cross-user deny test, user report, anomalous access, or unexpected authenticated API response as a security incident.

## Relevant dashboards/logs

Use Supabase audit/function logs, request IDs, migration history, protected API logs, and `docs/evidence/game-003/2026-09-09.md` without exporting row contents.

## Immediate mitigation

Stop deployments and affected writes. Revoke or disable the narrow exposed path through a reviewed additive security migration or application release; do not destroy evidence.

## Diagnosis

Identify affected table, operation, roles, JWT subject conditions, grants, policies, and `SECURITY DEFINER` functions. Reproduce locally with owner and cross-user identities.

## Recovery

Ship a migration with explicit allow and deny pgTAP coverage, run `supabase db reset` and `corepack pnpm test:db`, review dry-run SQL, then deploy with owner approval.

## Rollback

Prefer a forward security fix. Roll back application traffic only if the prior version is schema-compatible and does not restore the vulnerability.

## Security considerations

Do not inspect unrelated user data, paste tokens/rows into issues, weaken RLS for diagnosis, or use destructive SQL without fresh backup and approval.

## Escalation

Escalate immediately to the owner/security reviewer for confirmed or plausible data exposure, privileged-key misuse, or uncertain affected scope.

## Evidence to preserve

Preserve UTC timeline, commit/migration IDs, policy definitions, sanitized request metadata, negative-test output, affected data categories, and containment action.

## Post-incident follow-up

Complete impact assessment and credential review, add regression/abuse cases, document notification obligations, and publish a blameless postmortem.
