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

  it('sends stable affinity keys and a fresh request ID with each browser request', () => {
    const storage = memoryStorage();
    vi.stubGlobal('window', { sessionStorage: storage });

    const uuids = [
      '11111111-2222-4333-8444-555555555555',
      'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      '123e4567-e89b-42d3-a456-426614174000',
      '223e4567-e89b-42d3-a456-426614174000',
    ];
    let nextUuid = 0;
    const createUuid = () => uuids[nextUuid++]!;
    const first = versionAffinityHeaders(createUuid);
    const second = versionAffinityHeaders(createUuid);

    expect(first['X-Atmos-Version-Key']).toBe(second['X-Atmos-Version-Key']);
    expect(first['Cloudflare-Workers-Version-Key']).toBe(first['X-Atmos-Version-Key']);
    expect(first['X-Atmos-Version-Key']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(first['X-Request-Id']).not.toBe(second['X-Request-Id']);
    expect(first['X-Request-Id']).toMatch(/^[0-9a-f-]{36}$/i);
    expect(second['X-Request-Id']).toMatch(/^[0-9a-f-]{36}$/i);
    expect(first.traceparent).toBe(
      `00-${uuids[0]!.replaceAll('-', '')}-${uuids[1]!.replaceAll('-', '').slice(-16)}-01`,
    );
    expect(second.traceparent).toBe(
      `00-${uuids[2]!.replaceAll('-', '')}-${uuids[3]!.replaceAll('-', '').slice(-16)}-01`,
    );
  });

  it('preserves version affinity if optional request ID generation fails', () => {
    vi.stubGlobal('window', {
      sessionStorage: memoryStorage('123e4567-e89b-42d3-a456-426614174000'),
    });

    const headers = versionAffinityHeaders(() => {
      throw new Error('UUID generation unavailable');
    });

    expect(headers['X-Atmos-Version-Key']).toBe('123e4567-e89b-42d3-a456-426614174000');
    expect(headers['Cloudflare-Workers-Version-Key']).toBe(headers['X-Atmos-Version-Key']);
    expect(headers['X-Request-Id']).toBeUndefined();
  });

  it('keeps a request ID if span ID generation fails', () => {
    vi.stubGlobal('window', {
      sessionStorage: memoryStorage('123e4567-e89b-42d3-a456-426614174000'),
    });
    let calls = 0;

    const headers = versionAffinityHeaders(() => {
      calls += 1;
      if (calls === 1) return 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
      throw new Error('UUID generation unavailable');
    });

    expect(headers['X-Request-Id']).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    expect(headers.traceparent).toBeUndefined();
  });
});
