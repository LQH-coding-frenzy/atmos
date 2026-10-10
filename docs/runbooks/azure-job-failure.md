# Azure Job Failure

## Summary

Use this runbook after an Atmos Azure Container Apps Job is deployed. The backup Job is manual-only and is not part of the core application request path.

## GAME-007 controlled failure test

The proposed GAME-007 test uses a separate temporary Terraform-managed Job named `atmos-backup-failure-test`. It reuses the already verified immutable backup image but overrides the entrypoint with a bounded shell command that prints one non-sensitive marker, waits 10 seconds, and exits with status 42. The test Job has no database/R2 secret blocks, is manual-only, has one replica, zero retries, and a 60-second timeout. It does not invoke `/usr/local/bin/backup` and must not contact Supabase or R2.

Keep `enable_game_007_failure_test` false by default. Enabling it for a speculative plan is not apply/run approval. Before any apply or execution, obtain a fresh student-credit balance and separate owner approval for the exact plan and the intentional failure run. Capture the console marker while the execution is active because this environment does not persist logs. After evidence capture, remove only the temporary test Job through a reviewed Terraform plan; preserve `atmos-backup-job-prod`, both environments, the ACI, and all R2 objects.

This test validates Container Apps failure reporting and no-retry behavior. It does not test a failure inside the backup pipeline or justify using production database/R2 credentials for fault injection.

## User impact

Future backup, restore-verification, historical backfill, or export work may be delayed; the core Vercel/Worker/Supabase request path should remain available.

## Detection

After activation, detect nonzero job execution state, timeout, retry exhaustion, or missing expected completion telemetry. Before activation, any claimed Atmos Azure job alert is configuration drift.

## Relevant dashboards/logs

Use the exact Container Apps Job execution, streamed console output before replica cleanup, immutable GHCR digest, and future OBS-005 evidence. No production Azure dashboard currently exists.

## Immediate mitigation

Do not create or keep an always-on replica. Stop dependent destructive/backup operations and preserve the failed execution without rerunning with production credentials.

## Diagnosis

After activation, verify job name, execution parameters, managed identity/OIDC, exact signed digest, resource limits, external dependency state, and student-credit balance.

## Recovery

Recovery requires completion of `AZ-001`, `AZ-IAC-001`, `CTR-003`, and the owning job task. Test the exact digest with staging parameters before a protected production rerun.

## Rollback

For GAME-007, remove only the temporary failure-test Job through Terraform. For a real backup Job regression, restore the prior immutable signed digest/job revision through Terraform or the Git-owned deployment path; never deploy `latest` or rebuild between environments.

## Security considerations

Use OIDC/managed identity, not Azure client secrets. Never print database or R2 credentials, weaken signature verification, or make a container public to debug it.

## Escalation

Stop for absent Azure for Students guardrails, depleted credit, signature failure, required secret creation, destructive parameters, or unavailable rollback digest.

## Evidence to preserve

Preserve execution ID/time/state, source SHA, exact digest and signature verification, sanitized logs, parameters without secrets, cost impact, and recovery result.

## Post-incident follow-up

Run GAME-007 only after the owner approves the exact temporary test Job and one failure execution. Record the execution and cleanup in Git-owned evidence. Any real production backup rerun remains separately approval-gated.
