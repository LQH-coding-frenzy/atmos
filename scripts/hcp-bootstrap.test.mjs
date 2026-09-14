import assert from 'node:assert/strict';
import test from 'node:test';

import { bootstrapHcpTerraform, hcpBootstrapConfig } from './hcp-bootstrap.mjs';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/vnd.api+json' },
  });
}

test('bootstraps only the approved project and missing workspaces', async () => {
  const requests = [];
  const existingWorkspace = hcpBootstrapConfig.workspaces[0];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    const requestUrl = new URL(url);

    if (requestUrl.pathname.endsWith('/projects') && options.method !== 'POST') {
      return jsonResponse({ data: [], links: {} });
    }
    if (requestUrl.pathname.endsWith('/projects')) {
      return jsonResponse({ data: { id: 'prj-atmos', type: 'projects' } }, 201);
    }
    if (requestUrl.pathname.endsWith('/workspaces') && options.method !== 'POST') {
      return jsonResponse({
        data: [{ attributes: { name: existingWorkspace } }],
        links: {},
      });
    }
    if (requestUrl.pathname.endsWith('/workspaces')) {
      return jsonResponse({ data: { id: 'ws-created', type: 'workspaces' } }, 201);
    }

    throw new Error(`Unexpected request: ${url}`);
  };

  const result = await bootstrapHcpTerraform({ fetchImpl, token: 'test-only-value' });

  assert.equal(result.projectCreated, true);
  assert.deepEqual(result.existingWorkspaces, [existingWorkspace]);
  assert.deepEqual(result.createdWorkspaces, hcpBootstrapConfig.workspaces.slice(1));

  const projectCreate = requests.find(
    ({ url, options }) => new URL(url).pathname.endsWith('/projects') && options.method === 'POST',
  );
  assert.deepEqual(JSON.parse(projectCreate.options.body), {
    data: {
      type: 'projects',
      attributes: {
        name: 'atmos-platform',
        'default-execution-mode': 'remote',
      },
    },
  });

  const workspaceCreates = requests.filter(
    ({ url, options }) =>
      new URL(url).pathname.endsWith('/workspaces') && options.method === 'POST',
  );
  assert.equal(workspaceCreates.length, hcpBootstrapConfig.workspaces.length - 1);
  for (const request of workspaceCreates) {
    const body = JSON.parse(request.options.body);
    assert.equal(body.data.attributes['execution-mode'], 'remote');
    assert.equal(body.data.attributes['auto-apply'], false);
    assert.equal(body.data.relationships.project.data.id, 'prj-atmos');
  }
});

test('does not mutate HCP Terraform when every resource exists', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    const requestUrl = new URL(url);

    if (requestUrl.pathname.endsWith('/projects')) {
      return jsonResponse({
        data: [{ id: 'prj-atmos', attributes: { name: 'atmos-platform' } }],
        links: {},
      });
    }
    if (requestUrl.pathname.endsWith('/workspaces')) {
      return jsonResponse({
        data: hcpBootstrapConfig.workspaces.map((name) => ({ attributes: { name } })),
        links: {},
      });
    }

    throw new Error(`Unexpected request: ${url}`);
  };

  const result = await bootstrapHcpTerraform({ fetchImpl, token: 'test-only-value' });

  assert.equal(result.projectCreated, false);
  assert.deepEqual(result.createdWorkspaces, []);
  assert.deepEqual(result.existingWorkspaces, hcpBootstrapConfig.workspaces);
  assert.equal(
    requests.some(({ options }) => options.method === 'POST'),
    false,
  );
});
