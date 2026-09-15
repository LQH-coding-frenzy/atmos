#!/bin/sh
set -eu

: "${SUPABASE_BACKUP_DATABASE_URL:?missing database URL}"
: "${BACKUP_ENCRYPTION_KEY:?missing encryption key}"
: "${R2_ACCESS_KEY_ID:?missing R2 access key}"
: "${R2_SECRET_ACCESS_KEY:?missing R2 secret key}"
: "${R2_ACCOUNT_ID:?missing R2 account ID}"
: "${R2_BUCKET:?missing R2 bucket}"

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="auto"
export AWS_EC2_METADATA_DISABLED="true"

object="backups/$(date -u +%Y/%m/%d)/backup-$(date -u +%Y%m%dT%H%M%SZ).dump.enc"
endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

# Supabase-managed schemas are not part of the application backup role's scope.
pg_dump --schema=public --format=custom --no-owner --no-privileges "$SUPABASE_BACKUP_DATABASE_URL" >"$workdir/backup.dump"
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 600000 -pass env:BACKUP_ENCRYPTION_KEY \
  -in "$workdir/backup.dump" -out "$workdir/backup.dump.enc"
openssl dgst -sha256 -hmac "$BACKUP_ENCRYPTION_KEY" "$workdir/backup.dump.enc" >"$workdir/backup.dump.enc.hmac"
aws s3 cp "$workdir/backup.dump.enc" "s3://${R2_BUCKET}/${object}" --endpoint-url "$endpoint" --no-progress
aws s3 cp "$workdir/backup.dump.enc.hmac" "s3://${R2_BUCKET}/${object}.hmac" --endpoint-url "$endpoint" --no-progress

printf '%s\n' "backup and HMAC manifest uploaded: ${object}"
