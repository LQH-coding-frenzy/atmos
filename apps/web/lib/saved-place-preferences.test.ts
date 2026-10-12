import { describe, expect, it } from 'vitest';
import {
  moveSavedLocation,
  orderSavedLocations,
  parseSavedPlacePreferences,
  savedPlacePreferencesKey,
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
