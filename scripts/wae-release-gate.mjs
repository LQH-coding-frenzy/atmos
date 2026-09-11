import { appendFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const accountIdPattern = /^[0-9a-f]{32}$/;
const releaseIdPattern = /^[0-9a-f]{12}$/;
const versionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const datasetPattern = /^atmos_worker_requests(?:_staging)?$/;

function boundedInteger(value, name, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} through ${maximum}.`);
  }
  return parsed;
}

function validateIdentity(identity, name) {
  if (!versionIdPattern.test(identity.versionId)) {
    throw new Error(`${name} Worker version ID is invalid.`);
  }
  if (!releaseIdPattern.test(identity.releaseId)) {
    throw new Error(`${name} release ID is invalid.`);
  }
}

export function buildWaeQuery({ dataset, stable, candidate, lookbackMinutes }) {
  if (!datasetPattern.test(dataset)) throw new Error('WAE dataset is invalid.');
  validateIdentity(stable, 'Stable');
  validateIdentity(candidate, 'Candidate');
  const lookback = boundedInteger(lookbackMinutes, 'Lookback minutes', 1, 1_440);

  return `SELECT
  index1 AS worker_version_id,
  blob1 AS release_id,
  SUM(_sample_interval) AS weighted_sample_count,
  SUM(double2 * _sample_interval) / SUM(_sample_interval) AS error_rate,
  quantileExactWeighted(0.95)(double1, _sample_interval) AS p95_wall_ms
FROM ${dataset}
WHERE timestamp <= NOW()
  AND timestamp > NOW() - INTERVAL '${lookback}' MINUTE
  AND (
    (index1 = '${stable.versionId}' AND blob1 = '${stable.releaseId}')
    OR (index1 = '${candidate.versionId}' AND blob1 = '${candidate.releaseId}')
  )
GROUP BY worker_version_id, release_id
ORDER BY worker_version_id, release_id`;
}

function metric(value, name, maximum = Number.POSITIVE_INFINITY) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > maximum) {
    throw new Error(`Invalid ${name} metric.`);
  }
  return parsed;
}

function findMetrics(rows, identity) {
  const row = rows.find(
    (candidate) =>
      candidate.worker_version_id === identity.versionId &&
      candidate.release_id === identity.releaseId,
  );
  if (!row) return undefined;
  return {
    versionId: identity.versionId,
    releaseId: identity.releaseId,
    sampleCount: metric(row.weighted_sample_count, 'weighted sample count'),
    errorRate: metric(row.error_rate, 'error rate', 1),
    p95WallMs: metric(row.p95_wall_ms, 'p95 wall duration', 60_000),
  };
}

export function evaluateReleaseGate({ rows, stable, candidate, minimumSamples = 30 }) {
  validateIdentity(stable, 'Stable');
  validateIdentity(candidate, 'Candidate');
  if (stable.versionId === candidate.versionId || stable.releaseId === candidate.releaseId) {
    throw new Error('Stable and candidate identities must be distinct.');
  }
  const requiredSamples = boundedInteger(minimumSamples, 'Minimum samples', 1, 10_000);
  const stableMetrics = findMetrics(rows, stable);
  const candidateMetrics = findMetrics(rows, candidate);
  if (
    !stableMetrics ||
    !candidateMetrics ||
    stableMetrics.sampleCount < requiredSamples ||
    candidateMetrics.sampleCount < requiredSamples
  ) {
    return {
      decision: 'INSUFFICIENT_DATA',
      reason: `Both releases require at least ${requiredSamples} weighted samples.`,
      stable: stableMetrics,
      candidate: candidateMetrics,
    };
  }

  const errorRateLimit = Math.max(0.02, stableMetrics.errorRate + 0.01);
  const p95WallMsLimit = Math.max(2_500, stableMetrics.p95WallMs * 1.5);
  if (candidateMetrics.errorRate > errorRateLimit) {
    return {
      decision: 'FAIL',
      reason: 'Candidate error rate exceeds the stable-relative and absolute limit.',
      limits: { errorRate: errorRateLimit, p95WallMs: p95WallMsLimit },
      stable: stableMetrics,
      candidate: candidateMetrics,
    };
  }
  if (candidateMetrics.p95WallMs > p95WallMsLimit) {
    return {
      decision: 'FAIL',
      reason: 'Candidate p95 wall duration exceeds the stable-relative and absolute limit.',
      limits: { errorRate: errorRateLimit, p95WallMs: p95WallMsLimit },
      stable: stableMetrics,
      candidate: candidateMetrics,
    };
  }
  return {
    decision: 'PASS',
    reason: 'Candidate weighted error rate and p95 wall duration are within limits.',
    limits: { errorRate: errorRateLimit, p95WallMs: p95WallMsLimit },
    stable: stableMetrics,
    candidate: candidateMetrics,
  };
}

export function rowsFromWaeResponse(payload) {
  const rows = payload?.data ?? payload?.result;
  if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== 'object')) {
    throw new Error('WAE SQL response does not contain metric rows.');
  }
  return rows;
}

export async function queryWae({ accountId, token, query, fetcher = fetch }) {
  if (!accountIdPattern.test(accountId)) throw new Error('Cloudflare account ID is invalid.');
  if (!token) throw new Error('Cloudflare Analytics token is required.');
  const response = await fetcher(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'text/plain' },
      body: query,
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => undefined);
    const codes = Array.isArray(payload?.errors)
      ? payload.errors
          .map((error) => error?.code)
          .filter((code) => Number.isInteger(code))
          .join(',')
      : '';
    throw new Error(
      `WAE SQL query failed with HTTP ${response.status}${codes ? ` (Cloudflare codes ${codes})` : ''}.`,
    );
  }
  return rowsFromWaeResponse(await response.json());
}

function stepSummary(report) {
  const percent = (value) => `${(value * 100).toFixed(3)}%`;
  return [
    '## WAE release gate',
    '',
    `**Decision:** ${report.decision}`,
    '',
    report.reason,
    '',
    '| Release | Weighted samples | Error rate | p95 wall |',
    '|---|---:|---:|---:|',
    `| Stable | ${report.stable?.sampleCount ?? 0} | ${percent(report.stable?.errorRate ?? 0)} | ${report.stable?.p95WallMs ?? 0} ms |`,
    `| Candidate | ${report.candidate?.sampleCount ?? 0} | ${percent(report.candidate?.errorRate ?? 0)} | ${report.candidate?.p95WallMs ?? 0} ms |`,
    '',
  ].join('\n');
}

if (process.argv[1]?.endsWith('wae-release-gate.mjs')) {
  try {
    const { values } = parseArgs({
      options: {
        dataset: { type: 'string' },
        'stable-version': { type: 'string' },
        'stable-release': { type: 'string' },
        'candidate-version': { type: 'string' },
        'candidate-release': { type: 'string' },
        'lookback-minutes': { type: 'string', default: '60' },
        'minimum-samples': { type: 'string', default: '30' },
      },
      strict: true,
    });
    const stable = {
      versionId: values['stable-version'] ?? '',
      releaseId: values['stable-release'] ?? '',
    };
    const candidate = {
      versionId: values['candidate-version'] ?? '',
      releaseId: values['candidate-release'] ?? '',
    };
    const query = buildWaeQuery({
      dataset: values.dataset ?? '',
      stable,
      candidate,
      lookbackMinutes: values['lookback-minutes'],
    });
    const rows = await queryWae({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
      token: process.env.CLOUDFLARE_ANALYTICS_TOKEN ?? '',
      query,
    });
    const report = evaluateReleaseGate({
      rows,
      stable,
      candidate,
      minimumSamples: values['minimum-samples'],
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, stepSummary(report), 'utf8');
    }
    if (report.decision === 'FAIL') process.exitCode = 2;
    if (report.decision === 'INSUFFICIENT_DATA') process.exitCode = 3;
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'WAE release gate failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
