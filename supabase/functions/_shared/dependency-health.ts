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
  if (!supabaseUrl || !key) {
    console.warn(
      JSON.stringify({ event: 'database_dependency_unavailable', reason: 'configuration' }),
    );
    return false;
  }

  let endpoint: URL;
  try {
    endpoint = new URL('/rest/v1/profiles', supabaseUrl);
  } catch {
    console.warn(
      JSON.stringify({ event: 'database_dependency_unavailable', reason: 'configuration' }),
    );
    return false;
  }
  endpoint.searchParams.set('select', 'id');
  endpoint.searchParams.set('limit', '1');

  try {
    const response = await fetcher(endpoint, {
      method: 'GET',
      headers: { accept: 'application/json', apikey: key },
      signal: AbortSignal.timeout(3_000),
    });
    if (response.ok) return true;
    console.warn(
      JSON.stringify({
        event: 'database_dependency_unavailable',
        reason: 'response',
        status: response.status,
      }),
    );
    return false;
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'database_dependency_unavailable',
        reason: 'request',
        error_type: error instanceof Error ? error.name : 'unknown',
      }),
    );
    return false;
  }
}
