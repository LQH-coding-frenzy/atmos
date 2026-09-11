import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildWaeQuery,
  evaluateReleaseGate,
  queryWae,
  rowsFromWaeResponse,
} from './wae-release-gate.mjs';

const stable = {
  versionId: '11111111-1111-4111-8111-111111111111',
  releaseId: '111111111111',
};
const candidate = {
  versionId: '22222222-2222-4222-8222-222222222222',
  releaseId: '222222222222',
};

function rows(candidateOverrides = {}, stableOverrides = {}) {
  return [
    {
      worker_version_id: stable.versionId,
      release_id: stable.releaseId,
      weighted_sample_count: 100,
      error_rate: 0.005,
      p95_wall_ms: 100,
      ...stableOverrides,
    },
    {
      worker_version_id: candidate.versionId,
      release_id: candidate.releaseId,
      weighted_sample_count: 100,
      error_rate: 0.01,
      p95_wall_ms: 120,
      ...candidateOverrides,
    },
  ];
}

test('builds an exact sampling-aware stable and candidate query', () => {
  const query = buildWaeQuery({
    dataset: 'atmos_worker_requests_staging',
    stable,
    candidate,
    lookbackMinutes: 60,
  });

  assert.match(query, /SUM\(_sample_interval\) AS weighted_sample_count/);
  assert.match(query, /SUM\(double2 \* _sample_interval\) \/ SUM\(_sample_interval\)/);
  assert.match(query, /quantileExactWeighted\(0\.95\)\(double1, _sample_interval\)/);
  assert.match(query, new RegExp(stable.versionId));
  assert.match(query, new RegExp(candidate.versionId));
  assert.throws(
    () =>
      buildWaeQuery({
        dataset: 'dataset; DROP TABLE data',
        stable,
        candidate,
        lookbackMinutes: 60,
      }),
    /dataset is invalid/,
  );
});

test('returns PASS for a sufficiently sampled candidate within both limits', () => {
  assert.equal(evaluateReleaseGate({ rows: rows(), stable, candidate }).decision, 'PASS');
});

test('returns FAIL for candidate error or latency regressions', () => {
  assert.equal(
    evaluateReleaseGate({ rows: rows({ error_rate: 0.021 }), stable, candidate }).decision,
    'FAIL',
  );
  assert.equal(
    evaluateReleaseGate({ rows: rows({ p95_wall_ms: 2_501 }), stable, candidate }).decision,
    'FAIL',
  );
});

test('returns INSUFFICIENT_DATA instead of promoting a small sample', () => {
  assert.equal(
    evaluateReleaseGate({
      rows: rows({ weighted_sample_count: 29 }),
      stable,
      candidate,
    }).decision,
    'INSUFFICIENT_DATA',
  );
});

test('rejects ambiguous identities and malformed metric responses', () => {
  assert.throws(
    () => evaluateReleaseGate({ rows: rows(), stable, candidate: stable }),
    /must be distinct/,
  );
  assert.throws(() => rowsFromWaeResponse({ data: 'not rows' }), /does not contain metric rows/);
  assert.throws(
    () => evaluateReleaseGate({ rows: rows({ error_rate: 1.1 }), stable, candidate }),
    /Invalid error rate metric/,
  );
});

test('queries the account endpoint without exposing the token in errors', async () => {
  const fetcher = async (url, init) => {
    assert.equal(
      url,
      'https://api.cloudflare.com/client/v4/accounts/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/analytics_engine/sql',
    );
    assert.equal(init.headers.authorization, 'Bearer test-token');
    assert.equal(init.body, 'SELECT 1');
    assert.ok(init.signal instanceof AbortSignal);
    return Response.json({ data: rows() });
  };
  assert.deepEqual(
    await queryWae({
      accountId: 'a'.repeat(32),
      token: 'test-token',
      query: 'SELECT 1',
      fetcher,
    }),
    rows(),
  );

  await assert.rejects(
    queryWae({
      accountId: 'a'.repeat(32),
      token: 'test-token',
      query: 'SELECT 1',
      fetcher: async () => new Response('provider details', { status: 403 }),
    }),
    (error) => error.message === 'WAE SQL query failed with HTTP 403.',
  );
  await assert.rejects(
    queryWae({
      accountId: 'a'.repeat(32),
      token: 'test-token',
      query: 'SELECT 1',
      fetcher: async () =>
        Response.json(
          { errors: [{ code: 6003, message: 'provider detail' }, { code: 6111 }] },
          { status: 400 },
        ),
    }),
    (error) =>
      error.message === 'WAE SQL query failed with HTTP 400 (Cloudflare codes 6003,6111).' &&
      !error.message.includes('provider detail'),
  );
});
