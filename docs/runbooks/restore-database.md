# Restore Database

## Summary

Use this runbook only with a verified encrypted backup and an approved isolated restore target. Atmos currently has neither a production backup pipeline nor restore automation.

## User impact

A real restore may be required after data loss/corruption; unsafe restoration can overwrite good data or expose user records.

## Detection

Invoke only for confirmed recovery need or the planned GAME-006 drill. A failed application deploy alone is not a reason to restore the database.

## Relevant dashboards/logs

After activation use backup manifest/checksum evidence, restore-job logs, migration inventory, database tests, and RPO/RTO records. No current restore artifact is authoritative.

## Immediate mitigation

Stop writes/destructive changes as appropriate and preserve the source database. Do not restore into production, reuse production credentials in CI, or download a dump to the repository.

## Diagnosis

Confirm incident scope, desired recovery point, backup age/checksum/encryption, schema version, affected data, isolated target capacity, and rollback plan.

## Recovery

Requires `BACKUP-001` and `RESTORE-001` complete. Restore into an ephemeral isolated target, run schema/RLS/integrity checks, and obtain explicit approval before any production cutover.

## Rollback

Abandon the isolated target on validation failure. A production cutover requires its own reversible traffic/write plan and preserved pre-cutover state.

## Security considerations

Treat dumps, keys, database URLs, and restored user data as secrets. Use least privilege, encryption, controlled retention, and audited deletion.

## Escalation

Owner/security approval is mandatory for production data access, destructive action, target creation with cost, suspected breach, or production cutover.

## Evidence to preserve

Preserve incident authorization, manifest/checksum and age, isolated target ID, job digest, commands with secrets redacted, validation results, and deletion proof.

## Post-incident follow-up

Record actual RPO/RTO, gaps, and GAME-006 results; do not claim recoverability until a complete isolated restore succeeds.
