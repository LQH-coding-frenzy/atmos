import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bootstrapSingleOwner,
  parseBootstrapOwnerArguments,
  validateBootstrapConfiguration,
} from './bootstrap-owner.mjs';

const ownerId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const projectRef = 'atmosstaging12345678';

function adminFor(users) {
  const updateUserById = async () => ({ error: null });
  const listUsers = async ({ page }) => ({
    data: { users: page === 1 ? users : [] },
    error: null,
  });
  return { listUsers, updateUserById };
}

describe('bootstrap owner arguments and target validation', () => {
  it('requires a valid Auth UUID and explicit project ref, defaulting to dry-run', () => {
    assert.deepEqual(
      parseBootstrapOwnerArguments(['--user-id', ownerId, '--project-ref', projectRef]),
      { userId: ownerId, projectRef, apply: false },
    );
    assert.equal(
      parseBootstrapOwnerArguments([
        '--user-id',
        ownerId.toUpperCase(),
        '--project-ref',
        projectRef,
      ]).userId,
      ownerId,
    );
    assert.throws(() => parseBootstrapOwnerArguments(['--user-id', 'owner@example.test']));
    assert.throws(() =>
      parseBootstrapOwnerArguments(['--user-id', ownerId, '--project-ref', projectRef, '--admin']),
    );
  });

  it('requires a current secret key and an exact hosted project-ref match', () => {
    assert.equal(
      validateBootstrapConfiguration({
        supabaseUrl: `https://${projectRef}.supabase.co`,
        projectSecretKey: 'sb_secret_example',
        projectRef,
      }).hostname,
      `${projectRef}.supabase.co`,
    );
    assert.throws(() =>
      validateBootstrapConfiguration({
        supabaseUrl: `https://${projectRef}.supabase.co`,
        projectSecretKey: 'legacy-service-role',
        projectRef,
      }),
    );
    assert.throws(() =>
      validateBootstrapConfiguration({
        supabaseUrl: `https://${projectRef}.supabase.co?token=private`,
        projectSecretKey: 'sb_secret_example',
        projectRef,
      }),
    );
    assert.throws(() =>
      validateBootstrapConfiguration({
        supabaseUrl: `https://${projectRef}.supabase.co`,
        projectSecretKey: 'sb_secret_example',
        projectRef: 'otherproject12345678',
      }),
    );
  });
});

describe('single-owner Auth bootstrap', () => {
  it('does not change metadata by default and ignores user_metadata for authorization', async () => {
    let updateCalled = false;
    const admin = adminFor([
      {
        id: ownerId,
        app_metadata: { provider: 'google', providers: ['google'] },
        user_metadata: { atmos_role: 'owner' },
      },
    ]);
    admin.updateUserById = async () => {
      updateCalled = true;
      return { error: null };
    };

    assert.equal(await bootstrapSingleOwner(admin, ownerId), 'dry-run');
    assert.equal(updateCalled, false);
  });

  it('preserves existing app_metadata and assigns only the confirmed UUID when explicitly applied', async () => {
    let updateCall;
    const admin = adminFor([
      {
        id: ownerId,
        app_metadata: { provider: 'google', providers: ['google'] },
        user_metadata: { atmos_role: 'user' },
      },
    ]);
    admin.updateUserById = async (...args) => {
      updateCall = args;
      return { error: null };
    };

    assert.equal(await bootstrapSingleOwner(admin, ownerId, { apply: true }), 'assigned-owner');
    assert.deepEqual(updateCall, [
      ownerId,
      {
        app_metadata: { provider: 'google', providers: ['google'], atmos_role: 'owner' },
      },
    ]);
  });

  it('refuses a second owner, unsupported role values, and absent target users', async () => {
    await assert.rejects(
      bootstrapSingleOwner(
        adminFor([
          { id: userId, app_metadata: { atmos_role: 'owner' } },
          { id: ownerId, app_metadata: { atmos_role: 'user' } },
        ]),
        ownerId,
        { apply: true },
      ),
      /An owner is already assigned/,
    );
    await assert.rejects(
      bootstrapSingleOwner(
        adminFor([
          { id: userId, app_metadata: { atmos_role: 'owner' } },
          { id: ownerId, app_metadata: { atmos_role: 'owner' } },
        ]),
        ownerId,
      ),
      /More than one owner is already assigned/,
    );
    await assert.rejects(
      bootstrapSingleOwner(
        adminFor([{ id: userId, app_metadata: { atmos_role: 'admin' } }]),
        ownerId,
      ),
      /Unsupported application role metadata/,
    );
    await assert.rejects(bootstrapSingleOwner(adminFor([]), ownerId), /user was not found/);
  });

  it('is idempotent for an already assigned single owner', async () => {
    let updateCalled = false;
    const admin = adminFor([{ id: ownerId, app_metadata: { atmos_role: 'owner' } }]);
    admin.updateUserById = async () => {
      updateCalled = true;
      return { error: null };
    };

    assert.equal(await bootstrapSingleOwner(admin, ownerId, { apply: true }), 'already-owner');
    assert.equal(updateCalled, false);
  });
});
