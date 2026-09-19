import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const dockerfile = readFileSync(
  new URL('../jobs/database-backup/Dockerfile', import.meta.url),
  'utf8',
);
const script = readFileSync(new URL('../jobs/database-backup/backup.sh', import.meta.url), 'utf8');
const restore = readFileSync(
  new URL('../jobs/database-backup/restore.sh', import.meta.url),
  'utf8',
);

test('backup image has a finite non-root encrypted R2 upload contract', () => {
  assert.match(dockerfile, /^FROM postgres:17\.7-alpine3\.22@sha256:[0-9a-f]{64}$/m);
  assert.match(dockerfile, /^USER 999$/m);
  assert.match(dockerfile, /^ENTRYPOINT \["\/usr\/local\/bin\/backup"\]$/m);
  assert.doesNotMatch(dockerfile, /(?:TOKEN|PASSWORD|SECRET|DATABASE_URL)=/i);
  assert.match(script, /^set -eu$/m);
  assert.match(script, /pg_dumpall --roles-only/);
  assert.match(script, /pg_dump --schema=public --schema-only --no-owner --no-privileges/);
  assert.match(script, /pg_dump --schema=public --data-only --no-owner --no-privileges/);
  assert.match(script, /sha256sum roles\.sql schema\.sql data\.sql >sha256sums\.txt/);
  assert.match(script, /tar -C "\$workdir" -czf/);
  assert.match(script, /openssl enc -aes-256-cbc -salt -pbkdf2 -iter 600000/);
  assert.match(script, /openssl dgst -sha256 -hmac "\$BACKUP_ENCRYPTION_KEY"/);
  assert.match(script, /s3:\/\/\$\{R2_BUCKET\}\/\$\{object\}/);
  assert.match(script, /trap 'rm -rf "\$workdir"' EXIT/);
  assert.doesNotMatch(script, /--acl|public-read|curl|wget/);
  assert.match(restore, /sha256sum -c sha256sums\.txt/);
  assert.match(restore, /CREATE SCHEMA IF NOT EXISTS auth/);
  assert.match(restore, /CREATE ROLE authenticated/);
  assert.match(restore, /DROP SCHEMA public CASCADE;/);
  assert.match(restore, /RESTORE_DATABASE_URL/);
  assert.match(restore, /restore verification passed/);
  assert.doesNotMatch(restore, /--acl|public-read|curl|wget/);
});
