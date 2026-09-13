import path from 'node:path';
import { fileURLToPath } from 'node:url';

const jobIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const releaseIdPattern = /^[0-9a-f]{12}$/;

export function jobEvents(environment) {
  const jobId = environment.ATMOS_JOB_ID;
  const releaseId = environment.ATMOS_RELEASE_ID;
  if (!jobIdPattern.test(jobId ?? '') || !releaseIdPattern.test(releaseId ?? '')) {
    throw new Error('Invalid job runtime configuration.');
  }

  const identity = { job_id: jobId, release_id: releaseId, job_type: 'runtime-probe' };
  return [
    { event: 'job_started', status: 'running', ...identity },
    { event: 'job_completed', status: 'ok', ...identity },
  ];
}

function main() {
  try {
    for (const event of jobEvents(process.env)) console.log(JSON.stringify(event));
  } catch {
    console.error(JSON.stringify({ event: 'job_configuration_invalid', status: 'failed' }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
