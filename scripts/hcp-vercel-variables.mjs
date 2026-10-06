const HCP_API_BASE = 'https://app.terraform.io/api/v2/';

export const hcpVercelWorkspace = Object.freeze({
  organization: 'atmos_uit',
  name: 'atmos-vercel',
});

function apiUrl(path) {
  return new URL(path, HCP_API_BASE).toString();
}

export function createHcpVariablesClient({ fetchImpl = fetch, token }) {
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('TF_ORG_TOKEN must be provided.');
  }

  async function request(path, options = {}) {
    const response = await fetchImpl(apiUrl(path), {
      ...options,
      headers: {
        Accept: 'application/vnd.api+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/vnd.api+json',
        ...options.headers,
      },
      signal: options.signal ?? AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`HCP Terraform API request failed with HTTP ${response.status}.`);
    }

    return response.status === 204 ? null : response.json();
  }

  async function list(path) {
    const values = [];
    let next = path;

    while (next) {
      const response = await request(next);
      values.push(...response.data);
      next = response.links?.next ?? null;
    }

    return values;
  }

  async function createVariable(workspaceId, variable) {
    const response = await fetchImpl(apiUrl(`workspaces/${workspaceId}/vars`), {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.api+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/vnd.api+json',
      },
      body: JSON.stringify({
        data: {
          type: 'vars',
          attributes: {
            key: variable.key,
            value: variable.value,
            description: variable.description,
            category: variable.category,
            hcl: false,
            sensitive: variable.sensitive,
          },
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    // A sensitive-variable response can contain provider credentials; never read or print it.
    await response.body?.cancel();
    if (!response.ok) {
      throw new Error(
        `HCP variable creation failed for ${variable.key} with HTTP ${response.status}.`,
      );
    }
  }

  return { list, request, createVariable };
}

function desiredVariables({ teamId, projectId, vercelToken }) {
  return [
    {
      key: 'team_id',
      value: teamId,
      category: 'terraform',
      sensitive: false,
      description: 'Existing Vercel team ID used by the atmos-vercel workspace.',
    },
    {
      key: 'project_id',
      value: projectId,
      category: 'terraform',
      sensitive: false,
      description: 'Existing Atmos Vercel project ID used by the domain resource.',
    },
    {
      key: 'VERCEL_API_TOKEN',
      value: vercelToken,
      category: 'env',
      sensitive: true,
      description:
        'Existing team-scoped Vercel provider credential; sensitive environment variable.',
    },
  ];
}

function preflightExistingVariables(existing, desired) {
  const byKey = new Map(existing.map((variable) => [variable.attributes.key, variable]));
  const existingKeys = [];

  for (const target of desired) {
    const current = byKey.get(target.key);
    if (!current) continue;

    const attributes = current.attributes;
    if (attributes.category !== target.category || attributes.sensitive !== target.sensitive) {
      throw new Error(
        `Existing HCP variable ${target.key} has incompatible metadata; refusing to overwrite it.`,
      );
    }

    if (!target.sensitive && attributes.value !== target.value) {
      throw new Error(
        `Existing HCP variable ${target.key} differs from the Production configuration; refusing to overwrite it.`,
      );
    }

    // Sensitive values are write-only in HCP; preserve an existing value without replacement.
    existingKeys.push(target.key);
  }

  return new Set(existingKeys);
}

export async function configureVercelHcpVariables({
  fetchImpl = fetch,
  hcpToken,
  vercelToken,
  teamId,
  projectId,
}) {
  const inputs = [hcpToken, vercelToken, teamId, projectId];
  if (inputs.some((value) => typeof value !== 'string' || value.length === 0)) {
    throw new Error('HCP and Vercel variable inputs must be provided.');
  }

  const client = createHcpVariablesClient({ fetchImpl, token: hcpToken });
  const workspaceResponse = await client.request(
    `organizations/${hcpVercelWorkspace.organization}/workspaces/${hcpVercelWorkspace.name}`,
  );
  const workspace = workspaceResponse.data;
  if (
    workspace.attributes['execution-mode'] !== 'remote' ||
    workspace.attributes['auto-apply'] !== false
  ) {
    throw new Error('The atmos-vercel workspace must remain remote with manual apply.');
  }

  const variablesPath = `workspaces/${workspace.id}/vars`;
  const desired = desiredVariables({ teamId, projectId, vercelToken });
  const existing = await client.list(variablesPath);
  const existingKeys = preflightExistingVariables(existing, desired);
  const created = [];

  for (const variable of desired) {
    if (existingKeys.has(variable.key)) continue;
    await client.createVariable(workspace.id, variable);
    created.push(variable.key);
  }

  const verified = await client.list(variablesPath);
  const verifiedByKey = new Map(verified.map((variable) => [variable.attributes.key, variable]));
  for (const variable of desired) {
    const current = verifiedByKey.get(variable.key);
    if (
      !current ||
      current.attributes.category !== variable.category ||
      current.attributes.sensitive !== variable.sensitive ||
      (!variable.sensitive && current.attributes.value !== variable.value)
    ) {
      throw new Error(`HCP variable metadata verification failed for ${variable.key}.`);
    }
  }

  return {
    workspace: hcpVercelWorkspace.name,
    created,
    unchanged: desired.map((variable) => variable.key).filter((key) => !created.includes(key)),
  };
}

async function main() {
  if (process.env.CONFIRMATION !== 'CONFIGURE_VERCEL_IAC_VARIABLES') {
    throw new Error('Protected Vercel variable setup confirmation is required.');
  }

  const result = await configureVercelHcpVariables({
    hcpToken: process.env.TF_ORG_TOKEN,
    vercelToken: process.env.VERCEL_TOKEN,
    teamId: process.env.VERCEL_ORG_ID,
    projectId: process.env.VERCEL_PROJECT_ID,
  });

  process.stdout.write(
    `HCP Vercel workspace variables created: ${result.created.length}; unchanged: ${result.unchanged.length}.\n`,
  );
}

if (process.argv[1]?.endsWith('hcp-vercel-variables.mjs')) {
  main().catch((error) => {
    process.stderr.write(`HCP Vercel variable setup failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
