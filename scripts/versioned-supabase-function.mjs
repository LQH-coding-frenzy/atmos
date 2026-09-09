import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitShaForEnvironment, releaseIdFromGitSha } from './release-id.mjs';

const releaseIdPattern = /^[0-9a-f]{12}$/;

export function versionedFunctionName(releaseId) {
  if (!releaseIdPattern.test(releaseId)) {
    throw new Error('Versioned function requires a 12-character release ID.');
  }
  return `api-${releaseId}`;
}

export function versionedFunctionSource(releaseId) {
  const functionName = versionedFunctionName(releaseId);
  return `import { app } from '../api-v1/index.ts';

const releaseId = '${releaseId}';
const releasePrefix = '/${functionName}';

Deno.serve((request) => {
  const url = new URL(request.url);
  if (url.pathname !== releasePrefix && !url.pathname.startsWith(\`${'${releasePrefix}'}/\`)) {
    return new Response('Not Found', { status: 404 });
  }
  url.pathname = \`/api-v1${'${url.pathname.slice(releasePrefix.length)}'}\`;
  return app.fetch(new Request(url, request), {
    CORS_ORIGIN: Deno.env.get('CORS_ORIGIN'),
    RELEASE_ID: releaseId,
  });
});
`;
}

export function stageVersionedFunction(releaseId, repositoryRoot) {
  const functionName = versionedFunctionName(releaseId);
  const targetDirectory = resolve(repositoryRoot, 'supabase', 'functions', functionName);
  const targetFile = resolve(targetDirectory, 'index.ts');
  const source = versionedFunctionSource(releaseId);
  if (existsSync(targetFile)) {
    if (readFileSync(targetFile, 'utf8') !== source) {
      throw new Error(`Refusing to overwrite unexpected source at ${targetFile}.`);
    }
    return { functionName, targetFile };
  }
  mkdirSync(targetDirectory, { recursive: false });
  writeFileSync(targetFile, source, 'utf8');
  return { functionName, targetFile };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).some((argument) => argument !== '--')) {
      throw new Error('Release ID overrides are not allowed; use the current full Git SHA.');
    }
    const releaseId = releaseIdFromGitSha(gitShaForEnvironment());
    const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    process.stdout.write(`${stageVersionedFunction(releaseId, repositoryRoot).functionName}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Function staging failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
