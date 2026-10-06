import assert from 'node:assert/strict';
import test from 'node:test';

import { configureVercelHcpVariables } from './hcp-vercel-variables.mjs';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/vnd.api+json' },
  });
}

function workspaceResponse({ autoApply = false, executionMode = 'remote' } = {}) {
  return {
    data: {
      id: 'ws-vercel',
      attributes: { 'execution-mode': executionMode, 'auto-apply': autoApply },
    },
  };
}

test('creates only the approved Vercel HCP variables with the token sensitive', async () => {
  const requests = [];
  const variables = [];
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    requests.push({ url: parsed, options });

    if (parsed.pathname.endsWith('/organizations/atmos_uit/workspaces/atmos-vercel')) {
      return jsonResponse(workspaceResponse());
    }
    if (parsed.pathname.endsWith('/workspaces/ws-vercel/vars') && options.method === 'POST') {
      const body = JSON.parse(options.body);
      variables.push({ id: `var-${body.data.attributes.key}`, attributes: body.data.attributes });
      return jsonResponse({ data: { id: `var-${body.data.attributes.key}`, type: 'vars' } }, 201);
    }
    if (parsed.pathname.endsWith('/workspaces/ws-vercel/vars')) {
      return jsonResponse({ data: variables, links: {} });
    }

    throw new Error(`Unexpected request path: ${parsed.pathname}`);
  };

  const result = await configureVercelHcpVariables({
    fetchImpl,
    hcpToken: 'fake-hcp-token',
    vercelToken: 'fake-vercel-token',
    teamId: 'team-test',
    projectId: 'prj-test',
  });

  assert.deepEqual(result.created, ['team_id', 'project_id', 'VERCEL_API_TOKEN']);
  assert.deepEqual(result.unchanged, []);
  const created = variables.map(({ attributes }) => attributes);
  assert.deepEqual(
    created.map(({ key, category, sensitive }) => ({ key, category, sensitive })),
    [
      { key: 'team_id', category: 'terraform', sensitive: false },
      { key: 'project_id', category: 'terraform', sensitive: false },
      { key: 'VERCEL_API_TOKEN', category: 'env', sensitive: true },
    ],
  );
  assert.equal(created.find(({ key }) => key === 'team_id').value, 'team-test');
  assert.equal(created.find(({ key }) => key === 'project_id').value, 'prj-test');
  assert.equal(created.find(({ key }) => key === 'VERCEL_API_TOKEN').value, 'fake-vercel-token');
  assert.equal(JSON.stringify(result).includes('fake-vercel-token'), false);
  assert.equal(
    requests.some(({ options }) => options.method === 'PATCH' || options.method === 'DELETE'),
    false,
  );
});

test('leaves matching non-sensitive variables and an existing sensitive token unchanged', async () => {
  const variables = [
    {
      id: 'var-team',
      attributes: { key: 'team_id', value: 'team-test', category: 'terraform', sensitive: false },
    },
    {
      id: 'var-project',
      attributes: { key: 'project_id', value: 'prj-test', category: 'terraform', sensitive: false },
    },
    {
      id: 'var-token',
      attributes: { key: 'VERCEL_API_TOKEN', value: '', category: 'env', sensitive: true },
    },
  ];
  let creates = 0;
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/organizations/atmos_uit/workspaces/atmos-vercel')) {
      return jsonResponse(workspaceResponse());
    }
    if (parsed.pathname.endsWith('/workspaces/ws-vercel/vars') && options.method === 'POST') {
      creates += 1;
      return jsonResponse({ data: {} }, 201);
    }
    if (parsed.pathname.endsWith('/workspaces/ws-vercel/vars')) {
      return jsonResponse({ data: variables, links: {} });
    }
    throw new Error(`Unexpected request path: ${parsed.pathname}`);
  };

  const result = await configureVercelHcpVariables({
    fetchImpl,
    hcpToken: 'fake-hcp-token',
    vercelToken: 'fake-vercel-token',
    teamId: 'team-test',
    projectId: 'prj-test',
  });

  assert.equal(creates, 0);
  assert.deepEqual(result.created, []);
  assert.deepEqual(result.unchanged, ['team_id', 'project_id', 'VERCEL_API_TOKEN']);
});

test('refuses to overwrite an existing non-sensitive variable with a different value', async () => {
  let creates = 0;
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/organizations/atmos_uit/workspaces/atmos-vercel')) {
      return jsonResponse(workspaceResponse());
    }
    if (parsed.pathname.endsWith('/workspaces/ws-vercel/vars') && options.method === 'POST') {
      creates += 1;
      return jsonResponse({ data: {} }, 201);
    }
    if (parsed.pathname.endsWith('/workspaces/ws-vercel/vars')) {
      return jsonResponse({
        data: [
          {
            id: 'var-team',
            attributes: {
              key: 'team_id',
              value: 'different-team',
              category: 'terraform',
              sensitive: false,
            },
          },
        ],
        links: {},
      });
    }
    throw new Error(`Unexpected request path: ${parsed.pathname}`);
  };

  await assert.rejects(
    configureVercelHcpVariables({
      fetchImpl,
      hcpToken: 'fake-hcp-token',
      vercelToken: 'fake-vercel-token',
      teamId: 'team-test',
      projectId: 'prj-test',
    }),
    /team_id differs from the Production configuration/,
  );
  assert.equal(creates, 0);
});

test('requires the HCP workspace to remain remote with auto-apply disabled', async () => {
  let variableCalls = 0;
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/organizations/atmos_uit/workspaces/atmos-vercel')) {
      return jsonResponse(workspaceResponse({ autoApply: true }));
    }
    variableCalls += 1;
    return jsonResponse({ data: [], links: {} });
  };

  await assert.rejects(
    configureVercelHcpVariables({
      fetchImpl,
      hcpToken: 'fake-hcp-token',
      vercelToken: 'fake-vercel-token',
      teamId: 'team-test',
      projectId: 'prj-test',
    }),
    /must remain remote with manual apply/,
  );
  assert.equal(variableCalls, 0);
});
