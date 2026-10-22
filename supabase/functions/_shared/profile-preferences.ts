const profilePreferenceKeys = ['display_name', 'units', 'timezone', 'theme'] as const;
const allowedProfilePreferenceKeys = new Set<string>(profilePreferenceKeys);

export type ProfilePreferencesUpdate = {
  display_name?: string;
  units?: 'metric' | 'imperial';
  timezone?: string;
  theme?: 'system' | 'light' | 'dark';
};

function isValidTimezone(value: string) {
  if (value === 'auto') return true;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function parseProfilePreferencesUpdate(
  value: unknown,
): ProfilePreferencesUpdate | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).length === 0 ||
    Object.keys(input).some((key) => !allowedProfilePreferenceKeys.has(key))
  ) {
    return undefined;
  }

  const update: ProfilePreferencesUpdate = {};
  if ('display_name' in input) {
    if (typeof input.display_name !== 'string') return undefined;
    const displayName = input.display_name.trim();
    if (!displayName || [...displayName].length > 80) return undefined;
    update.display_name = displayName;
  }
  if ('units' in input) {
    if (input.units !== 'metric' && input.units !== 'imperial') return undefined;
    update.units = input.units;
  }
  if ('timezone' in input) {
    if (
      typeof input.timezone !== 'string' ||
      input.timezone.trim().length === 0 ||
      input.timezone.trim().length > 80 ||
      !isValidTimezone(input.timezone.trim())
    ) {
      return undefined;
    }
    update.timezone = input.timezone.trim();
  }
  if ('theme' in input) {
    if (input.theme !== 'system' && input.theme !== 'light' && input.theme !== 'dark') {
      return undefined;
    }
    update.theme = input.theme;
  }
  return update;
}
