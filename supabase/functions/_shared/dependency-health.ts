type DependencyFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export function defaultSupabaseSecretKey(encodedKeys: string | undefined) {
  if (!encodedKeys) return undefined;

  try {
    const keys = JSON.parse(encodedKeys) as unknown;
    if (!keys || typeof keys !== 'object' || Array.isArray(keys)) return undefined;
    const key = (keys as Record<string, unknown>).default;
    return typeof key === 'string' && key.length > 0 ? key : undefined;
  } catch {
    return undefined;
  }
}

export async function databaseDependencyIsHealthy(
  supabaseUrl: string | undefined,
  encodedSecretKeys: string | undefined,
  fetcher: DependencyFetch = fetch,
) {
  const key = defaultSupabaseSecretKey(encodedSecretKeys);
  if (!supabaseUrl || !key) return false;

  let endpoint: URL;
  try {
    endpoint = new URL('/rest/v1/profiles', supabaseUrl);
  } catch {
    return false;
  }
  endpoint.searchParams.set('select', 'id');
  endpoint.searchParams.set('limit', '1');

  try {
    const response = await fetcher(endpoint, {
      method: 'HEAD',
      headers: { accept: 'application/json', apikey: key },
      signal: AbortSignal.timeout(3_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
