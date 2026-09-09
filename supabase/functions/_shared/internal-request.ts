const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function matchesInternalSecret(expected: string | undefined, provided: string | undefined) {
  return Boolean(expected && provided && expected === provided);
}

export function isUuid(value: string | undefined): value is string {
  return Boolean(value && uuidPattern.test(value));
}
