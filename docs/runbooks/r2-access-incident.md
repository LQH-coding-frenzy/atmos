# R2 Access Incident

## Summary

Use this runbook for suspected unauthorized access, public exposure, or credential compromise after the private backup bucket exists. R2 is currently disabled for Atmos with provider error `10042`.

## User impact

Future encrypted backups or exports may be exposed, deleted, or unavailable; the current application request path does not depend on R2.

## Detection

After activation use R2 audit/access evidence, unexpected object/bucket policy changes, credential alerts, or manifest mismatches. Before activation, any Atmos R2 resource indicates drift.

## Relevant dashboards/logs

Use Cloudflare R2 inventory/audit data, HCP Terraform plan/state access logs, backup manifests, and credential store audit history. Keep sensitive object names out of public evidence.

## Immediate mitigation

Preserve logs and stop backup deletion/writes. Credential revocation or rotation requires explicit owner approval and verification that restore access will remain possible.

## Diagnosis

Determine bucket/public-domain state, token scope, affected objects/time range, encryption state, Terraform drift, and whether data was read, altered, or deleted.

## Recovery

Requires `R2BACK-001` and Git-owned private configuration. Apply the reviewed least-privilege configuration, rotate approved credentials, and validate backup/restore integrity.

## Rollback

Reapply the prior known-good Terraform configuration only if it is private and secure; never roll back to an exposed policy or compromised credential.

## Security considerations

Treat this as a security incident. Do not publish bucket URLs, S3 keys, backup contents, Terraform state, or encryption material.

## Escalation

Escalate immediately for suspected access/exfiltration, missing objects, unknown resources, paid enablement, credential rotation, or impaired rollback.

## Evidence to preserve

Preserve redacted access/policy history, resource and Terraform run IDs, object manifest/checksum changes, credential audit times, and containment validation.

## Post-incident follow-up

Perform scoped credential rotation, restore verification, policy regression checks, and threat-model updates before resuming backups.
