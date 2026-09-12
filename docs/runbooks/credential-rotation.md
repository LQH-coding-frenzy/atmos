# Credential Rotation

## Summary

Use this runbook for scheduled expiry or suspected compromise of Cloudflare, Vercel, Supabase, Grafana, R2, provider, or future Azure external credentials.

## User impact

Poorly sequenced rotation can break deployments, telemetry, functions, queues, backups, or the frontend; compromise may permit unauthorized control-plane access.

## Detection

Start from an expiry alert, provider warning, audit anomaly, secret-scan finding, owner request, or incident determination. Never test a credential by printing it.

## Relevant dashboards/logs

Use provider audit logs, GitHub environment history, function/Worker deployment state, affected health/synthetics, and documented expiry metadata such as `docs/operations/wae-release-gate.md`.

## Immediate mitigation

For suspected compromise, stop affected deployments and preserve audit logs. Secret creation, rotation, or revocation always requires explicit owner approval.

## Diagnosis

Identify credential owner, exact scope, stores/consumers, expiry, last use, blast radius, rollback credential, and whether source or logs exposed it.

## Recovery

Create the least-privilege replacement in the provider, update each approved secret store without logging values, validate consumers, then revoke the old credential.

## Rollback

Before revocation, restore the old still-valid credential only if it is not compromised. After compromise/revocation, fix forward with a newly approved credential.

## Security considerations

Never place values in Git, command arguments, issue text, evidence, screenshots, shell history, browser code, or shared logs. Prefer OIDC where supported.

## Escalation

Escalate for compromise, unknown consumers, broad administrator scope, failed validation, unavailable rollback, billing impact, or rotation of encryption/database recovery keys.

## Evidence to preserve

Record only credential type, redacted identifier, scope, stores updated, UTC create/validate/revoke times, approver, audit events, and health checks.

## Post-incident follow-up

Update expiry tracking and rotation procedure, reduce scope/lifetime, scan for exposure, and perform one representative rotation test as required by the master plan.
