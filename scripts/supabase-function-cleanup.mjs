import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const releasePattern = /^[0-9a-f]{12}$/;
const releaseFunctionPattern = /^api-([0-9a-f]{12})$/;
const wranglerVersionListLimit = 10;
const productionProjectRef = 'oxgwprvkotfvyacpqayx';
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const execFileAsync = promisify(execFile);

function inventory(value, label) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} is empty.`);
  return value;
}

function unique(values, label) {
  const result = new Set(values);
  if (result.size !== values.length) throw new Error(`${label} contains duplicates.`);
  return result;
}

function workerRelease(version) {
  if (!uuidPattern.test(version?.id ?? '')) throw new Error('Worker version ID is invalid.');
  const release = version?.annotations?.['workers/tag'];
  if (!releasePattern.test(release ?? '')) {
    throw new Error(`Worker version ${version.id} has no canonical release tag.`);
  }
  return release;
}

export function evaluateFunctionCleanup({ deployments, versions, functions }) {
  const workerVersions = inventory(versions, 'Worker version inventory');
  if (workerVersions.length >= wranglerVersionListLimit) {
    throw new Error('Worker version inventory may be truncated by Wrangler; cleanup is blocked.');
  }
  const workerVersionIds = unique(
    workerVersions.map((version) => version?.id),
    'Worker version inventory',
  );
  const releases = new Set(workerVersions.map(workerRelease));
  if (releases.size < 3) {
    throw new Error('At least three retained Worker releases are required before cleanup.');
  }

  for (const deployment of inventory(deployments, 'Worker deployment inventory')) {
    if (!uuidPattern.test(deployment?.id ?? '') || !Array.isArray(deployment?.versions)) {
      throw new Error('Worker deployment record is invalid.');
    }
    for (const deployedVersion of deployment.versions) {
      if (!workerVersionIds.has(deployedVersion?.version_id)) {
        throw new Error('A deployed Worker version is missing from the version inventory.');
      }
      if (
        typeof deployedVersion.percentage !== 'number' ||
        deployedVersion.percentage < 0 ||
        deployedVersion.percentage > 100
      ) {
        throw new Error('Worker deployment percentage is invalid.');
      }
    }
  }

  const edgeFunctions = inventory(functions, 'Supabase function inventory');
  unique(
    edgeFunctions.map((functionRecord) => functionRecord?.slug),
    'Supabase function inventory',
  );
  const protectedFunctions = new Set([
    'api-v1',
    ...[...releases].map((release) => `api-${release}`),
  ]);

  for (const functionName of protectedFunctions) {
    const functionRecord = edgeFunctions.find((candidate) => candidate?.slug === functionName);
    if (!functionRecord || functionRecord.status !== 'ACTIVE') {
      throw new Error(`Protected function ${functionName} is not active.`);
    }
  }

  const candidates = [];
  const ignoredFunctions = [];
  for (const functionRecord of edgeFunctions) {
    const functionName = functionRecord?.slug;
    if (typeof functionName !== 'string' || typeof functionRecord?.status !== 'string') {
      throw new Error('Supabase function record is invalid.');
    }
    if (protectedFunctions.has(functionName)) continue;
    if (!releaseFunctionPattern.test(functionName)) {
      ignoredFunctions.push(functionName);
      continue;
    }
    if (functionRecord.status !== 'ACTIVE') {
      throw new Error(`Release function ${functionName} is not active.`);
    }
    candidates.push(functionName);
  }

  return {
    protectedFunctions: [...protectedFunctions].sort(),
    candidates: candidates.sort(),
    ignoredFunctions: ignoredFunctions.sort(),
    retainedWorkerReleases: [...releases].sort(),
  };
}

export function authorizeFunctionDeletion(plan, functionName, confirmation) {
  if (!releaseFunctionPattern.test(functionName)) {
    throw new Error('Deletion target is not a canonical release function.');
  }
  if (plan.protectedFunctions.includes(functionName)) {
    throw new Error('Deletion target is protected by retained release history.');
  }
  if (!plan.candidates.includes(functionName)) {
    throw new Error('Deletion target is not present in the fresh cleanup plan.');
  }
  if (confirmation !== `DELETE ${functionName}`) {
    throw new Error(`Deletion requires exact confirmation: DELETE ${functionName}`);
  }
  return { authorizedFunction: functionName };
}

async function runCorepack(args) {
  const packageManagerScript = process.env.npm_execpath;
  if (!packageManagerScript || args[0] !== 'pnpm') {
    throw new Error('Run live cleanup through the release:cleanup pnpm script.');
  }
  const { stdout } = await execFileAsync(
    process.execPath,
    [packageManagerScript, ...args.slice(1)],
    {
      cwd: repositoryRoot,
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  return stdout;
}

function parseProviderJson(value, label) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} did not return valid JSON.`);
  }
}

export async function liveFunctionCleanupPlan(runCommand = runCorepack) {
  const deployments = parseProviderJson(
    await runCommand([
      'pnpm',
      '--filter',
      '@atmos/gateway',
      'exec',
      'wrangler',
      'deployments',
      'list',
      '--env=',
      '--json',
    ]),
    'Worker deployment inventory',
  );
  const versions = parseProviderJson(
    await runCommand([
      'pnpm',
      '--filter',
      '@atmos/gateway',
      'exec',
      'wrangler',
      'versions',
      'list',
      '--env=',
      '--json',
    ]),
    'Worker version inventory',
  );
  const functions = parseProviderJson(
    await runCommand([
      'pnpm',
      'exec',
      'supabase',
      'functions',
      'list',
      '--project-ref',
      productionProjectRef,
      '--output',
      'json',
    ]),
    'Supabase function inventory',
  );
  return evaluateFunctionCleanup({ deployments, versions, functions });
}

export async function executeLiveFunctionCleanup({
  functionName,
  confirmation,
  runCommand = runCorepack,
}) {
  const plan = await liveFunctionCleanupPlan(runCommand);
  const authorization = authorizeFunctionDeletion(plan, functionName, confirmation);
  await runCommand([
    'pnpm',
    'exec',
    'supabase',
    'functions',
    'delete',
    authorization.authorizedFunction,
    '--project-ref',
    productionProjectRef,
    '--yes',
  ]);
  return authorization;
}

async function main(args) {
  const [command, functionName, confirmation] = args;
  if (command === 'plan') return liveFunctionCleanupPlan();
  if (command === 'execute') {
    return executeLiveFunctionCleanup({ functionName, confirmation });
  }
  throw new Error('Expected plan or execute command.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await main(process.argv.slice(2))));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Function cleanup validation failed.');
    process.exitCode = 1;
  }
}
