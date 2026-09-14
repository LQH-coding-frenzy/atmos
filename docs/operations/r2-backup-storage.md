# R2 Backup Storage

`atmos-production-backups` is private and managed by Cloudflare Terraform. Backup objects must use the `backups/` prefix; temporary verification objects must use `backups/smoke/` and be deleted immediately after readback.

R2 S3 credentials exist only as sensitive environment variables in HCP Terraform workspace `atmos-azure-production`. They are consumed by the Azure backup job after `AZ-IAC-001`; they must never be copied to GitHub, local `.env`, Worker bindings, Terraform files, logs, or evidence.

The first smoke write/read/delete is bounded to less than 1 GB and fewer than 100 operations. Stop if storage or operation accounting is unexpected. This task does not create a public bucket endpoint or a backup schedule.
