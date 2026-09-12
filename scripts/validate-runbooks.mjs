import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const requiredRunbooks = [
  'high-api-error-rate.md',
  'high-api-latency.md',
  'weather-provider-outage.md',
  'worker-cpu-limit.md',
  'supabase-project-paused.md',
  'supabase-function-failure.md',
  'rls-authorization-incident.md',
  'queue-backlog.md',
  'notification-dlq.md',
  'failed-worker-canary.md',
  'worker-analytics-gate-insufficient-data.md',
  'supabase-dependency-synthetic-failure.md',
  'vercel-rollback.md',
  'azure-job-failure.md',
  'azure-student-credit-exhaustion.md',
  'backup-failure.md',
  'restore-database.md',
  'stale-backup.md',
  'r2-access-incident.md',
  'credential-rotation.md',
  'third-party-platform-outage.md',
];

export const requiredSections = [
  'Summary',
  'User impact',
  'Detection',
  'Relevant dashboards/logs',
  'Immediate mitigation',
  'Diagnosis',
  'Recovery',
  'Rollback',
  'Security considerations',
  'Escalation',
  'Evidence to preserve',
  'Post-incident follow-up',
];

async function validateRunbook(filePath) {
  const content = await readFile(filePath, 'utf8');
  const headings = [...content.matchAll(/^## (.+)$/gm)].map((match) => match[1]);

  if (JSON.stringify(headings) !== JSON.stringify(requiredSections)) {
    throw new Error(`${path.basename(filePath)} does not contain the required sections in order.`);
  }

  if (/\b(?:TODO|TBD)\b/.test(content)) {
    throw new Error(`${path.basename(filePath)} contains an unresolved placeholder.`);
  }

  for (let index = 0; index < requiredSections.length; index += 1) {
    const start =
      content.indexOf(`## ${requiredSections[index]}`) + requiredSections[index].length + 3;
    const next = requiredSections[index + 1];
    const end = next ? content.indexOf(`## ${next}`, start) : content.length;
    if (!content.slice(start, end).trim()) {
      throw new Error(
        `${path.basename(filePath)} has an empty ${requiredSections[index]} section.`,
      );
    }
  }
}

export async function validateRunbooks(rootDirectory) {
  const runbookDirectory = path.join(rootDirectory, 'docs', 'runbooks');
  await stat(runbookDirectory);
  await Promise.all(
    requiredRunbooks.map((runbook) => validateRunbook(path.join(runbookDirectory, runbook))),
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  await validateRunbooks(repositoryRoot);
  console.log(`Validated ${requiredRunbooks.length} required runbooks.`);
}
