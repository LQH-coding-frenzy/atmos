#!/bin/sh
set -eu

: "${BACKUP_ENCRYPTION_KEY:?missing encryption key}"
: "${R2_ACCESS_KEY_ID:?missing R2 access key}"
: "${R2_SECRET_ACCESS_KEY:?missing R2 secret key}"
: "${R2_ACCOUNT_ID:?missing R2 account ID}"
: "${R2_BUCKET:?missing R2 bucket}"
: "${RESTORE_OBJECT:?missing encrypted backup object}"

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="auto"
export AWS_EC2_METADATA_DISABLED="true"

endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

until pg_isready --host localhost --username postgres --dbname postgres; do sleep 1; done
aws s3 cp "s3://${R2_BUCKET}/${RESTORE_OBJECT}" "$workdir/archive.tar.gz.enc" --endpoint-url "$endpoint" --no-progress
aws s3 cp "s3://${R2_BUCKET}/${RESTORE_OBJECT}.hmac" "$workdir/archive.tar.gz.enc.hmac" --endpoint-url "$endpoint" --no-progress
expected="$(awk '{print $2}' "$workdir/archive.tar.gz.enc.hmac")"
actual="$(openssl dgst -sha256 -hmac "$BACKUP_ENCRYPTION_KEY" "$workdir/archive.tar.gz.enc" | awk '{print $2}')"
[ "$actual" = "$expected" ]
openssl enc -d -aes-256-cbc -salt -pbkdf2 -iter 600000 -pass env:BACKUP_ENCRYPTION_KEY \
  -in "$workdir/archive.tar.gz.enc" -out "$workdir/archive.tar.gz"
tar -C "$workdir" -xzf "$workdir/archive.tar.gz"
archive="$(find "$workdir" -mindepth 1 -maxdepth 1 -type d -name 'atmos-backup-*')"
(cd "$archive" && sha256sum -c sha256sums.txt)
# The isolated PostgreSQL image pre-creates its bootstrap postgres role.
sed -e '/^CREATE ROLE postgres;$/d' -e '/^ALTER ROLE postgres /d' "$archive/roles.sql" >"$workdir/roles.restore.sql"
psql --host localhost --username postgres --dbname postgres --set ON_ERROR_STOP=1 --file "$workdir/roles.restore.sql"
psql --host localhost --username postgres --dbname postgres --set ON_ERROR_STOP=1 \
  --command "CREATE SCHEMA IF NOT EXISTS auth;"
psql --host localhost --username postgres --dbname postgres --set ON_ERROR_STOP=1 --file "$archive/schema.sql"
psql --host localhost --username postgres --dbname postgres --set ON_ERROR_STOP=1 --file "$archive/data.sql"
psql --host localhost --username postgres --dbname postgres --tuples-only --no-align \
  --command "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | grep -Eq '^[1-9][0-9]*$'
printf '%s\n' "restore verification passed: ${RESTORE_OBJECT}"
