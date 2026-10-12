import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateAccountDeletionRequest } from '../supabase/functions/_shared/account-deletion.mjs';

const now = Date.parse('2026-10-12T10:00:00.000Z');

describe('self-service account deletion confirmation', () => {
  it("accepts only the authenticated user's case-insensitive email and exact confirmation phrase", () => {
    assert.equal(
      validateAccountDeletionRequest({
        accountEmail: 'owner@example.test',
        confirmationEmail: ' Owner@Example.Test ',
        confirmationPhrase: 'DELETE',
        lastSignInAt: new Date(now - 30_000).toISOString(),
        now,
      }),
      null,
    );
    assert.equal(
      validateAccountDeletionRequest({
        accountEmail: 'owner@example.test',
        confirmationEmail: 'owner@example.test',
        confirmationPhrase: 'delete',
        lastSignInAt: new Date(now - 30_000).toISOString(),
        now,
      }),
      'confirmation-required',
    );
  });

  it('requires a recent valid Supabase sign-in before allowing permanent deletion', () => {
    for (const lastSignInAt of [
      undefined,
      'not-a-timestamp',
      new Date(now - 5 * 60_000 - 1).toISOString(),
      new Date(now + 2 * 60_000).toISOString(),
    ]) {
      assert.equal(
        validateAccountDeletionRequest({
          accountEmail: 'owner@example.test',
          confirmationEmail: 'owner@example.test',
          confirmationPhrase: 'DELETE',
          lastSignInAt,
          now,
        }),
        'reauthentication-required',
      );
    }
  });
});
