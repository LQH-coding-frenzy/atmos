import type { SavedLocation } from '@atmos/contracts';

export type SavedPlacePreferences = {
  defaultLocationId?: string;
  orderedLocationIds: string[];
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export const emptySavedPlacePreferences: SavedPlacePreferences = { orderedLocationIds: [] };

export function savedPlacePreferencesKey(userId: string) {
  return `atmos.saved-places.${userId}`;
}

export function parseSavedPlacePreferences(value: unknown): SavedPlacePreferences {
  if (!value || typeof value !== 'object') return { ...emptySavedPlacePreferences };
  const preferences = value as { defaultLocationId?: unknown; orderedLocationIds?: unknown };
  const ids = Array.isArray(preferences.orderedLocationIds)
    ? preferences.orderedLocationIds.filter(
        (id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 128,
      )
    : [];
  return {
    ...(typeof preferences.defaultLocationId === 'string' &&
    preferences.defaultLocationId.length <= 128
      ? { defaultLocationId: preferences.defaultLocationId }
      : {}),
    orderedLocationIds: [...new Set(ids)],
  };
}

export function readSavedPlacePreferences(storage: StorageLike, userId: string) {
  try {
    const serialized = storage.getItem(savedPlacePreferencesKey(userId));
    return parseSavedPlacePreferences(serialized ? JSON.parse(serialized) : undefined);
  } catch {
    return { ...emptySavedPlacePreferences };
  }
}

export function writeSavedPlacePreferences(
  storage: StorageLike,
  userId: string,
  preferences: SavedPlacePreferences,
) {
  try {
    storage.setItem(
      savedPlacePreferencesKey(userId),
      JSON.stringify(parseSavedPlacePreferences(preferences)),
    );
    return true;
  } catch {
    return false;
  }
}

export function orderSavedLocations<T extends Pick<SavedLocation, 'id'>>(
  locations: T[],
  preferences: SavedPlacePreferences,
) {
  const order = new Map(preferences.orderedLocationIds.map((id, index) => [id, index]));
  return [...locations].sort((left, right) => {
    const leftDefault = left.id === preferences.defaultLocationId ? 0 : 1;
    const rightDefault = right.id === preferences.defaultLocationId ? 0 : 1;
    if (leftDefault !== rightDefault) return leftDefault - rightDefault;
    const leftOrder = order.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = order.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder;
  });
}

export function moveSavedLocation(locationIds: string[], locationId: string, direction: -1 | 1) {
  const nextIds = [...locationIds];
  const currentIndex = nextIds.indexOf(locationId);
  const nextIndex = currentIndex + direction;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= nextIds.length) return nextIds;
  [nextIds[currentIndex], nextIds[nextIndex]] = [nextIds[nextIndex]!, nextIds[currentIndex]!];
  return nextIds;
}
