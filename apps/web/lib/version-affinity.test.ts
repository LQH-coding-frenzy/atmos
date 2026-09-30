import { afterEach, describe, expect, it, vi } from 'vitest';
import { getOrCreateAtmosVersionKey, versionAffinityHeaders } from './version-affinity';

afterEach(() => vi.unstubAllGlobals());

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial) values.set('atmos_version_key', initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe('version affinity key', () => {
  it('creates and persists a random key for a browser session', () => {
    const storage = memoryStorage();
    const uuid = '123e4567-e89b-42d3-a456-426614174000';
    const generated = getOrCreateAtmosVersionKey(storage, () => uuid);

    expect(generated).toBe(uuid);
    expect(storage.getItem('atmos_version_key')).toBe(uuid);
    expect(getOrCreateAtmosVersionKey(storage, () => 'failing-fallback')).toBe(uuid);
  });

  it('replaces invalid stored keys and does not include user identity', () => {
    const storage = memoryStorage('email@example.com');
    const uuid = '223e4567-e89b-42d3-a456-426614174000';
    expect(getOrCreateAtmosVersionKey(storage, () => uuid)).toBe(uuid);
    expect(storage.getItem('atmos_version_key')).toBe(uuid);
  });

  it('does not access browser storage during server rendering', () => {
    expect(versionAffinityHeaders()).toEqual({});
  });

  it('sends the same session key with browser gateway requests', () => {
    const storage = memoryStorage();
    vi.stubGlobal('window', { sessionStorage: storage });

    const first = versionAffinityHeaders();
    const second = versionAffinityHeaders();

    expect(first).toEqual(second);
    expect(first['X-Atmos-Version-Key']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
