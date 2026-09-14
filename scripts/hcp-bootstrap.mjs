const HCP_API_BASE = 'https://app.terraform.io/api/v2/';

export const hcpBootstrapConfig = Object.freeze({
  organization: 'atmos_uit',
  project: 'atmos-platform',
  workspaces: Object.freeze([
    'atmos-edge-staging',
    'atmos-edge-production',
    'atmos-data-staging',
    'atmos-data-production',
    'atmos-azure-staging',
    'atmos-azure-production',
    'atmos-vercel',
  ]),
});

function requestUrl(path) {
  return new URL(path, HCP_API_BASE).toString();
}

export function createHcpClient({ fetchImpl = fetch, token }) {
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('TF_ORG_TOKEN must be provided');
  }

  async function request(path, options = {}) {
    const response = await fetchImpl(requestUrl(path), {
      ...options,
      headers: {
        Accept: 'application/vnd.api+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/vnd.api+json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`HCP Terraform API request failed with HTTP ${response.status}`);
    }

    return response.status === 204 ? null : response.json();
  }

  async function list(path) {
    const resources = [];
    let next = path;

    while (next) {
      const response = await request(next);
      resources.push(...response.data);
      next = response.links?.next ?? null;
    }

    return resources;
  }

  return { list, request };
}

export async function bootstrapHcpTerraform({
  fetchImpl = fetch,
  token,
  config = hcpBootstrapConfig,
}) {
  const client = createHcpClient({ fetchImpl, token });
  const projects = await client.list(`organizations/${config.organization}/projects`);
  let project = projects.find(({ attributes }) => attributes.name === config.project);
  let projectCreated = false;
  let projectUpdated = false;

  if (!project) {
    const response = await client.request(`organizations/${config.organization}/projects`, {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'projects',
          attributes: {
            name: config.project,
            'default-execution-mode': 'remote',
          },
        },
      }),
    });
    project = response.data;
    projectCreated = true;
  } else if (project.attributes['default-execution-mode'] !== 'remote') {
    const response = await client.request(`projects/${project.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        data: {
          type: 'projects',
          id: project.id,
          attributes: {
            'default-execution-mode': 'remote',
          },
        },
      }),
    });
    project = response.data;
    projectUpdated = true;
  }

  const workspacesByName = new Map(
    (await client.list(`organizations/${config.organization}/workspaces`)).map((workspace) => [
      workspace.attributes.name,
      workspace,
    ]),
  );
  const createdWorkspaces = [];
  const updatedWorkspaces = [];

  for (const workspace of config.workspaces) {
    const existing = workspacesByName.get(workspace);
    if (
      existing &&
      existing.attributes['execution-mode'] === 'remote' &&
      existing.attributes['auto-apply'] === false &&
      existing.relationships?.project?.data?.id === project.id
    ) {
      continue;
    }

    const workspaceData = {
      type: 'workspaces',
      ...(existing ? { id: existing.id } : {}),
      attributes: {
        name: workspace,
        'execution-mode': 'remote',
        'auto-apply': false,
      },
      relationships: {
        project: {
          data: {
            type: 'projects',
            id: project.id,
          },
        },
      },
    };

    if (existing) {
      await client.request(`workspaces/${existing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ data: workspaceData }),
      });
      updatedWorkspaces.push(workspace);
    } else {
      await client.request(`organizations/${config.organization}/workspaces`, {
        method: 'POST',
        body: JSON.stringify({ data: workspaceData }),
      });
      createdWorkspaces.push(workspace);
    }
  }

  return {
    projectCreated,
    projectUpdated,
    createdWorkspaces,
    updatedWorkspaces,
    existingWorkspaces: config.workspaces.filter(
      (name) => !createdWorkspaces.includes(name) && !updatedWorkspaces.includes(name),
    ),
  };
}

async function main() {
  const result = await bootstrapHcpTerraform({ token: process.env.TF_ORG_TOKEN });
  const projectStatus = result.projectCreated
    ? 'created'
    : result.projectUpdated
      ? 'reconciled'
      : 'already matched';
  console.log(`HCP Terraform project ${projectStatus}: ${hcpBootstrapConfig.project}`);
  console.log(
    `HCP Terraform workspaces created: ${result.createdWorkspaces.length}; reconciled: ${result.updatedWorkspaces.length}; already matched: ${result.existingWorkspaces.length}`,
  );
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  main().catch((error) => {
    console.error(`HCP Terraform bootstrap failed: ${error.message}`);
    process.exitCode = 1;
  });
}
