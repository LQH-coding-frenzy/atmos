import assert from 'node:assert/strict';
import test from 'node:test';
import {
  planAffinityRestore,
  planAffinityTest,
  runAffinitySmoke,
  verifyAffinityRestore,
  verifyAffinitySplit,
  verifyHeldDeployment,
} from './worker-affinity-smoke.mjs';

const stableVersionId = '11111111-1111-4111-8111-111111111111';
const candidateVersionId = '22222222-2222-4222-8222-222222222222';
const otherVersionId = '33333333-3333-4333-8333-333333333333';
const stableReleaseId = 'aaaaaa111111';
const candidateReleaseId = 'bbbbbb222222';
const previousDeploymentId = 'deployment-stable';

function deployment(id, createdOn, versions) {
  return { id, created_on: createdOn, versions };
}

const stableDeployment = deployment(previousDeploymentId, '2026-10-01T10:00:00.000Z', [
  { version_id: stableVersionId, percentage: 100 },
]);
const heldDeployment = deployment('deployment-held', '2026-10-01T10:01:00.000Z', [
  { version_id: stableVersionId, percentage: 100 },
  { version_id: candidateVersionId, percentage: 0 },
]);
const splitDeployment = deployment('deployment-split', '2026-10-01T10:02:00.000Z', [
  { version_id: stableVersionId, percentage: 90 },
  { version_id: candidateVersionId, percentage: 10 },
]);

test('plans a test only from a single active stable release and a new candidate tag', () => {
  const plan = planAffinityTest({
    deployments: [stableDeployment],
    versions: [
      { id: stableVersionId, annotations: { 'workers/tag': stableReleaseId } },
      { id: otherVersionId, annotations: { 'workers/tag': 'cccccc333333' } },
    ],
    candidateReleaseId,
  });

  assert.deepEqual(plan, {
    previousDeploymentId,
    stableVersionId,
    stableReleaseId,
    candidateReleaseId,
  });
});

test('refuses a pre-existing split or a reused candidate tag', () => {
  assert.throws(
    () =>
      planAffinityTest({
        deployments: [splitDeployment],
        versions: [{ id: stableVersionId, annotations: { 'workers/tag': stableReleaseId } }],
        candidateReleaseId,
      }),
    /one stable Worker version at 100 percent/,
  );
  assert.throws(
    () =>
      planAffinityTest({
        deployments: [stableDeployment],
        versions: [
          { id: stableVersionId, annotations: { 'workers/tag': stableReleaseId } },
          { id: candidateVersionId, annotations: { 'workers/tag': candidateReleaseId } },
        ],
        candidateReleaseId,
      }),
    /tag already exists/,
  );
});

test('validates the exact zero-percent and 90/10 deployments', () => {
  assert.deepEqual(
    verifyHeldDeployment({
      deployments: [stableDeployment, heldDeployment],
      stableVersionId,
      candidateVersionId,
    }),
    { deploymentId: 'deployment-held', stableVersionId, candidateVersionId },
  );
  assert.deepEqual(
    verifyAffinitySplit({
      deployments: [stableDeployment, heldDeployment, splitDeployment],
      stableVersionId,
      candidateVersionId,
    }),
    {
      deploymentId: 'deployment-split',
      stableVersionId,
      stablePercentage: 90,
      candidateVersionId,
      candidatePercentage: 10,
    },
  );
  assert.throws(
    () =>
      verifyAffinitySplit({ deployments: [stableDeployment], stableVersionId, candidateVersionId }),
    /percentages do not match/,
  );
});

test('plans a no-op when production never left stable and restores only known REL-005 versions', () => {
  assert.deepEqual(
    planAffinityRestore({
      deployments: [stableDeployment],
      previousDeploymentId,
      stableVersionId,
      candidateVersionId,
    }),
    { action: 'NOOP', deploymentId: previousDeploymentId, stableVersionId },
  );
  assert.equal(
    planAffinityRestore({
      deployments: [stableDeployment, heldDeployment],
      previousDeploymentId,
      stableVersionId,
      candidateVersionId,
    }).action,
    'RESTORE',
  );
  assert.equal(
    planAffinityRestore({
      deployments: [stableDeployment, splitDeployment],
      previousDeploymentId,
      stableVersionId,
      candidateVersionId,
    }).action,
    'RESTORE',
  );
  assert.throws(
    () =>
      planAffinityRestore({
        deployments: [
          stableDeployment,
          deployment('unexpected', '2026-10-01T10:03:00.000Z', [
            { version_id: stableVersionId, percentage: 90 },
            { version_id: otherVersionId, percentage: 10 },
          ]),
        ],
        previousDeploymentId,
        stableVersionId,
        candidateVersionId,
      }),
    /refusing automatic restore/,
  );
  assert.deepEqual(
    verifyAffinityRestore({ deployments: [stableDeployment, stableDeployment], stableVersionId }),
    { deploymentId: previousDeploymentId, stableVersionId, stablePercentage: 100 },
  );
});

test('repeats each UUIDv4 key and confirms it remains on one of the two releases', async () => {
  const keys = [stableVersionId, candidateVersionId];
  let nextKey = 0;
  const observedHeaders = [];
  const report = await runAffinitySmoke({
    origin: 'https://api.rainify.dpdns.org/',
    stableReleaseId,
    candidateReleaseId,
    minimumSamplesPerRelease: 3,
    maxKeys: 2,
    requestsPerKey: 3,
    concurrency: 2,
    keyFactory: () => keys[nextKey++],
    fetcher: async (_url, options) => {
      observedHeaders.push(options.headers);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          release:
            options.headers['X-Atmos-Version-Key'] === keys[0]
              ? stableReleaseId
              : candidateReleaseId,
        }),
      };
    },
  });

  assert.equal(report.decision, 'PASS');
  assert.equal(report.stableSamples, 3);
  assert.equal(report.candidateSamples, 3);
  assert.equal(report.stableKeys, 1);
  assert.equal(report.candidateKeys, 1);
  assert.equal(report.keysTested, 2);
  assert.equal(observedHeaders[0].Origin, 'https://rainify.dpdns.org');
  assert.equal(observedHeaders[0].Referer, 'https://rainify.dpdns.org/');
  assert.equal(observedHeaders[0]['X-Atmos-Version-Key'], keys[0]);
  assert.equal(observedHeaders[0]['Cloudflare-Workers-Version-Key'], keys[0]);
});

test('uses crypto.randomUUID as the default key factory', async () => {
  const assignedRelease = new Map();
  let nextRelease = 0;
  const report = await runAffinitySmoke({
    origin: 'https://api.rainify.dpdns.org/',
    stableReleaseId,
    candidateReleaseId,
    minimumSamplesPerRelease: 3,
    maxKeys: 2,
    requestsPerKey: 3,
    concurrency: 1,
    fetcher: async (_url, options) => {
      const key = options.headers['X-Atmos-Version-Key'];
      let release = assignedRelease.get(key);
      if (!release) {
        release = nextRelease++ === 0 ? stableReleaseId : candidateReleaseId;
        assignedRelease.set(key, release);
      }
      return { ok: true, status: 200, json: async () => ({ release }) };
    },
  });

  assert.equal(report.decision, 'PASS');
  assert.equal(report.keysTested, 2);
});

test('fails when a repeated key crosses releases, when traffic is insufficient, or off the production host', async () => {
  let requestCount = 0;
  await assert.rejects(
    runAffinitySmoke({
      origin: 'https://api.rainify.dpdns.org/',
      stableReleaseId,
      candidateReleaseId,
      minimumSamplesPerRelease: 1,
      maxKeys: 1,
      requestsPerKey: 2,
      concurrency: 1,
      keyFactory: () => stableVersionId,
      fetcher: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          release: requestCount++ === 0 ? stableReleaseId : candidateReleaseId,
        }),
      }),
    }),
    /One affinity key reached multiple Worker releases/,
  );

  await assert.rejects(
    runAffinitySmoke({
      origin: 'https://api.rainify.dpdns.org/',
      stableReleaseId,
      candidateReleaseId,
      minimumSamplesPerRelease: 3,
      maxKeys: 1,
      requestsPerKey: 3,
      concurrency: 1,
      keyFactory: () => stableVersionId,
      fetcher: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ release: stableReleaseId }),
      }),
    }),
    /did not reach the sample floor/,
  );
  await assert.rejects(
    runAffinitySmoke({
      origin: 'https://atmos-gateway.rainify.workers.dev/',
      stableReleaseId,
      candidateReleaseId,
    }),
    /restricted to the production custom API origin/,
  );
});
