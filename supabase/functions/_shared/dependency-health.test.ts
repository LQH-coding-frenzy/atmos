import { describe, expect, it, vi } from 'vitest';
import { databaseDependencyIsHealthy, defaultSupabaseSecretKey } from './dependency-health';

describe('dependency health', () => {
  it('reads only the named default key from the current secret-key dictionary', () => {
    expect(defaultSupabaseSecretKey('{"default":"test-key","other":"ignored"}')).toBe('test-key');
    expect(defaultSupabaseSecretKey('{"other":"test-key"}')).toBeUndefined();
    expect(defaultSupabaseSecretKey('invalid')).toBeUndefined();
    expect(defaultSupabaseSecretKey(undefined)).toBeUndefined();
  });

  it('executes a bounded query without exposing the row body', async () => {
    const fetcher = vi.fn(async () => Response.json([{ id: 'private-row-id' }]));

    await expect(
      databaseDependencyIsHealthy('https://project.supabase.co', '{"default":"test-key"}', fetcher),
    ).resolves.toBe(true);

    expect(fetcher).toHaveBeenCalledOnce();
    const [endpoint, init] = fetcher.mock.calls[0] ?? [];
    expect(String(endpoint)).toBe('https://project.supabase.co/rest/v1/profiles?select=id&limit=1');
    expect(init).toMatchObject({
      method: 'GET',
      headers: { accept: 'application/json', apikey: 'test-key' },
    });
    expect(new Headers(init?.headers).has('authorization')).toBe(false);
  });

  it('fails closed for bad configuration, query failures, and unavailable dependencies', async () => {
    const unavailable = vi.fn(async () => new Response(null, { status: 503 }));
    const failed = vi.fn(async () => Promise.reject(new Error('sensitive database failure')));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(databaseDependencyIsHealthy(undefined, undefined, unavailable)).resolves.toBe(
      false,
    );
    await expect(
      databaseDependencyIsHealthy('not a url', '{"default":"test-key"}', unavailable),
    ).resolves.toBe(false);
    await expect(
      databaseDependencyIsHealthy(
        'https://project.supabase.co',
        '{"default":"test-key"}',
        unavailable,
      ),
    ).resolves.toBe(false);
    await expect(
      databaseDependencyIsHealthy('https://project.supabase.co', '{"default":"test-key"}', failed),
    ).resolves.toBe(false);
    expect(warning).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(warning.mock.calls)).not.toContain('sensitive database failure');
    expect(warning.mock.calls.map(([message]) => JSON.parse(String(message)))).toEqual([
      { event: 'database_dependency_unavailable', reason: 'configuration' },
      { event: 'database_dependency_unavailable', reason: 'configuration' },
      { event: 'database_dependency_unavailable', reason: 'response', status: 503 },
      {
        event: 'database_dependency_unavailable',
        reason: 'request',
        error_type: 'Error',
      },
    ]);
    warning.mockRestore();
  });
});
