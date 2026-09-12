type DependencyFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export function defaultSupabasePublishableKey(encodedKeys: string | undefined) {
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
  encodedPublishableKeys: string | undefined,
  fetcher: DependencyFetch = fetch,
) {
  const key = defaultSupabasePublishableKey(encodedPublishableKeys);
  if (!supabaseUrl || !key) {
    console.warn(
      JSON.stringify({ event: 'database_dependency_unavailable', reason: 'configuration' }),
    );
    return false;
  }

  let endpoint: URL;
  try {
    endpoint = new URL('/rest/v1/rpc/atmos_dependency_health', supabaseUrl);
  } catch {
    console.warn(
      JSON.stringify({ event: 'database_dependency_unavailable', reason: 'configuration' }),
    );
    return false;
  }
  try {
    const response = await fetcher(endpoint, {
      method: 'GET',
      headers: { accept: 'application/json', apikey: key },
      signal: AbortSignal.timeout(3_000),
    });
    if (response.ok && (await response.json().catch(() => undefined)) === true) return true;
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
