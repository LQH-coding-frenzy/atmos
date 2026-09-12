import { parseArgs } from 'node:util';

export const expectedAtmosJobs = [
  'Atmos production frontend',
  'Atmos production edge',
  'Atmos candidate dependencies',
  'Atmos production weather',
];

export function buildSyntheticQuery() {
  return 'probe_success{job=~"Atmos.*"}';
}

function boundedInteger(value, name, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} through ${maximum}.`);
  }
  return parsed;
}

export function evaluateSyntheticGate({
  payload,
  expectedJobs = expectedAtmosJobs,
  maxAgeSeconds = 1_800,
  nowMs = Date.now(),
}) {
  const maximumAge = boundedInteger(maxAgeSeconds, 'Maximum sample age', 60, 86_400);
  const results = payload?.data?.result;
  if (payload?.status !== 'success' || !Array.isArray(results)) {
    throw new Error('Grafana query response does not contain metric results.');
  }

  const latestByJob = new Map();
  for (const result of results) {
    const job = result?.metric?.job;
    const timestamp = Number(result?.value?.[0]);
    const value = result?.value?.[1];
    if (
      typeof job !== 'string' ||
      !Number.isFinite(timestamp) ||
      timestamp <= 0 ||
      timestamp > nowMs / 1_000 + 60 ||
      typeof value !== 'string'
    ) {
      throw new Error('Grafana query response contains an invalid metric sample.');
    }
    const previous = latestByJob.get(job);
    if (!previous || timestamp > previous.timestamp) latestByJob.set(job, { timestamp, value });
  }

  const nowSeconds = nowMs / 1_000;
  const checks = expectedJobs.map((job) => {
    const sample = latestByJob.get(job);
    if (!sample) return { job, state: 'MISSING' };
    const ageSeconds = Math.max(0, Math.round(nowSeconds - sample.timestamp));
    return {
      job,
      state: ageSeconds > maximumAge ? 'STALE' : sample.value === '1' ? 'PASS' : 'FAIL',
      ageSeconds,
    };
  });

  if (checks.some((check) => check.state === 'FAIL')) {
    return { decision: 'FAIL', reason: 'At least one fresh Atmos synthetic is failing.', checks };
  }
  if (checks.some((check) => check.state === 'MISSING' || check.state === 'STALE')) {
    return {
      decision: 'INSUFFICIENT_DATA',
      reason: 'Every Atmos synthetic requires a recent metric sample.',
      checks,
    };
  }
  return { decision: 'PASS', reason: 'All Atmos synthetics are recent and successful.', checks };
}

export async function queryGrafana({ grafanaUrl, token, fetcher = fetch }) {
  let baseUrl;
  try {
    baseUrl = new URL(grafanaUrl);
  } catch {
    throw new Error('Grafana URL is invalid.');
  }
  if (baseUrl.protocol !== 'https:') throw new Error('Grafana URL must use HTTPS.');
  if (
    !baseUrl.hostname.endsWith('.grafana.net') ||
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.port
  ) {
    throw new Error('Grafana URL must be an uncredentialed Grafana Cloud origin.');
  }
  if (!token) throw new Error('Grafana service-account token is required.');

  const queryUrl = new URL('/api/datasources/proxy/uid/grafanacloud-prom/api/v1/query', baseUrl);
  queryUrl.searchParams.set('query', buildSyntheticQuery());
  const response = await fetcher(queryUrl, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Grafana query failed with HTTP ${response.status}.`);
  return response.json();
}

if (process.argv[1]?.endsWith('grafana-synthetic-gate.mjs')) {
  try {
    const { values } = parseArgs({
      options: {
        'max-age-seconds': { type: 'string', default: '1800' },
      },
      strict: true,
    });
    const payload = await queryGrafana({
      grafanaUrl: process.env.GRAFANA_URL ?? '',
      token: process.env.GRAFANA_SERVICE_ACCOUNT_TOKEN ?? '',
    });
    const report = evaluateSyntheticGate({
      payload,
      maxAgeSeconds: values['max-age-seconds'],
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.decision === 'FAIL') process.exitCode = 2;
    if (report.decision === 'INSUFFICIENT_DATA') process.exitCode = 3;
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Grafana synthetic gate failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
