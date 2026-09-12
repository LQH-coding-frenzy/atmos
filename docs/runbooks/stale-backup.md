# Stale Backup

## Summary

Use this runbook after backup monitoring exists and the newest verified backup exceeds the approved RPO. No production Atmos backup currently exists, so recoverability is already an explicit open gap.

## User impact

The application may be healthy, but a data-loss incident could exceed the intended recovery point.

## Detection

After activation, compare current UTC time with the latest successful manifest timestamp and verified checksum/restore status; object modification time alone is insufficient.

## Relevant dashboards/logs

Use future `backup_age_seconds`, Azure job history, R2 private manifest inventory, and restore-verification evidence. Do not use Supabase Free as proof of managed backups.

## Immediate mitigation

Block destructive migrations and retention deletion. Do not hide the alert by changing its threshold or uploading a placeholder object.

## Diagnosis

Determine whether scheduling, job failure, credential expiry, encryption, R2 upload, checksum, retention, or monitoring caused the stale state.

## Recovery

After the pipeline is deployed, fix the failed stage, run the exact approved backup job, verify manifest/checksum, and complete the required restore check.

## Rollback

Return to the previous known-good job/IaC configuration while retaining all valid backups and manifests.

## Security considerations

Do not create plaintext emergency dumps, make R2 public, disclose object keys that reveal sensitive context, or bypass encryption/checksum verification.

## Escalation

Escalate before destructive data work, when no backup meets RPO, when keys are unavailable, or when recovery requires paid/blocked resources.

## Evidence to preserve

Preserve latest valid timestamp/age, manifest/checksum IDs, failed stages, job/digest, alert times, remediation run, and restore result.

## Post-incident follow-up

Correct schedule/alert coverage and update RPO/RTO only with owner-reviewed evidence from successful backups and restores.
