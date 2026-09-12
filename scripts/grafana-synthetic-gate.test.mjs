import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSyntheticQuery,
  evaluateSyntheticGate,
  expectedAtmosJobs,
  queryGrafana,
} from './grafana-synthetic-gate.mjs';

const nowMs = Date.parse('2026-09-12T17:00:00Z');

function payload(overrides = {}) {
  const timestamp = nowMs / 1_000 - 60;
  return {
    status: 'success',
    data: {
      result: expectedAtmosJobs.map((job) => ({
        metric: { job },
        value: [timestamp, '1'],
        ...overrides[job],
      })),
    },
  };
}

test('uses the fixed Atmos synthetic query', () => {
  assert.equal(buildSyntheticQuery(), 'probe_success{job=~"Atmos.*"}');
});

test('passes only when all expected checks are recent and successful', () => {
  assert.equal(evaluateSyntheticGate({ payload: payload(), nowMs }).decision, 'PASS');
});

test('fails when a fresh expected check reports failure', () => {
  const failingJob = expectedAtmosJobs[1];
  assert.equal(
    evaluateSyntheticGate({
      payload: payload({ [failingJob]: { value: [nowMs / 1_000 - 60, '0'] } }),
      nowMs,
    }).decision,
    'FAIL',
  );
});

test('holds for missing or stale samples', () => {
  const missing = payload();
  missing.data.result.pop();
  assert.equal(evaluateSyntheticGate({ payload: missing, nowMs }).decision, 'INSUFFICIENT_DATA');

  const staleJob = expectedAtmosJobs[0];
  assert.equal(
    evaluateSyntheticGate({
      payload: payload({ [staleJob]: { value: [nowMs / 1_000 - 1_801, '1'] } }),
      nowMs,
    }).decision,
    'INSUFFICIENT_DATA',
  );
});

test('rejects malformed and future-dated samples', () => {
  assert.throws(
    () =>
      evaluateSyntheticGate({
        payload: payload({
          [expectedAtmosJobs[0]]: { value: [nowMs / 1_000 + 61, '1'] },
        }),
        nowMs,
      }),
    /invalid metric sample/,
  );
});

test('queries the fixed datasource without exposing the token in errors', async () => {
  const successPayload = payload();
  const response = await queryGrafana({
    grafanaUrl: 'https://example.grafana.net',
    token: 'test-token',
    fetcher: async (url, init) => {
      assert.equal(url.origin, 'https://example.grafana.net');
      assert.equal(url.pathname, '/api/datasources/proxy/uid/grafanacloud-prom/api/v1/query');
      assert.equal(url.searchParams.get('query'), buildSyntheticQuery());
      assert.equal(init.headers.authorization, 'Bearer test-token');
      return Response.json(successPayload);
    },
  });
  assert.deepEqual(response, successPayload);

  await assert.rejects(
    queryGrafana({
      grafanaUrl: 'https://example.grafana.net',
      token: 'test-token',
      fetcher: async () => new Response('provider details', { status: 403 }),
    }),
    (error) =>
      error.message === 'Grafana query failed with HTTP 403.' &&
      !error.message.includes('test-token') &&
      !error.message.includes('provider details'),
  );
  await assert.rejects(
    queryGrafana({
      grafanaUrl: 'https://grafana.example.com',
      token: 'test-token',
      fetcher: async () => {
        throw new Error('must not request an untrusted host');
      },
    }),
    /uncredentialed Grafana Cloud origin/,
  );
});
