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
  assert.match(workflow, /test "\$LOCAL_CONFIG_DIGEST" = "\$REMOTE_CONFIG_DIGEST"/);
});

test('pins every action and links the package to its source revision', () => {
  const actionReferences = [...workflow.matchAll(/uses: [^\s@]+@([^\s]+)/g)].map(
    (match) => match[1],
  );
  assert.ok(actionReferences.length >= 4);
  assert.ok(actionReferences.every((reference) => /^[0-9a-f]{40}$/.test(reference)));
  assert.match(workflow, /--build-arg SOURCE_URL=/);
  assert.match(workflow, /--build-arg REVISION=/);
  assert.match(workflow, /persist-credentials: false/g);
});

test('scans the exact image, retains a CycloneDX SBOM, and signs only immutable digests', () => {
  assert.equal(workflow.match(/scanners: vuln,secret,misconfig/g)?.length, 2);
  assert.equal(workflow.match(/severity: HIGH,CRITICAL/g)?.length, 2);
  assert.equal(workflow.match(/exit-code: '1'/g)?.length, 2);
  assert.equal(workflow.match(/ignore-unfixed: 'false'/g)?.length, 2);
  assert.match(workflow, /trivy image --scanners vuln --format cyclonedx --output/);
  assert.match(workflow, /container-supply-chain\.mjs validate-sbom/);
  assert.match(workflow, /name: atmos-jobs-sbom-\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /id-token: write/);
  assert.equal(workflow.match(/id-token: write/g)?.length, 1);
  assert.match(
    workflow,
    /sigstore\/cosign-installer@6f9f17788090df1f26f669e9d70d6ae9567deba6 # v4\.1\.2/,
  );
  assert.match(workflow, /cosign-release: v3\.0\.6/);
  assert.match(workflow, /IMAGE="\$\{IMAGE_TAG%:\*\}"/);
  assert.match(workflow, /IMAGE_DIGEST="\$IMAGE@\$DIGEST"/);
  assert.match(workflow, /cosign sign --yes "\$IMAGE_DIGEST"/);
  assert.match(
    workflow,
    /cosign attest --yes --type cyclonedx --predicate "\$SBOM_PATH" "\$IMAGE_DIGEST"/,
  );
  assert.doesNotMatch(workflow, /cosign (sign|attest).*--key\b/);
});
