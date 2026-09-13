import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { jobEvents } from '../jobs/runtime-probe/job.mjs';

const dockerfile = readFileSync(
  new URL('../jobs/runtime-probe/Dockerfile', import.meta.url),
  'utf8',
);

test('emits bounded structured job lifecycle events', () => {
  assert.deepEqual(
    jobEvents({ ATMOS_JOB_ID: 'ctr-001.validation:1', ATMOS_RELEASE_ID: 'abcdef012345' }),
    [
      {
        event: 'job_started',
        status: 'running',
        job_id: 'ctr-001.validation:1',
        release_id: 'abcdef012345',
        job_type: 'runtime-probe',
      },
      {
        event: 'job_completed',
        status: 'ok',
        job_id: 'ctr-001.validation:1',
        release_id: 'abcdef012345',
        job_type: 'runtime-probe',
      },
    ],
  );
});

test('rejects missing malformed and oversized runtime identity without reflection', () => {
  for (const environment of [
    {},
    { ATMOS_JOB_ID: 'valid', ATMOS_RELEASE_ID: 'ABCDEF012345' },
    { ATMOS_JOB_ID: 'invalid value', ATMOS_RELEASE_ID: 'abcdef012345' },
    { ATMOS_JOB_ID: `a${'b'.repeat(128)}`, ATMOS_RELEASE_ID: 'abcdef012345' },
  ]) {
    assert.throws(() => jobEvents(environment), {
      message: 'Invalid job runtime configuration.',
    });
  }
});

test('pins a minimal base and runs only copied source as non-root', () => {
  assert.match(dockerfile, /^FROM node:24\.14\.1-alpine3\.23@sha256:[0-9a-f]{64}$/m);
  assert.match(dockerfile, /^COPY --chown=node:node job\.mjs \/app\/job\.mjs$/m);
  assert.match(dockerfile, /^USER node:node$/m);
  assert.match(dockerfile, /^ENTRYPOINT \["node", "\/app\/job\.mjs"\]$/m);
  assert.match(dockerfile, /^ENV NODE_OPTIONS=--disable-proto=throw$/m);
  assert.doesNotMatch(dockerfile, /^(RUN|ADD|EXPOSE)\b/m);
  assert.doesNotMatch(dockerfile, /TOKEN|PASSWORD|SECRET|DATABASE_URL/);
});
