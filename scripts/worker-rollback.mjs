import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const releasePattern = /^[0-9a-f]{12}$/;

function validateIdentity(value, pattern, label) {
  if (!pattern.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function parseInventory(value, label) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} is empty.`);
  return value;
}

function latestDeployment(deployments) {
  return [...parseInventory(deployments, 'Deployment inventory')].sort(
    (left, right) => Date.parse(right.created_on) - Date.parse(left.created_on),
  )[0];
}

function versionById(versions, versionId) {
  return parseInventory(versions, 'Version inventory').find((version) => version.id === versionId);
}

function versionTag(version) {
  return version?.annotations?.['workers/tag'];
}

export function evaluateRollbackPlan({
  deployments,
  versions,
  stableVersionId,
  stableReleaseId,
  failedVersionId,
  failedReleaseId,
  mode,
  confirmation,
}) {
  validateIdentity(stableVersionId, uuidPattern, 'Stable version ID');
  validateIdentity(failedVersionId, uuidPattern, 'Failed version ID');
  validateIdentity(stableReleaseId, releasePattern, 'Stable release ID');
  validateIdentity(failedReleaseId, releasePattern, 'Failed release ID');

  if (stableVersionId === failedVersionId || stableReleaseId === failedReleaseId) {
    throw new Error('Stable and failed identities must be distinct.');
  }
  if (!['plan', 'execute'].includes(mode)) throw new Error('Mode must be plan or execute.');
  const expectedConfirmation = mode === 'execute' ? 'ROLLBACK' : 'PLAN';
  if (confirmation !== expectedConfirmation) {
    throw new Error(`${mode} mode requires ${expectedConfirmation} confirmation.`);
  }

  const stableVersion = versionById(versions, stableVersionId);
  const failedVersion = versionById(versions, failedVersionId);
  if (!stableVersion || versionTag(stableVersion) !== stableReleaseId) {
    throw new Error('Stable Worker version and release tag do not match.');
  }
  if (!failedVersion || versionTag(failedVersion) !== failedReleaseId) {
    throw new Error('Failed Worker version and release tag do not match.');
  }

  const current = latestDeployment(deployments);
  const failedPercentage = current.versions?.find(
    (version) => version.version_id === failedVersionId,
  )?.percentage;
  if (typeof failedPercentage !== 'number' || failedPercentage <= 0) {
    throw new Error('Failed Worker version is not receiving traffic in the current deployment.');
  }

  const stableWasDeployed = deployments.some((deployment) =>
    deployment.versions?.some((version) => version.version_id === stableVersionId),
  );
  if (!stableWasDeployed)
    throw new Error('Stable Worker version is not a retained deployment target.');

  return {
    mode,
    currentDeploymentId: current.id,
    failedPercentage,
    stableVersionId,
    stableReleaseId,
    failedVersionId,
    failedReleaseId,
  };
}

export function evaluateRollbackResult({ deployments, previousDeploymentId, stableVersionId }) {
  validateIdentity(stableVersionId, uuidPattern, 'Stable version ID');
  const current = latestDeployment(deployments);
  if (current.id === previousDeploymentId)
    throw new Error('Cloudflare did not create a new deployment.');
  if (
    current.versions?.length !== 1 ||
    current.versions[0]?.version_id !== stableVersionId ||
    current.versions[0]?.percentage !== 100
  ) {
    throw new Error('Rollback deployment is not the stable Worker version at 100 percent.');
  }
  return { deploymentId: current.id, stableVersionId, percentage: 100 };
}

async function request(fetcher, url, expectedStatus, headers) {
  let response;
  try {
    response = await fetcher(url, { headers, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new Error(`Rollback smoke request failed for ${url.pathname}.`);
  }
  if (response.status !== expectedStatus) {
    throw new Error(`Rollback smoke returned HTTP ${response.status} for ${url.pathname}.`);
  }
  return response;
}

export async function smokeRollback({
  baseUrl,
  stableReleaseId,
  stableVersionId,
  fetcher = fetch,
}) {
  validateIdentity(stableReleaseId, releasePattern, 'Stable release ID');
  if (stableVersionId) validateIdentity(stableVersionId, uuidPattern, 'Stable version ID');
  const base = new URL(baseUrl);
  if (
    base.protocol !== 'https:' ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== '/'
  ) {
    throw new Error('Worker base URL must be an HTTPS origin.');
  }

  const headers = stableVersionId
    ? { 'Cloudflare-Workers-Version-Overrides': `atmos-gateway="${stableVersionId}"` }
    : undefined;
  const health = await request(fetcher, new URL('/health', base), 200, headers);
  if ((await health.json()).status !== 'ok')
    throw new Error('Rollback health response is invalid.');

  const version = await request(fetcher, new URL('/version', base), 200, headers);
  if ((await version.json()).release !== stableReleaseId) {
    throw new Error('Rollback version response does not match the stable release.');
  }

  const weatherUrl = new URL('/api/v1/weather/dashboard', base);
  weatherUrl.search = new URLSearchParams({
    lat: '52.52',
    lon: '13.405',
    timezone: 'Europe/Berlin',
    units: 'metric',
  }).toString();
  const weather = await request(fetcher, weatherUrl, 200, headers);
  if ((await weather.json()).meta?.provider !== 'open-meteo') {
    throw new Error('Rollback weather response is invalid.');
  }

  await request(fetcher, new URL('/api/v1/me', base), 401, headers);
  return { health: 'ok', release: stableReleaseId, weather: 'ok', unauthenticatedRoute: 401 };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function main(args) {
  const [command, ...values] = args;
  if (command === 'plan') {
    const [
      deploymentsPath,
      versionsPath,
      stableVersionId,
      stableReleaseId,
      failedVersionId,
      failedReleaseId,
      mode,
      confirmation,
    ] = values;
    return evaluateRollbackPlan({
      deployments: await readJson(deploymentsPath),
      versions: await readJson(versionsPath),
      stableVersionId,
      stableReleaseId,
      failedVersionId,
      failedReleaseId,
      mode,
      confirmation,
    });
  }
  if (command === 'verify') {
    const [deploymentsPath, previousDeploymentId, stableVersionId] = values;
    return evaluateRollbackResult({
      deployments: await readJson(deploymentsPath),
      previousDeploymentId,
      stableVersionId,
    });
  }
  if (command === 'smoke') {
    const [baseUrl, stableReleaseId, stableVersionId] = values;
    return smokeRollback({ baseUrl, stableReleaseId, stableVersionId });
  }
  throw new Error('Expected plan, verify, or smoke command.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await main(process.argv.slice(2))));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Worker rollback validation failed.');
    process.exitCode = 1;
  }
}
