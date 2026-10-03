import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const versionIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const releaseIdPattern = /^[0-9a-f]{12}$/;
const apiOrigin = 'https://api.rainify.dpdns.org';

function requireVersionId(value, label) {
  if (!versionIdPattern.test(value ?? ''))
    throw new Error(`${label} Worker version ID is invalid.`);
  return value;
}

function requireReleaseId(value, label) {
  if (!releaseIdPattern.test(value ?? '')) throw new Error(`${label} release ID is invalid.`);
  return value;
}

function inventory(value, label) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} is empty.`);
  return value;
}

function latestDeployment(deployments) {
  return [...inventory(deployments, 'Worker deployment inventory')].sort(
    (left, right) => Date.parse(right.created_on) - Date.parse(left.created_on),
  )[0];
}

function versionTag(version) {
  return version?.annotations?.['workers/tag'];
}

function deploymentShares(deployment) {
  const shares = deployment?.versions;
  if (!Array.isArray(shares) || shares.length === 0) {
    throw new Error('Current Worker deployment has no version assignments.');
  }
  for (const share of shares) {
    requireVersionId(share.version_id, 'Assigned');
    if (!Number.isInteger(share.percentage) || share.percentage < 0 || share.percentage > 100) {
      throw new Error('Current Worker deployment contains an invalid traffic percentage.');
    }
  }
  return shares;
}

function requireExactShares(deployment, expected, label) {
  const actual = deploymentShares(deployment);
  if (
    actual.length !== expected.length ||
    expected.some(
      ([versionId, percentage]) =>
        !actual.some((share) => share.version_id === versionId && share.percentage === percentage),
    )
  ) {
    throw new Error(`${label} Worker deployment percentages do not match the expected versions.`);
  }
}

export function planAffinityTest({ deployments, versions, candidateReleaseId }) {
  requireReleaseId(candidateReleaseId, 'Candidate');
  const versionInventory = inventory(versions, 'Worker version inventory');
  const current = latestDeployment(deployments);
  const activeShares = deploymentShares(current);
  if (activeShares.length !== 1 || activeShares[0].percentage !== 100) {
    throw new Error('Affinity test requires one stable Worker version at 100 percent.');
  }

  const stableVersionId = requireVersionId(activeShares[0].version_id, 'Stable');
  const stableVersion = versionInventory.find((version) => version.id === stableVersionId);
  const stableReleaseId = requireReleaseId(versionTag(stableVersion), 'Stable');
  if (stableReleaseId === candidateReleaseId) {
    throw new Error('Stable and candidate release IDs must be distinct.');
  }
  if (versionInventory.some((version) => versionTag(version) === candidateReleaseId)) {
    throw new Error('Candidate release tag already exists in the Worker version inventory.');
  }
  if (typeof current.id !== 'string' || !current.id) {
    throw new Error('Current Worker deployment ID is invalid.');
  }

  return {
    previousDeploymentId: current.id,
    stableVersionId,
    stableReleaseId,
    candidateReleaseId,
  };
}

export function verifyHeldDeployment({ deployments, stableVersionId, candidateVersionId }) {
  requireVersionId(stableVersionId, 'Stable');
  requireVersionId(candidateVersionId, 'Candidate');
  if (stableVersionId === candidateVersionId) {
    throw new Error('Stable and candidate Worker version IDs must be distinct.');
  }
  const current = latestDeployment(deployments);
  requireExactShares(
    current,
    [
      [stableVersionId, 100],
      [candidateVersionId, 0],
    ],
    'Zero-percent candidate',
  );
  return { deploymentId: current.id, stableVersionId, candidateVersionId };
}

export function verifyAffinitySplit({ deployments, stableVersionId, candidateVersionId }) {
  requireVersionId(stableVersionId, 'Stable');
  requireVersionId(candidateVersionId, 'Candidate');
  if (stableVersionId === candidateVersionId) {
    throw new Error('Stable and candidate Worker version IDs must be distinct.');
  }
  const current = latestDeployment(deployments);
  requireExactShares(
    current,
    [
      [stableVersionId, 90],
      [candidateVersionId, 10],
    ],
    'REL-005 test',
  );
  return {
    deploymentId: current.id,
    stableVersionId,
    stablePercentage: 90,
    candidateVersionId,
    candidatePercentage: 10,
  };
}

export function planAffinityRestore({
  deployments,
  previousDeploymentId,
  stableVersionId,
  candidateVersionId,
}) {
  requireVersionId(stableVersionId, 'Stable');
  requireVersionId(candidateVersionId, 'Candidate');
  const current = latestDeployment(deployments);
  const shares = deploymentShares(current);
  const onlyStableAt100 =
    shares.length === 1 && shares[0].version_id === stableVersionId && shares[0].percentage === 100;
  if (current.id === previousDeploymentId && onlyStableAt100) {
    return { action: 'NOOP', deploymentId: current.id, stableVersionId };
  }

  const knownVersions = new Set([stableVersionId, candidateVersionId]);
  if (
    shares.some((share) => !knownVersions.has(share.version_id)) ||
    !shares.some((share) => share.version_id === stableVersionId)
  ) {
    throw new Error(
      'Current deployment differs from the REL-005 test versions; refusing automatic restore.',
    );
  }
  return { action: 'RESTORE', deploymentId: current.id, stableVersionId };
}

export function verifyAffinityRestore({ deployments, stableVersionId }) {
  requireVersionId(stableVersionId, 'Stable');
  const current = latestDeployment(deployments);
  requireExactShares(current, [[stableVersionId, 100]], 'Restored stable');
  return { deploymentId: current.id, stableVersionId, stablePercentage: 100 };
}

function boundedInteger(value, label, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} through ${maximum}.`);
  }
  return parsed;
}

export async function runAffinitySmoke({
  origin,
  stableReleaseId,
  candidateReleaseId,
  minimumSamplesPerRelease = 30,
  maxKeys = 600,
  requestsPerKey = 3,
  concurrency = 4,
  fetcher = fetch,
  keyFactory = randomUUID,
}) {
  let base;
  try {
    base = new URL(origin);
  } catch {
    throw new Error('Affinity API origin is invalid.');
  }
  if (
    base.origin !== apiOrigin ||
    base.pathname !== '/' ||
    base.search ||
    base.hash ||
    base.username ||
    base.password
  ) {
    throw new Error('Affinity smoke is restricted to the production custom API origin.');
  }
  requireReleaseId(stableReleaseId, 'Stable');
  requireReleaseId(candidateReleaseId, 'Candidate');
  if (stableReleaseId === candidateReleaseId) {
    throw new Error('Stable and candidate release IDs must be distinct.');
  }

  const minimum = boundedInteger(
    minimumSamplesPerRelease,
    'Minimum samples per release',
    1,
    10_000,
  );
  const maximumKeys = boundedInteger(maxKeys, 'Maximum affinity keys', 1, 1_000);
  const repeats = boundedInteger(requestsPerKey, 'Requests per affinity key', 2, 10);
  const workers = boundedInteger(concurrency, 'Request concurrency', 1, 10);
  const samples = { [stableReleaseId]: 0, [candidateReleaseId]: 0 };
  const keys = { [stableReleaseId]: 0, [candidateReleaseId]: 0 };
  const generatedKeys = new Set();
  let nextKey = 0;
  let failure;

  async function probeKey(key) {
    if (!uuidV4Pattern.test(key) || generatedKeys.has(key)) {
      throw new Error('Affinity key generator returned an invalid or duplicate UUIDv4.');
    }
    generatedKeys.add(key);
    let assignedRelease;
    for (let attempt = 0; attempt < repeats; attempt += 1) {
      let response;
      try {
        response = await fetcher(new URL('/version', base), {
          headers: {
            'X-Atmos-Version-Key': key,
            'Cloudflare-Workers-Version-Key': key,
            Origin: 'https://rainify.dpdns.org',
            Referer: 'https://rainify.dpdns.org/',
          },
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new Error('Affinity version request failed.');
      }
      if (!response.ok)
        throw new Error(`Affinity version request returned HTTP ${response.status}.`);
      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new Error('Affinity version response is invalid JSON.');
      }
      const releaseId = payload?.release;
      if (![stableReleaseId, candidateReleaseId].includes(releaseId)) {
        throw new Error('Affinity request reached an unexpected Worker release.');
      }
      if (assignedRelease && assignedRelease !== releaseId) {
        throw new Error('One affinity key reached multiple Worker releases.');
      }
      assignedRelease = releaseId;
      samples[releaseId] += 1;
    }
    keys[assignedRelease] += 1;
  }

  async function worker() {
    while (!failure) {
      if (samples[stableReleaseId] >= minimum && samples[candidateReleaseId] >= minimum) {
        return;
      }
      if (nextKey >= maximumKeys) return;
      nextKey += 1;
      try {
        await probeKey(keyFactory());
      } catch (error) {
        failure = error;
      }
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()));
  if (failure) throw failure;
  const report = {
    decision:
      samples[stableReleaseId] >= minimum && samples[candidateReleaseId] >= minimum
        ? 'PASS'
        : 'INSUFFICIENT_DATA',
    stableReleaseId,
    candidateReleaseId,
    minimumSamplesPerRelease: minimum,
    stableSamples: samples[stableReleaseId],
    candidateSamples: samples[candidateReleaseId],
    stableKeys: keys[stableReleaseId],
    candidateKeys: keys[candidateReleaseId],
    requestsPerKey: repeats,
    keysTested: generatedKeys.size,
  };
  if (report.decision !== 'PASS') {
    throw new Error(
      `Affinity smoke did not reach the sample floor (stable ${report.stableSamples}, candidate ${report.candidateSamples}).`,
    );
  }
  return report;
}

function jsonFile(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function main(args) {
  const [command, ...values] = args;
  if (command === 'plan') {
    const [deploymentsPath, versionsPath, candidateReleaseId] = values;
    return planAffinityTest({
      deployments: jsonFile(deploymentsPath),
      versions: jsonFile(versionsPath),
      candidateReleaseId,
    });
  }
  if (command === 'verify-held') {
    const [deploymentsPath, stableVersionId, candidateVersionId] = values;
    return verifyHeldDeployment({
      deployments: jsonFile(deploymentsPath),
      stableVersionId,
      candidateVersionId,
    });
  }
  if (command === 'verify-split') {
    const [deploymentsPath, stableVersionId, candidateVersionId] = values;
    return verifyAffinitySplit({
      deployments: jsonFile(deploymentsPath),
      stableVersionId,
      candidateVersionId,
    });
  }
  if (command === 'restore-plan') {
    const [deploymentsPath, previousDeploymentId, stableVersionId, candidateVersionId] = values;
    return planAffinityRestore({
      deployments: jsonFile(deploymentsPath),
      previousDeploymentId,
      stableVersionId,
      candidateVersionId,
    });
  }
  if (command === 'verify-restored') {
    const [deploymentsPath, stableVersionId] = values;
    return verifyAffinityRestore({ deployments: jsonFile(deploymentsPath), stableVersionId });
  }
  if (command === 'smoke') {
    const { values: options } = parseArgs({
      args: values,
      options: {
        origin: { type: 'string' },
        'stable-release': { type: 'string' },
        'candidate-release': { type: 'string' },
      },
      strict: true,
    });
    return runAffinitySmoke({
      origin: options.origin ?? '',
      stableReleaseId: options['stable-release'] ?? '',
      candidateReleaseId: options['candidate-release'] ?? '',
    });
  }
  throw new Error(
    'Expected plan, verify-held, verify-split, restore-plan, verify-restored, or smoke.',
  );
}

if (process.argv[1]?.endsWith('worker-affinity-smoke.mjs')) {
  try {
    process.stdout.write(`${JSON.stringify(await main(process.argv.slice(2)), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Worker affinity smoke failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
