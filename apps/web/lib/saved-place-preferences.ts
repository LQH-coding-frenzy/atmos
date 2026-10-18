import {
  locationSearchResultSchema,
  type LocationSearchResult,
  type SavedLocation,
} from '@atmos/contracts';

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

export function savedPlacePreferencesFromLocations(
  locations: readonly SavedLocation[],
): SavedPlacePreferences {
  const ordered = [...locations].sort(
    (left, right) =>
      left.sort_order - right.sort_order ||
      left.created_at.localeCompare(right.created_at) ||
      left.id.localeCompare(right.id),
  );
  const defaultLocation = locations.find((location) => location.is_default);
  return {
    ...(defaultLocation ? { defaultLocationId: defaultLocation.id } : {}),
    orderedLocationIds: ordered.map((location) => location.id),
  };
}

export const recentSearchesStorageKey = 'atmos.recent-searches.v1';
export const maximumRecentSearches = 8;

type StorageWithRemove = StorageLike & Pick<Storage, 'removeItem'>;

export function parseRecentSearches(value: unknown): LocationSearchResult[] {
  if (!Array.isArray(value)) return [];
  const byKey = new Map<string, LocationSearchResult>();
  for (const item of value) {
    const parsed = locationSearchResultSchema.safeParse(item);
    if (
      !parsed.success ||
      parsed.data.id === 'device-location' ||
      parsed.data.country === 'Device location'
    )
      continue;
    const location = parsed.data;
    const key = `${location.latitude.toFixed(5)}:${location.longitude.toFixed(5)}`;
    if (!byKey.has(key)) byKey.set(key, location);
  }
  return [...byKey.values()].slice(0, maximumRecentSearches);
}

export function readRecentSearches(storage: Pick<Storage, 'getItem'>) {
  try {
    const raw = storage.getItem(recentSearchesStorageKey);
    return parseRecentSearches(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

export function addRecentSearch(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  location: LocationSearchResult,
) {
  if (location.id === 'device-location' || location.country === 'Device location')
    return readRecentSearches(storage);
  const key = `${location.latitude.toFixed(5)}:${location.longitude.toFixed(5)}`;
  const next = parseRecentSearches([
    location,
    ...readRecentSearches(storage).filter(
      (item) => `${item.latitude.toFixed(5)}:${item.longitude.toFixed(5)}` !== key,
    ),
  ]).slice(0, maximumRecentSearches);
  try {
    storage.setItem(recentSearchesStorageKey, JSON.stringify(next));
  } catch {
    /* Search remains usable if storage is unavailable. */
  }
  return next;
}

export function clearRecentSearches(storage: StorageWithRemove) {
  try {
    storage.removeItem(recentSearchesStorageKey);
    return true;
  } catch {
    return false;
  }
}

export function moveSavedLocation(locationIds: string[], locationId: string, direction: -1 | 1) {
  const nextIds = [...locationIds];
  const currentIndex = nextIds.indexOf(locationId);
  const nextIndex = currentIndex + direction;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= nextIds.length) return nextIds;
  [nextIds[currentIndex], nextIds[nextIndex]] = [nextIds[nextIndex]!, nextIds[currentIndex]!];
  return nextIds;
}
