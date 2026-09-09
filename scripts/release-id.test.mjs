import assert from 'node:assert/strict';
import test from 'node:test';
import { gitShaForEnvironment, releaseIdFromGitSha } from './release-id.mjs';

test('normalizes a full Git SHA to a 12-character release ID', () => {
  assert.equal(releaseIdFromGitSha('A'.repeat(40)), 'aaaaaaaaaaaa');
  assert.equal(releaseIdFromGitSha(`  ${'b'.repeat(64)}\n`), 'bbbbbbbbbbbb');
});

test('rejects partial and non-hexadecimal source values', () => {
  assert.throws(() => releaseIdFromGitSha('a'.repeat(39)), /full hexadecimal Git SHA/);
  assert.throws(() => releaseIdFromGitSha('z'.repeat(40)), /full hexadecimal Git SHA/);
});

test('prefers protected GitHub metadata over Vercel metadata', () => {
  assert.equal(
    gitShaForEnvironment({
      GITHUB_SHA: '1'.repeat(40),
      VERCEL_GIT_COMMIT_SHA: '2'.repeat(40),
    }),
    '1'.repeat(40),
  );
});
