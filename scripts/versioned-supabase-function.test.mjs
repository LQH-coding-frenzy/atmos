import assert from 'node:assert/strict';
import test from 'node:test';
import { versionedFunctionName, versionedFunctionSource } from './versioned-supabase-function.mjs';

test('creates a deterministic function name from the canonical release ID', () => {
  assert.equal(versionedFunctionName('abcdef012345'), 'api-abcdef012345');
  assert.throws(() => versionedFunctionName('ABCDEF012345'), /12-character release ID/);
  assert.throws(() => versionedFunctionName('abcdef0'), /12-character release ID/);
});

test('generates a secret-free wrapper for the exact release prefix', () => {
  const source = versionedFunctionSource('abcdef012345');

  assert.match(source, /const releaseId = 'abcdef012345'/);
  assert.match(source, /const releasePrefix = '\/api-abcdef012345'/);
  assert.match(source, /url\.pathname = `\/api-v1/);
  assert.doesNotMatch(source, /SUPABASE_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY/);
});
