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

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
object="backups/$(date -u +%Y/%m/%d)/atmos-backup-${timestamp}.tar.gz.enc"
endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
archive="atmos-backup-${timestamp}"
archive_dir="$workdir/$archive"
mkdir "$archive_dir"

# The application dump excludes Supabase-managed schemas from the backup scope.
pg_dumpall --roles-only --database="$SUPABASE_BACKUP_DATABASE_URL" >"$archive_dir/roles.sql"
pg_dump --schema=public --schema-only --no-owner --no-privileges "$SUPABASE_BACKUP_DATABASE_URL" >"$archive_dir/schema.sql"
pg_dump --schema=public --data-only --no-owner --no-privileges "$SUPABASE_BACKUP_DATABASE_URL" >"$archive_dir/data.sql"
(cd "$archive_dir" && sha256sum roles.sql schema.sql data.sql >sha256sums.txt)
printf '{"created_at":"%s","format":"postgresql-logical","schema":"public"}\n' "$timestamp" >"$archive_dir/manifest.json"
tar -C "$workdir" -czf "$workdir/$archive.tar.gz" "$archive"
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 600000 -pass env:BACKUP_ENCRYPTION_KEY \
  -in "$workdir/$archive.tar.gz" -out "$workdir/$archive.tar.gz.enc"
openssl dgst -sha256 -hmac "$BACKUP_ENCRYPTION_KEY" "$workdir/$archive.tar.gz.enc" >"$workdir/$archive.tar.gz.enc.hmac"
aws s3 cp "$workdir/$archive.tar.gz.enc" "s3://${R2_BUCKET}/${object}" --endpoint-url "$endpoint" --no-progress
aws s3 cp "$workdir/$archive.tar.gz.enc.hmac" "s3://${R2_BUCKET}/${object}.hmac" --endpoint-url "$endpoint" --no-progress

printf '%s\n' "backup and HMAC manifest uploaded: ${object}"
