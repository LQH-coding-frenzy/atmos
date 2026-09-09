import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const fullGitShaPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

export function releaseIdFromGitSha(value) {
  const gitSha = value.trim().toLowerCase();
  if (!fullGitShaPattern.test(gitSha)) {
    throw new Error('Release identity requires a full hexadecimal Git SHA.');
  }
  return gitSha.slice(0, 12);
}

export function gitShaForEnvironment(environment = process.env) {
  const providerGitSha = environment.GITHUB_SHA ?? environment.VERCEL_GIT_COMMIT_SHA;
  if (providerGitSha) return providerGitSha;
  return execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { encoding: 'utf8' }).trim();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${releaseIdFromGitSha(gitShaForEnvironment())}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Release identity failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
