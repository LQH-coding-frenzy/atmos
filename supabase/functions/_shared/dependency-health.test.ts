import { describe, expect, it, vi } from 'vitest';
import { databaseDependencyIsHealthy, defaultSupabasePublishableKey } from './dependency-health';

describe('dependency health', () => {
  it('reads only the named default key from the current publishable-key dictionary', () => {
    expect(defaultSupabasePublishableKey('{"default":"test-key","other":"ignored"}')).toBe(
      'test-key',
    );
    expect(defaultSupabasePublishableKey('{"other":"test-key"}')).toBeUndefined();
    expect(defaultSupabasePublishableKey('invalid')).toBeUndefined();
    expect(defaultSupabasePublishableKey(undefined)).toBeUndefined();
  });

  it('executes the bounded health RPC without privileged authorization', async () => {
    const fetcher = vi.fn(async () => Response.json(true));

    await expect(
      databaseDependencyIsHealthy('https://project.supabase.co', '{"default":"test-key"}', fetcher),
    ).resolves.toBe(true);

    expect(fetcher).toHaveBeenCalledOnce();
    const [endpoint, init] = fetcher.mock.calls[0] ?? [];
    expect(String(endpoint)).toBe(
      'https://project.supabase.co/rest/v1/rpc/atmos_dependency_health',
    );
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

  it('rejects a successful response that does not contain the fixed RPC result', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const unexpected = vi.fn(async () => Response.json({ private: 'row' }));

    await expect(
      databaseDependencyIsHealthy(
        'https://project.supabase.co',
        '{"default":"test-key"}',
        unexpected,
      ),
    ).resolves.toBe(false);
    expect(warning).toHaveBeenCalledOnce();
    expect(warning.mock.calls[0]?.[0]).not.toContain('private');
    warning.mockRestore();
  });
});
