import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [setupRestore, bootstrapBackup, edgeRelease] = await Promise.all(
  [
    '../.github/workflows/setup-ephemeral-restore-project.yml',
    '../.github/workflows/bootstrap-backup-secrets.yml',
    '../.github/workflows/release-edge-runtime.yml',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')),
);

test('gates ephemeral restore-project creation and cleans up failed handoffs', () => {
  assert.match(setupRestore, /confirmation:/);
  assert.match(setupRestore, /CREATE_EPHEMERAL_RESTORE_PROJECT/);
  assert.match(setupRestore, /environment: Production/);
  assert.match(setupRestore, /an ephemeral restore handoff is already active/);
  assert.match(setupRestore, /trap cleanup ERR/);
});

test('keeps the project-password-rotating bootstrap workflow disabled', () => {
  assert.match(bootstrapBackup, /if: \$\{\{ false \}\}/);
  assert.match(bootstrapBackup, /does not change the project-wide database password/);
});

test('verifies canonical API before Worker traffic promotion', () => {
  const canonical = edgeRelease.indexOf(
    'Update and verify the canonical Supabase API before traffic promotion',
  );
  const promote = edgeRelease.indexOf('Promote and verify the exact Worker candidate');
  assert.ok(canonical >= 0);
  assert.ok(promote > canonical);
});
