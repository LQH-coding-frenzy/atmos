import { describe, expect, it } from 'vitest';
import { appRoleFromMetadata } from './app-role.ts';

describe('trusted Auth application role', () => {
  it('recognizes only the owner value from app_metadata', () => {
    expect(appRoleFromMetadata({ atmos_role: 'owner' })).toBe('owner');
    expect(appRoleFromMetadata({ atmos_role: 'user' })).toBe('user');
    expect(appRoleFromMetadata({ atmos_role: 'admin' })).toBe('user');
  });

  it('fails closed to user when app_metadata has no valid role', () => {
    for (const value of [undefined, null, [], {}, { atmos_role: null }, { atmos_role: 7 }]) {
      expect(appRoleFromMetadata(value)).toBe('user');
    }
  });

  it('does not read a role nested in user_metadata', () => {
    expect(appRoleFromMetadata({ user_metadata: { atmos_role: 'owner' } })).toBe('user');
  });
});
