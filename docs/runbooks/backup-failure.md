# Backup Failure

## Summary

Use this runbook after the encrypted logical backup pipeline is active. It is currently not deployed because Azure/R2 prerequisites are blocked; Supabase Free managed backups must not be assumed.

## User impact

The production database continues serving, but recoverability degrades and destructive data work must stop.

## Detection

After `BACKUP-001`, detect failed/missing job execution, nonzero dump/encryption/upload result, missing checksum manifest, or backup-age breach. Today, there is no successful production backup to monitor.

## Relevant dashboards/logs

After activation use the Azure backup job execution, private R2 object/manifest inventory, and backup metrics. Current evidence is the explicit R2 error `10042` in `docs/evidence/preflight/2026-09-10.md`.

## Immediate mitigation

Freeze destructive migrations, retention deletion, and credential rotation affecting recovery. Do not create an unencrypted dump or commit/export it to Git.

## Diagnosis

After activation verify source connectivity, least-privilege credentials, dump exit status, encryption, checksum, R2 upload, retention, credit, and quotas without reading backup contents.

## Recovery

Requires completed `AZJOB-001`, `R2BACK-001`, and `BACKUP-001`. Rerun the exact signed job only after the failing dependency is fixed and owner approval exists for production access.

## Rollback

Restore the prior job digest/IaC configuration; never delete the last known-good backup while correcting the pipeline.

## Security considerations

Backups are sensitive. Require encryption before upload, private R2 access, no public URLs, no Git artifacts, and no credentials in commands/evidence.

## Escalation

Escalate immediately if no fresh backup exists, data may be corrupt/exposed, encryption keys are unavailable, R2 enablement implies cost, or destructive work is planned.

## Evidence to preserve

Preserve job ID, source SHA/digest, UTC times, redacted exit stage, checksum/manifest identifiers, object metadata, age, and recovery validation.

## Post-incident follow-up

Complete restore verification before declaring backup health and update RPO/RTO or retention only through reviewed policy.
