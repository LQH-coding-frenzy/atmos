# Azure Job Failure

## Summary

Use this runbook only after an Atmos Azure Container Apps Job is deployed. The Azure lane is currently inactive and must not be treated as a production dependency.

## User impact

Future backup, restore-verification, historical backfill, or export work may be delayed; the core Vercel/Worker/Supabase request path should remain available.

## Detection

After activation, detect nonzero job execution state, timeout, retry exhaustion, or missing expected completion telemetry. Before activation, any claimed Atmos Azure job alert is configuration drift.

## Relevant dashboards/logs

Use the exact Container Apps Job execution, Azure Log Analytics/native logs, immutable GHCR digest, and future OBS-005 evidence. No production Azure dashboard currently exists.

## Immediate mitigation

Do not create or keep an always-on replica. Stop dependent destructive/backup operations and preserve the failed execution without rerunning with production credentials.

## Diagnosis

After activation, verify job name, execution parameters, managed identity/OIDC, exact signed digest, resource limits, external dependency state, and student-credit balance.

## Recovery

Recovery requires completion of `AZ-001`, `AZ-IAC-001`, `CTR-003`, and the owning job task. Test the exact digest with staging parameters before a protected production rerun.

## Rollback

Restore the prior immutable signed digest/job revision through Terraform or the Git-owned deployment path; never deploy `latest` or rebuild between environments.

## Security considerations

Use OIDC/managed identity, not Azure client secrets. Never print database or R2 credentials, weaken signature verification, or make a container public to debug it.

## Escalation

Stop for absent Azure for Students guardrails, depleted credit, signature failure, required secret creation, destructive parameters, or unavailable rollback digest.

## Evidence to preserve

Preserve execution ID/time/state, source SHA, exact digest and signature verification, sanitized logs, parameters without secrets, cost impact, and recovery result.

## Post-incident follow-up

Run GAME-007 after activation, add a regression/timeout control, and update this runbook with deployed resource identifiers from Git-owned evidence.
