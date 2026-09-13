import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authorizeFunctionDeletion,
  evaluateFunctionCleanup,
  executeLiveFunctionCleanup,
  liveFunctionCleanupPlan,
} from './supabase-function-cleanup.mjs';

const releases = ['111111111111', '222222222222', '333333333333'];
const versionIds = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
];

function fixtures() {
  return {
    deployments: [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        versions: [{ version_id: versionIds[2], percentage: 100 }],
      },
    ],
    versions: versionIds.map((id, index) => ({
      id,
      annotations: { 'workers/tag': releases[index] },
    })),
    functions: [
      { slug: 'api-v1', status: 'ACTIVE' },
      ...releases.map((release) => ({ slug: `api-${release}`, status: 'ACTIVE' })),
      { slug: 'api-444444444444', status: 'ACTIVE' },
      { slug: 'alert-evaluator', status: 'ACTIVE' },
    ],
  };
}

test('protects canonical and retained releases while identifying unreferenced candidates', () => {
  const result = evaluateFunctionCleanup(fixtures());

  assert.deepEqual(result.protectedFunctions, [
    'api-111111111111',
    'api-222222222222',
    'api-333333333333',
    'api-v1',
  ]);
  assert.deepEqual(result.candidates, ['api-444444444444']);
  assert.deepEqual(result.ignoredFunctions, ['alert-evaluator']);
});

test('fails closed when fewer than three Worker releases are retained', () => {
  const values = fixtures();
  values.versions.pop();

  assert.throws(() => evaluateFunctionCleanup(values), /At least three retained/);
});

test('fails closed when Wrangler may have truncated retained versions', () => {
  const values = fixtures();
  values.versions = Array.from({ length: 10 }, (_, index) => ({
    id: `${String(index).padStart(8, '0')}-1111-4111-8111-111111111111`,
    annotations: { 'workers/tag': String(index).padStart(12, '0') },
  }));

  assert.throws(() => evaluateFunctionCleanup(values), /may be truncated/);
});

test('fails closed when a Worker release tag is missing or malformed', () => {
  const missing = fixtures();
  delete missing.versions[0].annotations['workers/tag'];
  assert.throws(() => evaluateFunctionCleanup(missing), /no canonical release tag/);

  const malformed = fixtures();
  malformed.versions[0].annotations['workers/tag'] = 'release-latest';
  assert.throws(() => evaluateFunctionCleanup(malformed), /no canonical release tag/);
});

test('fails closed when deployment inventory is inconsistent', () => {
  const values = fixtures();
  values.deployments[0].versions[0].version_id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

  assert.throws(() => evaluateFunctionCleanup(values), /missing from the version inventory/);
});

test('fails closed when a protected function is absent or inactive', () => {
  const absent = fixtures();
  absent.functions = absent.functions.filter(({ slug }) => slug !== 'api-222222222222');
  assert.throws(() => evaluateFunctionCleanup(absent), /is not active/);

  const inactive = fixtures();
  inactive.functions[0].status = 'FAILED';
  assert.throws(() => evaluateFunctionCleanup(inactive), /is not active/);
});

test('authorizes only an exact candidate with exact confirmation', () => {
  const plan = evaluateFunctionCleanup(fixtures());

  assert.deepEqual(authorizeFunctionDeletion(plan, 'api-444444444444', 'DELETE api-444444444444'), {
    authorizedFunction: 'api-444444444444',
  });
  assert.throws(
    () => authorizeFunctionDeletion(plan, 'api-333333333333', 'DELETE api-333333333333'),
    /protected/,
  );
  assert.throws(
    () => authorizeFunctionDeletion(plan, 'api-555555555555', 'DELETE api-555555555555'),
    /not present/,
  );
  assert.throws(
    () => authorizeFunctionDeletion(plan, 'api-444444444444', 'DELETE'),
    /exact confirmation/,
  );
});

function providerRunner(values) {
  const calls = [];
  return {
    calls,
    run: async (args) => {
      calls.push(args);
      if (args.includes('deployments')) return JSON.stringify(values.deployments);
      if (args.includes('versions')) return JSON.stringify(values.versions);
      if (args.includes('list')) return JSON.stringify(values.functions);
      if (args.includes('delete')) return '';
      throw new Error('Unexpected provider command.');
    },
  };
}

test('builds a live plan from fixed production inventory commands', async () => {
  const provider = providerRunner(fixtures());
  const plan = await liveFunctionCleanupPlan(provider.run);

  assert.deepEqual(plan.candidates, ['api-444444444444']);
  assert.equal(provider.calls.length, 3);
  assert.deepEqual(provider.calls[2].slice(-4), [
    '--project-ref',
    'oxgwprvkotfvyacpqayx',
    '--output',
    'json',
  ]);
});

test('deletes only the exact target authorized by a fresh live plan', async () => {
  const provider = providerRunner(fixtures());

  assert.deepEqual(
    await executeLiveFunctionCleanup({
      functionName: 'api-444444444444',
      confirmation: 'DELETE api-444444444444',
      runCommand: provider.run,
    }),
    { authorizedFunction: 'api-444444444444' },
  );
  assert.deepEqual(provider.calls[3], [
    'pnpm',
    'exec',
    'supabase',
    'functions',
    'delete',
    'api-444444444444',
    '--project-ref',
    'oxgwprvkotfvyacpqayx',
    '--yes',
  ]);

  const rejectedProvider = providerRunner(fixtures());
  await assert.rejects(
    executeLiveFunctionCleanup({
      functionName: 'api-333333333333',
      confirmation: 'DELETE api-333333333333',
      runCommand: rejectedProvider.run,
    }),
    /protected/,
  );
  assert.equal(rejectedProvider.calls.length, 3);
});
