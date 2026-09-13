import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../.github/workflows/release-containers.yml', import.meta.url),
  'utf8',
);

test('limits GHCR writes to protected main', () => {
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /publish:\n\s+if: github\.event_name != 'pull_request'/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /publish:[\s\S]*?needs: validate/);
  assert.equal(workflow.match(/packages: write/g)?.length, 1);
  assert.match(workflow, /password: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
  assert.doesNotMatch(workflow, /PERSONAL_ACCESS_TOKEN|GHCR_TOKEN|packages: admin/);
});

test('publishes one non-mutable full revision tag and verifies its digest', () => {
  assert.match(workflow, /flavor: latest=false/);
  assert.match(workflow, /tags: type=sha,format=long,prefix=sha-/);
  assert.equal(workflow.match(/tags: type=/g)?.length, 1);
  assert.doesNotMatch(workflow, /type=(raw|ref|semver|pep440|match|edge|schedule)/);
  assert.match(workflow, /The immutable Git SHA tag already exists; refusing to overwrite it/);
  assert.match(workflow, /\^sha256:\[0-9a-f\]\{64\}\$/);
  assert.match(workflow, /imagetools inspect "\$IMAGE_TAG@\$DIGEST"/);
  assert.match(workflow, /provenance: false/);
});

test('pins every action and links the package to its source revision', () => {
  const actionReferences = [...workflow.matchAll(/uses: [^\s@]+@([^\s]+)/g)].map(
    (match) => match[1],
  );
  assert.ok(actionReferences.length >= 4);
  assert.ok(actionReferences.every((reference) => /^[0-9a-f]{40}$/.test(reference)));
  assert.match(workflow, /org\.opencontainers\.image\.source=/);
  assert.match(workflow, /org\.opencontainers\.image\.revision=/);
  assert.match(workflow, /persist-credentials: false/g);
});
