import { describe, expect, it } from 'vitest';
import { isUuid, matchesInternalSecret } from './internal-request';

describe('matchesInternalSecret', () => {
  it('fails closed when either secret is missing or empty', () => {
    expect(matchesInternalSecret(undefined, undefined)).toBe(false);
    expect(matchesInternalSecret('configured-secret', undefined)).toBe(false);
    expect(matchesInternalSecret(undefined, 'provided-secret')).toBe(false);
    expect(matchesInternalSecret('', '')).toBe(false);
  });

  it('accepts only an exact configured secret', () => {
    expect(matchesInternalSecret('configured-secret', 'configured-secret')).toBe(true);
    expect(matchesInternalSecret('configured-secret', 'different-secret')).toBe(false);
  });
});

describe('isUuid', () => {
  it('accepts durable UUID references', () => {
    expect(isUuid('d9428888-122b-4e1f-b85c-6a4a35c36e89')).toBe(true);
  });

  it('rejects missing and malformed references', () => {
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid('event-1')).toBe(false);
  });
});
