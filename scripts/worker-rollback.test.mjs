import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateRollbackPlan, evaluateRollbackResult, smokeRollback } from './worker-rollback.mjs';

const stableVersionId = '335f0f53-c301-4cc3-bd84-2b9b4e799b9b';
const failedVersionId = '57d8764d-c7e2-41d2-9e46-00c74f17f4c6';
const stableReleaseId = '763e8c651218';
const failedReleaseId = 'a794b540e4dc';

const versions = [
  { id: stableVersionId, annotations: { 'workers/tag': stableReleaseId } },
  { id: failedVersionId, annotations: { 'workers/tag': failedReleaseId } },
];

const deployments = [
  {
    id: 'old-deployment',
    created_on: '2026-09-12T16:00:00Z',
    versions: [{ version_id: stableVersionId, percentage: 100 }],
  },
  {
    id: 'current-deployment',
    created_on: '2026-09-12T17:00:00Z',
    versions: [
      { version_id: stableVersionId, percentage: 0 },
      { version_id: failedVersionId, percentage: 100 },
    ],
  },
];

function plan(overrides = {}) {
  return evaluateRollbackPlan({
    deployments,
    versions,
    stableVersionId,
    stableReleaseId,
    failedVersionId,
    failedReleaseId,
    mode: 'plan',
    confirmation: 'PLAN',
    ...overrides,
  });
}

test('accepts an exact retained rollback target and current failed release', () => {
  assert.deepEqual(plan(), {
    mode: 'plan',
    currentDeploymentId: 'current-deployment',
    failedPercentage: 100,
    stableVersionId,
    stableReleaseId,
    failedVersionId,
    failedReleaseId,
  });
});

test('requires explicit confirmation for execution', () => {
  assert.equal(plan({ mode: 'execute', confirmation: 'ROLLBACK' }).mode, 'execute');
  assert.throws(() => plan({ mode: 'execute' }), /requires ROLLBACK confirmation/);
});

test('rejects mismatched tags and a failed version without current traffic', () => {
  assert.throws(() => plan({ stableReleaseId: 'aaaaaaaaaaaa' }), /do not match/);
  assert.throws(
    () =>
      plan({
        deployments: [
          {
            id: 'current-deployment',
            created_on: '2026-09-12T17:00:00Z',
            versions: [{ version_id: stableVersionId, percentage: 100 }],
          },
        ],
      }),
    /not receiving traffic/,
  );
});

test('accepts only a new stable-only 100 percent deployment', () => {
  const result = evaluateRollbackResult({
    deployments: [
      ...deployments,
      {
        id: 'rollback-deployment',
        created_on: '2026-09-12T18:00:00Z',
        versions: [{ version_id: stableVersionId, percentage: 100 }],
      },
    ],
    previousDeploymentId: 'current-deployment',
    stableVersionId,
  });
  assert.deepEqual(result, {
    deploymentId: 'rollback-deployment',
    stableVersionId,
    percentage: 100,
  });

  assert.throws(
    () =>
      evaluateRollbackResult({
        deployments,
        previousDeploymentId: 'current-deployment',
        stableVersionId,
      }),
    /did not create a new deployment/,
  );
});

test('smokes health, release, weather, and authorization without credentials', async () => {
  const requested = [];
  const overrideHeaders = [];
  const result = await smokeRollback({
    baseUrl: 'https://example.workers.dev/',
    stableReleaseId,
    stableVersionId,
    fetcher: async (url, init) => {
      requested.push(`${url.pathname}${url.search}`);
      overrideHeaders.push(init.headers?.['Cloudflare-Workers-Version-Overrides']);
      if (url.pathname === '/health') return Response.json({ status: 'ok' });
      if (url.pathname === '/version') return Response.json({ release: stableReleaseId });
      if (url.pathname === '/api/v1/weather/dashboard') {
        return Response.json({ meta: { provider: 'open-meteo' } });
      }
      if (url.pathname === '/api/v1/me') return new Response(null, { status: 401 });
      return new Response(null, { status: 404 });
    },
  });

  assert.deepEqual(result, {
    health: 'ok',
    release: stableReleaseId,
    weather: 'ok',
    unauthenticatedRoute: 401,
  });
  assert.equal(requested.length, 4);
  assert.deepEqual(overrideHeaders, Array(4).fill(`atmos-gateway="${stableVersionId}"`));
});

test('does not include provider response bodies in smoke errors', async () => {
  await assert.rejects(
    smokeRollback({
      baseUrl: 'https://example.workers.dev/',
      stableReleaseId,
      fetcher: async () => new Response('sensitive provider detail', { status: 500 }),
    }),
    (error) =>
      error.message === 'Rollback smoke returned HTTP 500 for /health.' &&
      !error.message.includes('sensitive provider detail'),
  );
});
