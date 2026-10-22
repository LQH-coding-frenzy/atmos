export type AppRole = 'owner' | 'user';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function appRoleFromMetadata(appMetadata: unknown): AppRole {
  if (!isRecord(appMetadata)) return 'user';
  return appMetadata.atmos_role === 'owner' ? 'owner' : 'user';
}
