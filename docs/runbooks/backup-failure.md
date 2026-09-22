# Backup Failure

## Summary

Atmos retains one encrypted R2 logical backup archive and backup Container Instance evidence. Recurring backup execution and freshness monitoring are intentionally not operated; Supabase Free managed backups must not be assumed.

## User impact

The production database continues serving, but recoverability degrades and destructive data work must stop.

## Detection

For an explicitly approved backup run, detect failed job execution, nonzero dump/encryption/upload result, or a missing checksum manifest. Review `docs/evidence/restore-001/2026-09-19.md` for the verified archive rather than claiming recurring freshness.

## Relevant dashboards/logs

Use the backup Container Instance execution, private R2 object/manifest inventory, and the retained restore evidence. Do not invent a recurring backup metric or freshness alert.

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
