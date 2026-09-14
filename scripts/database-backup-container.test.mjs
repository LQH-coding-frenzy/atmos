import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const dockerfile = readFileSync(
  new URL('../jobs/database-backup/Dockerfile', import.meta.url),
  'utf8',
);
const script = readFileSync(new URL('../jobs/database-backup/backup.sh', import.meta.url), 'utf8');

test('backup image has a finite non-root encrypted R2 upload contract', () => {
  assert.match(dockerfile, /^FROM postgres:17\.6-alpine3\.21@sha256:[0-9a-f]{64}$/m);
  assert.match(dockerfile, /^USER 999$/m);
  assert.match(dockerfile, /^ENTRYPOINT \["\/usr\/local\/bin\/backup"\]$/m);
  assert.doesNotMatch(dockerfile, /(?:TOKEN|PASSWORD|SECRET|DATABASE_URL)=/i);
  assert.match(script, /^set -eu$/m);
  assert.match(script, /pg_dump --format=custom --no-owner --no-privileges/);
  assert.match(script, /openssl enc -aes-256-cbc -salt -pbkdf2 -iter 600000/);
  assert.match(script, /openssl dgst -sha256 -mac HMAC -macopt keyenv:BACKUP_ENCRYPTION_KEY/);
  assert.match(script, /s3:\/\/\$\{R2_BUCKET\}\/\$\{object\}/);
  assert.match(script, /trap 'rm -rf "\$workdir"' EXIT/);
  assert.doesNotMatch(script, /--acl|public-read|curl|wget/);
});
