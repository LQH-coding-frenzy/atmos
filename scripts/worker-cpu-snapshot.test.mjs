import assert from 'node:assert/strict';
import test from 'node:test';
import {
  boundedWindow,
  buildWorkerCpuQuery,
  createWorkerCpuSnapshot,
  evaluateWorkerCpuSnapshot,
  queryWorkerCpu,
  rowsFromWorkerCpuResponse,
} from './worker-cpu-snapshot.mjs';

const accountId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const versionId = '11111111-1111-4111-8111-111111111111';
const now = new Date('2026-11-03T18:30:00.000Z');
const window = {
  start: '2026-11-03T17:20:00.000Z',
  end: '2026-11-03T18:20:00.000Z',
  lookbackMinutes: 60,
};
const sufficientRows = [
  {
    sum: { requests: 40, errors: 0 },
    quantiles: { cpuTimeP50: 1_500, cpuTimeP95: 6_500, cpuTimeP99: 8_000 },
  },
];

test('builds a bounded exact-version, non-preview CPU query with no free-form script input', () => {
  const query = buildWorkerCpuQuery({
    accountId,
    versionId,
    start: window.start,
    end: window.end,
  });

  assert.match(query, /workersInvocationsAdaptive\(\s*limit: 1/);
  assert.match(query, /scriptName: "atmos-gateway"/);
  assert.match(query, new RegExp(`scriptVersion_in: \\["${versionId}"\\]`));
  assert.match(query, /isPreview: 0/);
  assert.match(query, /datetime_geq: "2026-11-03T17:20:00\.000Z"/);
  assert.match(query, /datetime_leq: "2026-11-03T18:20:00\.000Z"/);
  assert.match(query, /cpuTimeP50[\s\S]*cpuTimeP95[\s\S]*cpuTimeP99/);
  assert.doesNotMatch(query, /mutation/i);
  assert.throws(
    () =>
      buildWorkerCpuQuery({
        accountId,
        versionId: `${versionId}" mutation {`,
        start: window.start,
        end: window.end,
      }),
    /version ID is invalid/,
  );
  assert.throws(
    () =>
      buildWorkerCpuQuery({
        accountId: 'not-an-account',
        versionId,
        start: window.start,
        end: window.end,
      }),
    /account ID is invalid/,
  );
  assert.throws(
    () =>
      buildWorkerCpuQuery({
        accountId,
        versionId,
        start: window.end,
        end: window.start,
      }),
    /must be before window end/,
  );
  assert.throws(
    () =>
      buildWorkerCpuQuery({
        accountId,
        versionId,
        start: '2026-11-01T00:00:00.000Z',
        end: '2026-11-03T00:00:00.000Z',
      }),
    /cannot exceed 1440 minutes/,
  );
});

test('uses a 10-minute ingestion cushion and bounds the lookback to one day', () => {
  assert.deepEqual(boundedWindow(now, 60), window);
  assert.throws(() => boundedWindow(now, 0), /integer from 1 through 1440/);
  assert.throws(() => boundedWindow(now, 1_441), /integer from 1 through 1440/);
});

test('passes only a 30+ request zero-error snapshot with CPU p95 within budget', () => {
  const report = evaluateWorkerCpuSnapshot({
    rows: sufficientRows,
    versionId,
    window,
    checkedAt: now.toISOString(),
  });
  assert.equal(report.decision, 'PASS');
  assert.deepEqual(report.metrics, {
    requests: 40,
    errors: 0,
    cpuTimeMs: { p50: 1.5, p95: 6.5, p99: 8 },
  });
});

test('holds above-budget CPU or errors and reports insufficient natural samples below 30', () => {
  assert.equal(
    evaluateWorkerCpuSnapshot({
      rows: [
        {
          sum: { requests: 30, errors: 0 },
          quantiles: { cpuTimeP50: 1, cpuTimeP95: 7_001, cpuTimeP99: 8_000 },
        },
      ],
      versionId,
      window,
      checkedAt: now.toISOString(),
    }).decision,
    'HOLD',
  );
  assert.equal(
    evaluateWorkerCpuSnapshot({
      rows: [
        {
          sum: { requests: 30, errors: 1 },
          quantiles: { cpuTimeP50: 1, cpuTimeP95: 6_000, cpuTimeP99: 8_000 },
        },
      ],
      versionId,
      window,
      checkedAt: now.toISOString(),
    }).decision,
    'HOLD',
  );
  assert.equal(
    evaluateWorkerCpuSnapshot({
      rows: [
        {
          sum: { requests: 29, errors: 0 },
          quantiles: { cpuTimeP50: 1, cpuTimeP95: 2_000, cpuTimeP99: 3_000 },
        },
      ],
      versionId,
      window,
      checkedAt: now.toISOString(),
    }).decision,
    'INSUFFICIENT_DATA',
  );
  assert.equal(
    evaluateWorkerCpuSnapshot({ rows: [], versionId, window, checkedAt: now.toISOString() })
      .decision,
    'INSUFFICIENT_DATA',
  );
  const missingQuantiles = evaluateWorkerCpuSnapshot({
    rows: [
      {
        sum: { requests: 40, errors: 0 },
        quantiles: { cpuTimeP50: null, cpuTimeP95: null, cpuTimeP99: null },
      },
    ],
    versionId,
    window,
    checkedAt: now.toISOString(),
  });
  assert.equal(missingQuantiles.decision, 'INSUFFICIENT_DATA');
  assert.equal(missingQuantiles.metrics.cpuTimeMs, null);
});

test('rejects malformed, ambiguous, or inconsistent Cloudflare analytics rows', () => {
  assert.throws(
    () => rowsFromWorkerCpuResponse({ data: { viewer: { accounts: [] } } }),
    /exactly one account/,
  );
  assert.throws(
    () =>
      rowsFromWorkerCpuResponse({
        data: { viewer: { accounts: [{ workersInvocationsAdaptive: [{}, {}] }] } },
      }),
    /ambiguous aggregate/,
  );
  assert.throws(
    () =>
      evaluateWorkerCpuSnapshot({
        rows: [
          {
            sum: { requests: 30, errors: 0 },
            quantiles: { cpuTimeP50: 7_000, cpuTimeP95: 2_000, cpuTimeP99: 8_000 },
          },
        ],
        versionId,
        window,
        checkedAt: now.toISOString(),
      }),
    /inconsistent CPU quantiles/,
  );
  assert.throws(
    () =>
      evaluateWorkerCpuSnapshot({
        rows: [
          {
            sum: { requests: '30', errors: 0 },
            quantiles: { cpuTimeP50: 1, cpuTimeP95: 2, cpuTimeP99: 3 },
          },
        ],
        versionId,
        window,
        checkedAt: now.toISOString(),
      }),
    /invalid request count metric/,
  );
});

test('queries the GraphQL endpoint without exposing credentials or provider error messages', async () => {
  let request;
  const responsePayload = {
    data: { viewer: { accounts: [{ workersInvocationsAdaptive: sufficientRows }] } },
  };
  const payload = await queryWorkerCpu({
    accountId,
    token: 'test-token',
    versionId,
    ...window,
    fetcher: async (url, init) => {
      request = { url, init };
      assert.match(JSON.parse(init.body).query, /^query WorkerCpuSnapshot/);
      return Response.json(responsePayload);
    },
  });
  assert.equal(request.url, 'https://api.cloudflare.com/client/v4/graphql');
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.headers.authorization, 'Bearer test-token');
  assert.ok(request.init.signal instanceof AbortSignal);
  assert.deepEqual(payload, responsePayload);

  await assert.rejects(
    queryWorkerCpu({
      accountId,
      token: 'test-token',
      versionId,
      ...window,
      fetcher: async () =>
        Response.json(
          { errors: [{ code: 7003, message: 'private provider detail' }] },
          { status: 200 },
        ),
    }),
    (error) =>
      error.message ===
        'Cloudflare Workers Analytics GraphQL returned errors (Cloudflare codes 7003).' &&
      !error.message.includes('private provider detail') &&
      !error.message.includes('test-token'),
  );

  await assert.rejects(
    queryWorkerCpu({
      accountId,
      token: 'test-token',
      versionId,
      ...window,
      fetcher: async () =>
        Response.json(
          { errors: [{ code: 10000, message: 'private authorization detail' }] },
          { status: 403 },
        ),
    }),
    (error) =>
      error.message ===
        'Cloudflare Workers Analytics GraphQL failed with HTTP 403 (Cloudflare codes 10000).' &&
      !error.message.includes('private authorization detail') &&
      !error.message.includes('test-token'),
  );
});

test('builds an observational report without making a request to the Worker', async () => {
  const report = await createWorkerCpuSnapshot({
    accountId,
    token: 'test-token',
    versionId,
    lookbackMinutes: 60,
    now,
    fetcher: async (url, init) => {
      assert.equal(url, 'https://api.cloudflare.com/client/v4/graphql');
      const body = JSON.parse(init.body);
      assert.match(body.query, /scriptName: "atmos-gateway"/);
      return Response.json({
        data: { viewer: { accounts: [{ workersInvocationsAdaptive: sufficientRows }] } },
      });
    },
  });
  assert.equal(report.decision, 'PASS');
  assert.equal(report.window.end, '2026-11-03T18:20:00.000Z');
});
