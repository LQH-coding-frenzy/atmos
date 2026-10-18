import { describe, expect, it } from 'vitest';
import {
  addRecentSearch,
  clearRecentSearches,
  moveSavedLocation,
  orderSavedLocations,
  parseRecentSearches,
  readRecentSearches,
  parseSavedPlacePreferences,
  savedPlacePreferencesKey,
  savedPlacePreferencesFromLocations,
} from './saved-place-preferences';

describe('saved place preferences', () => {
  it('parses valid user-local preferences and removes malformed or duplicate IDs', () => {
    expect(
      parseSavedPlacePreferences({
        defaultLocationId: 'place-b',
        orderedLocationIds: ['place-b', 'place-a', 'place-a', null, ''],
      }),
    ).toEqual({ defaultLocationId: 'place-b', orderedLocationIds: ['place-b', 'place-a'] });
    expect(savedPlacePreferencesKey('user-1')).not.toBe(savedPlacePreferencesKey('user-2'));
  });

  it('places the default first, then respects manual ordering without mutating API results', () => {
    const input = [
      { id: 'place-a', name: 'A' },
      { id: 'place-b', name: 'B' },
      { id: 'place-c', name: 'C' },
    ];
    const ordered = orderSavedLocations(input, {
      defaultLocationId: 'place-c',
      orderedLocationIds: ['place-b', 'place-c', 'place-a'],
    });
    expect(ordered.map(({ id }) => id)).toEqual(['place-c', 'place-b', 'place-a']);
    expect(input.map(({ id }) => id)).toEqual(['place-a', 'place-b', 'place-c']);
  });

  it('moves a saved place one position and leaves edge items in place', () => {
    const ids = ['place-a', 'place-b', 'place-c'];
    expect(moveSavedLocation(ids, 'place-b', -1)).toEqual(['place-b', 'place-a', 'place-c']);
    expect(moveSavedLocation(ids, 'place-b', 1)).toEqual(['place-a', 'place-c', 'place-b']);
    expect(moveSavedLocation(ids, 'place-a', -1)).toEqual(ids);
    expect(moveSavedLocation(ids, 'missing', 1)).toEqual(ids);
  });
});

describe('private bounded recent place searches', () => {
  const place = (index: number) => ({
    id: `${index}`,
    name: `Place ${index}`,
    country: 'Test',
    latitude: index,
    longitude: index,
    timezone: 'UTC',
  });
  it('deduplicates by coordinates, moves repeated choices to the front, and caps at eight', () => {
    const storage = new Map<string, string>();
    const adapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    };
    for (let index = 0; index < 10; index++) addRecentSearch(adapter, place(index));
    let recents = readRecentSearches(adapter);
    expect(recents).toHaveLength(8);
    expect(recents[0]?.name).toBe('Place 9');
    expect(recents.at(-1)?.name).toBe('Place 2');
    recents = addRecentSearch(adapter, place(5));
    expect(recents[0]?.name).toBe('Place 5');
    expect(recents).toHaveLength(8);
  });
  it('never stores device GPS locations and safely removes corrupted storage', () => {
    const storage = new Map<string, string>();
    const adapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    };
    expect(
      addRecentSearch(adapter, {
        id: 'device-location',
        name: 'Your location',
        country: 'Device location',
        latitude: 0,
        longitude: 0,
        timezone: 'UTC',
      }),
    ).toEqual([]);
    storage.set('atmos.recent-searches.v1', 'not json');
    expect(readRecentSearches(adapter)).toEqual([]);
    expect(parseRecentSearches([place(1), { ...place(1), name: 'Duplicate' }, null])).toHaveLength(
      1,
    );
    storage.set('atmos.recent-searches.v1', JSON.stringify([place(1)]));
    expect(clearRecentSearches(adapter)).toBe(true);
    expect(readRecentSearches(adapter)).toEqual([]);
  });
});

describe('account-synced saved-place metadata', () => {
  it('restores server order/default while preserving favorite and category fields on rows', () => {
    const locations = [
      {
        id: 'place-a',
        name: 'A',
        latitude: 0,
        longitude: 0,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        is_favorite: true,
        category: 'work' as const,
        sort_order: 1,
        is_default: false,
      },
      {
        id: 'place-b',
        name: 'B',
        latitude: 1,
        longitude: 1,
        created_at: '2026-01-02T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
        is_favorite: false,
        category: null,
        sort_order: 0,
        is_default: true,
      },
    ];
    expect(savedPlacePreferencesFromLocations(locations)).toEqual({
      defaultLocationId: 'place-b',
      orderedLocationIds: ['place-b', 'place-a'],
    });
    expect(locations[0]?.is_favorite).toBe(true);
    expect(locations[0]?.category).toBe('work');
  });
});
