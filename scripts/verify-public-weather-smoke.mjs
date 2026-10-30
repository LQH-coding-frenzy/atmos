import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dashboardInput = {
  latitude: 52.52,
  longitude: 13.405,
  timezone: 'Europe/Berlin',
  units: 'metric',
};

const airQualityTimelineInput = {
  latitude: 52.52,
  longitude: 13.405,
  includeTimeline: true,
};

function responseHeadersFromCurlDump(value) {
  const lines = value.replaceAll('\r\n', '\n').split('\n');
  const responseStart = lines.findLastIndex((line) => /^HTTP\/\S+ \d{3}/.test(line));
  if (responseStart < 0) throw new Error('Smoke response omitted HTTP headers.');

  const headers = new Headers();
  for (const line of lines.slice(responseStart + 1)) {
    if (!line) break;
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  return headers;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function verifyPublicWeatherSmoke(resource, status, headerDump, bodyText) {
  if (resource !== 'dashboard' && resource !== 'air-quality') {
    throw new Error('Unknown public weather smoke resource.');
  }
  if (status !== 200) throw new Error(`${resource} smoke returned HTTP ${status}.`);

  const headers = responseHeadersFromCurlDump(headerDump);
  if (!headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new Error(`${resource} smoke returned an invalid content type.`);
  }
  if (headers.get('cache-control') !== 'no-store') {
    throw new Error(`${resource} smoke returned an invalid cache policy.`);
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(headers.get('x-request-id') ?? '')) {
    throw new Error(`${resource} smoke omitted a valid request ID.`);
  }

  const cacheStatus = headers.get('x-cache');
  if (cacheStatus !== 'HIT' && cacheStatus !== 'MISS') {
    throw new Error(`${resource} smoke did not return fresh cache data.`);
  }

  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    throw new Error(`${resource} smoke returned invalid JSON.`);
  }
  if (
    !isRecord(payload) ||
    !isRecord(payload.meta) ||
    payload.meta.provider !== 'open-meteo' ||
    payload.meta.cached !== (cacheStatus === 'HIT') ||
    payload.meta.stale !== false
  ) {
    throw new Error(`${resource} smoke response metadata did not match its cache headers.`);
  }

  if (resource === 'dashboard') {
    if (
      !isRecord(payload.location) ||
      !Number.isFinite(payload.location.latitude) ||
      !Number.isFinite(payload.location.longitude) ||
      !isRecord(payload.current) ||
      !Array.isArray(payload.hourly) ||
      payload.hourly.length === 0 ||
      !Array.isArray(payload.daily) ||
      payload.daily.length === 0
    ) {
      throw new Error('Dashboard smoke response did not match the public weather contract.');
    }
  } else if (
    !isRecord(payload.pollutants) ||
    !isRecord(payload.timeline) ||
    payload.timeline.kind !== 'model' ||
    !Array.isArray(payload.timeline.hours) ||
    payload.timeline.hours.length === 0
  ) {
    throw new Error('AQI smoke response did not match the public timeline contract.');
  }

  return cacheStatus;
}

function runRouteSmoke(deploymentUrl, bypass, resource, input, tempDirectory) {
  const route =
    resource === 'dashboard'
      ? '/api/public/v1/weather/dashboard'
      : '/api/public/v1/weather/air-quality';
  const inputPath = join(tempDirectory, `${resource}-request.json`);
  const headersPath = join(tempDirectory, `${resource}-headers.txt`);
  const outputPath = join(tempDirectory, `${resource}-response.json`);
  writeFileSync(inputPath, JSON.stringify(input));

  const response = spawnSync(
    'pnpm',
    [
      'dlx',
      'vercel@59.15.1',
      'curl',
      route,
      '--deployment',
      deploymentUrl,
      '--scope',
      process.env.VERCEL_SCOPE ?? '',
      '--protection-bypass',
      bypass,
      '--',
      '--connect-timeout',
      '10',
      '--max-time',
      '30',
      '--silent',
      '--show-error',
      '--request',
      'POST',
      '--header',
      `Origin: ${new URL(deploymentUrl).origin}`,
      '--header',
      'Content-Type: application/json',
      '--data-binary',
      `@${inputPath}`,
      '--dump-header',
      headersPath,
      '--output',
      outputPath,
      '--write-out',
      '%{http_code}',
    ],
    { encoding: 'utf8', timeout: 120_000 },
  );

  if (response.error || response.status !== 0) {
    throw new Error(`${resource} smoke request could not be completed by Vercel CLI.`);
  }
  const status = Number.parseInt(response.stdout.trim(), 10);
  if (!Number.isInteger(status)) throw new Error(`${resource} smoke returned no HTTP status.`);

  const cacheStatus = verifyPublicWeatherSmoke(
    resource,
    status,
    readFileSync(headersPath, 'utf8'),
    readFileSync(outputPath, 'utf8'),
  );
  process.stdout.write(`${resource} Route Handler smoke passed (cache=${cacheStatus}).\n`);
}

function main() {
  const deploymentUrl = process.env.DEPLOYMENT_URL;
  const bypass = process.env.VERCEL_PROTECTION_BYPASS;
  if (!deploymentUrl || !bypass) {
    throw new Error('Deployment URL and protection bypass are required for the smoke.');
  }
  const parsedDeploymentUrl = new URL(deploymentUrl);
  if (
    parsedDeploymentUrl.protocol !== 'https:' ||
    !parsedDeploymentUrl.hostname.endsWith('.vercel.app') ||
    parsedDeploymentUrl.pathname !== '/'
  ) {
    throw new Error('Smoke target must be the exact unaliased Vercel deployment URL.');
  }

  const tempDirectory = mkdtempSync(join(process.env.RUNNER_TEMP ?? tmpdir(), 'perf-002-weather-'));
  try {
    runRouteSmoke(deploymentUrl, bypass, 'dashboard', dashboardInput, tempDirectory);
    runRouteSmoke(deploymentUrl, bypass, 'air-quality', airQualityTimelineInput, tempDirectory);
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Public weather smoke failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
