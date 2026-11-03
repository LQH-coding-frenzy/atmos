import { appendFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const GRAPHQL_ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';
const WORKER_NAME = 'atmos-gateway';
const CPU_BUDGET_MS = 7;
const MINIMUM_REQUESTS = 30;
const LOOKBACK_MINUTES_MIN = 1;
const LOOKBACK_MINUTES_MAX = 1_440;
const DATA_LAG_MINUTES = 10;
const accountIdPattern = /^[0-9a-f]{32}$/i;
const versionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function boundedInteger(value, name, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} through ${maximum}.`);
  }
  return parsed;
}

function validateAccountId(accountId) {
  if (!accountIdPattern.test(accountId)) throw new Error('Cloudflare account ID is invalid.');
}

function validateVersionId(versionId) {
  if (!versionIdPattern.test(versionId)) throw new Error('Worker version ID is invalid.');
}

function canonicalTimestamp(value, name) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`${name} must be a canonical UTC timestamp.`);
  }
  return parsed;
}

export function buildWorkerCpuQuery({ accountId, versionId, start, end }) {
  validateAccountId(accountId);
  validateVersionId(versionId);
  const startTime = canonicalTimestamp(start, 'Window start');
  const endTime = canonicalTimestamp(end, 'Window end');
  if (startTime >= endTime) throw new Error('Window start must be before window end.');
  if (endTime.getTime() - startTime.getTime() > LOOKBACK_MINUTES_MAX * 60_000) {
    throw new Error('CPU snapshot window cannot exceed 1440 minutes.');
  }

  return `query WorkerCpuSnapshot {
  viewer {
    accounts(filter: { accountTag: "${accountId}" }) {
      workersInvocationsAdaptive(
        limit: 1,
        filter: {
          datetime_geq: "${start}",
          datetime_leq: "${end}",
          scriptName: "${WORKER_NAME}",
          scriptVersion_in: ["${versionId}"],
          isPreview: 0
        }
      ) {
        sum {
          requests
          errors
        }
        quantiles {
          cpuTimeP50
          cpuTimeP95
          cpuTimeP99
        }
      }
    }
  }
}`;
}

export function boundedWindow(now, lookbackMinutes) {
  const lookback = boundedInteger(
    lookbackMinutes,
    'Lookback minutes',
    LOOKBACK_MINUTES_MIN,
    LOOKBACK_MINUTES_MAX,
  );
  const nowDate = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(nowDate.getTime())) throw new Error('Snapshot time is invalid.');

  const end = new Date(nowDate.getTime() - DATA_LAG_MINUTES * 60_000);
  const start = new Date(end.getTime() - lookback * 60_000);
  return { start: start.toISOString(), end: end.toISOString(), lookbackMinutes: lookback };
}

function safeErrorCodes(errors) {
  return Array.isArray(errors)
    ? errors
        .map((error) => error?.code)
        .filter((code) => Number.isInteger(code))
        .join(',')
    : '';
}

export async function queryWorkerCpu({ accountId, token, versionId, start, end, fetcher = fetch }) {
  validateAccountId(accountId);
  if (!token) throw new Error('Cloudflare Analytics token is required.');
  const query = buildWorkerCpuQuery({ accountId, versionId, start, end });

  const response = await fetcher(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok) {
    const codes = safeErrorCodes(payload?.errors);
    throw new Error(
      `Cloudflare Workers Analytics GraphQL failed with HTTP ${response.status}${codes ? ` (Cloudflare codes ${codes})` : ''}.`,
    );
  }
  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    const codes = safeErrorCodes(payload.errors);
    throw new Error(
      `Cloudflare Workers Analytics GraphQL returned errors${codes ? ` (Cloudflare codes ${codes})` : ''}.`,
    );
  }
  return payload;
}

export function rowsFromWorkerCpuResponse(payload) {
  const accounts = payload?.data?.viewer?.accounts;
  if (!Array.isArray(accounts) || accounts.length !== 1) {
    throw new Error('Workers Analytics response did not contain exactly one account.');
  }
  const rows = accounts[0]?.workersInvocationsAdaptive;
  if (!Array.isArray(rows)) {
    throw new Error('Workers Analytics response did not contain invocation metrics.');
  }
  if (rows.length > 1) throw new Error('Workers Analytics returned an ambiguous aggregate.');
  return rows;
}

function metric(value, name, maximum = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > maximum) {
    throw new Error(`Workers Analytics returned an invalid ${name} metric.`);
  }
  return value;
}

function toMilliseconds(microseconds, name) {
  return Number((metric(microseconds, name, 60_000_000) / 1_000).toFixed(3));
}

function reportForNoData({ versionId, window, checkedAt }) {
  return {
    decision: 'INSUFFICIENT_DATA',
    reason: 'No natural Worker requests were returned for this exact version and time window.',
    workerName: WORKER_NAME,
    versionId,
    window,
    checkedAt,
    minimumRequests: MINIMUM_REQUESTS,
    metrics: null,
  };
}

export function evaluateWorkerCpuSnapshot({ rows, versionId, window, checkedAt }) {
  if (!Array.isArray(rows)) throw new Error('Workers Analytics rows must be an array.');
  if (rows.length === 0) return reportForNoData({ versionId, window, checkedAt });
  if (rows.length !== 1) throw new Error('Workers Analytics returned an ambiguous aggregate.');

  const row = rows[0];
  const requestCount = metric(row?.sum?.requests, 'request count');
  const errors = metric(row?.sum?.errors, 'error count', requestCount);
  const rawQuantiles = [
    row?.quantiles?.cpuTimeP50,
    row?.quantiles?.cpuTimeP95,
    row?.quantiles?.cpuTimeP99,
  ];
  const quantilesAvailable = rawQuantiles.every(
    (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0,
  );
  if (requestCount < MINIMUM_REQUESTS || !quantilesAvailable) {
    const reason =
      requestCount < MINIMUM_REQUESTS
        ? `Only ${requestCount} natural requests were sampled; at least ${MINIMUM_REQUESTS} are required.`
        : 'Cloudflare did not return all CPU quantiles for this sample.';
    return {
      decision: 'INSUFFICIENT_DATA',
      reason,
      workerName: WORKER_NAME,
      versionId,
      window,
      checkedAt,
      minimumRequests: MINIMUM_REQUESTS,
      cpuBudgetMs: CPU_BUDGET_MS,
      metrics: { requests: requestCount, errors, cpuTimeMs: null },
    };
  }

  const cpuTimeMs = {
    p50: toMilliseconds(rawQuantiles[0], 'CPU p50'),
    p95: toMilliseconds(rawQuantiles[1], 'CPU p95'),
    p99: toMilliseconds(rawQuantiles[2], 'CPU p99'),
  };

  if (cpuTimeMs.p50 > cpuTimeMs.p95 || cpuTimeMs.p95 > cpuTimeMs.p99) {
    throw new Error('Workers Analytics returned inconsistent CPU quantiles.');
  }

  let decision = 'PASS';
  let reason =
    'At least 30 natural requests were sampled, with zero errors and CPU p95 at or below 7 ms.';
  if (errors > 0 || cpuTimeMs.p95 > CPU_BUDGET_MS) {
    decision = 'HOLD';
    reason =
      errors > 0
        ? 'The exact-version sample contains Worker invocation errors.'
        : `CPU p95 exceeds the ${CPU_BUDGET_MS} ms internal budget.`;
  }

  return {
    decision,
    reason,
    workerName: WORKER_NAME,
    versionId,
    window,
    checkedAt,
    minimumRequests: MINIMUM_REQUESTS,
    cpuBudgetMs: CPU_BUDGET_MS,
    metrics: { requests: requestCount, errors, cpuTimeMs },
  };
}

export async function createWorkerCpuSnapshot({
  accountId,
  token,
  versionId,
  lookbackMinutes = 60,
  now = new Date(),
  fetcher = fetch,
}) {
  validateAccountId(accountId);
  validateVersionId(versionId);
  const window = boundedWindow(now, lookbackMinutes);
  const checkedAt = new Date(now).toISOString();
  const payload = await queryWorkerCpu({ accountId, token, versionId, ...window, fetcher });
  const rows = rowsFromWorkerCpuResponse(payload);
  return evaluateWorkerCpuSnapshot({ rows, versionId, window, checkedAt });
}

export function markdownSummary(report) {
  const metrics = report.metrics
    ? [
        `| Natural requests | ${report.metrics.requests} |`,
        `| Errors | ${report.metrics.errors} |`,
        report.metrics.cpuTimeMs
          ? `| CPU p50 / p95 / p99 | ${report.metrics.cpuTimeMs.p50} / ${report.metrics.cpuTimeMs.p95} / ${report.metrics.cpuTimeMs.p99} ms |`
          : '| CPU quantiles | unavailable |',
      ].join('\n')
    : '| Natural requests | 0 |\n| CPU quantiles | unavailable |';
  return [
    '## Read-only Worker CPU snapshot',
    '',
    `**Result:** ${report.decision}`,
    '',
    report.reason,
    '',
    `- Worker/version: ${report.workerName} / ${report.versionId}`,
    `- UTC window: ${report.window.start} to ${report.window.end}`,
    `- Minimum natural requests: ${report.minimumRequests}`,
    '',
    '| Metric | Value |',
    '|---|---:|',
    metrics,
    '',
    'This read-only snapshot generates no Worker or provider requests and does not authorize traffic changes.',
    '',
  ].join('\n');
}

async function main() {
  const { values } = parseArgs({
    options: {
      'version-id': { type: 'string' },
      'lookback-minutes': { type: 'string', default: '60' },
    },
    strict: true,
  });
  const versionId = values['version-id'] ?? process.env.WORKER_VERSION_ID ?? '';
  const lookbackMinutes = values['lookback-minutes'] ?? process.env.LOOKBACK_MINUTES ?? '60';
  const report = await createWorkerCpuSnapshot({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
    token: process.env.CLOUDFLARE_ANALYTICS_TOKEN ?? '',
    versionId,
    lookbackMinutes,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdownSummary(report), 'utf8');
  }
}

if (process.argv[1]?.endsWith('worker-cpu-snapshot.mjs')) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Worker CPU snapshot failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
