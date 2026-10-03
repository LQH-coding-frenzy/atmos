const storageKey = 'atmos_version_key';
const versionKeyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getOrCreateAtmosVersionKey(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  createUuid = () => crypto.randomUUID(),
) {
  const existing = storage.getItem(storageKey);
  if (existing && versionKeyPattern.test(existing)) return existing;

  const generated = createUuid();
  if (!versionKeyPattern.test(generated)) {
    throw new Error('Version-affinity key generation returned an invalid identifier.');
  }
  storage.setItem(storageKey, generated);
  return generated;
}

export function versionAffinityHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const key = getOrCreateAtmosVersionKey(window.sessionStorage);
    return {
      'X-Atmos-Version-Key': key,
      'Cloudflare-Workers-Version-Key': key,
    };
  } catch {
    return {};
  }
}
