import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../.github/workflows/verify-container-supply-chain.yml', import.meta.url),
  'utf8',
);

test('accepts only an exact digest from reusable or manually dispatched callers', () => {
  assert.match(workflow, /workflow_call:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.equal(workflow.match(/image_digest:/g)?.length, 2);
  assert.match(workflow, /\^sha256:\[0-9a-f\]\{64\}\$/);
  assert.match(workflow, /IMAGE_DIGEST="\$IMAGE@\$DIGEST"/);
  assert.match(workflow, /docker pull "\$IMAGE_DIGEST"/);
  assert.doesNotMatch(workflow, /image_tag|latest|:sha-/);
});

test('ties the exact image revision to the protected GitHub Actions signer identity', () => {
  assert.match(workflow, /EXPECTED_SOURCE: https:\/\/github\.com\/LQH-coding-frenzy\/atmos/);
  assert.match(workflow, /EXPECTED_REPOSITORY: LQH-coding-frenzy\/atmos/);
  assert.match(workflow, /EXPECTED_REF: refs\/heads\/main/);
  assert.match(
    workflow,
    /CERTIFICATE_IDENTITY: https:\/\/github\.com\/LQH-coding-frenzy\/atmos\/\.github\/workflows\/release-containers\.yml@refs\/heads\/main/,
  );
  assert.match(
    workflow,
    /CERTIFICATE_OIDC_ISSUER: https:\/\/token\.actions\.githubusercontent\.com/,
  );
  assert.match(workflow, /test "\$SOURCE" = "\$EXPECTED_SOURCE"/);
  assert.match(workflow, /\^\[0-9a-f\]\{40\}\$/);
  assert.equal(workflow.match(/--certificate-github-workflow-sha "\$REVISION"/g)?.length, 2);
});

test('verifies the signature and CycloneDX attestation without deployment credentials or bypasses', () => {
  const actionReferences = [...workflow.matchAll(/uses: [^\s@]+@([^\s]+)/g)].map(
    (match) => match[1],
  );

  assert.deepEqual(actionReferences, ['6f9f17788090df1f26f669e9d70d6ae9567deba6']);
  assert.match(workflow, /cosign-release: v3\.0\.6/);
  assert.match(workflow, /cosign verify \\/);
  assert.match(workflow, /cosign verify-attestation \\/);
  assert.match(workflow, /--type cyclonedx/);
  assert.equal(workflow.match(/--certificate-identity "\$CERTIFICATE_IDENTITY"/g)?.length, 2);
  assert.equal(workflow.match(/--certificate-oidc-issuer "\$CERTIFICATE_OIDC_ISSUER"/g)?.length, 2);
  assert.equal(workflow.match(/id-token: write|packages: write|secrets\./g)?.length ?? 0, 0);
  assert.doesNotMatch(workflow, /--insecure|--key\b|continue-on-error|cosign sign|cosign attest/);
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/);
});
