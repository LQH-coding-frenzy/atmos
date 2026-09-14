import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCycloneDxSbom } from './container-supply-chain.mjs';

const validSbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.6',
  metadata: {
    component: {
      type: 'container',
      name: 'ghcr.io/lqh-coding-frenzy/atmos-jobs',
    },
  },
  components: [{ type: 'library', name: 'node', version: '24.14.1' }],
};

test('accepts a populated CycloneDX container SBOM', () => {
  assert.equal(validateCycloneDxSbom(validSbom), validSbom);
});

test('rejects incomplete or non-container SBOMs', () => {
  for (const sbom of [
    undefined,
    { ...validSbom, bomFormat: 'SPDX' },
    { ...validSbom, specVersion: '1.3' },
    { ...validSbom, metadata: { component: { type: 'library', name: 'node' } } },
    { ...validSbom, components: [] },
  ]) {
    assert.throws(() => validateCycloneDxSbom(sbom));
  }
});
