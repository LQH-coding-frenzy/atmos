import { describe, expect, it } from 'vitest';
import { parseReplaceSavedLocationPreferences } from './saved-location-preferences.ts';

const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
describe('saved-location preference API parser', () => {
  it('accepts unique caller-selected places, categories, favorites and nullable default', () => {
    expect(
      parseReplaceSavedLocationPreferences({
        locations: [
          { id: b, is_favorite: true, category: 'work' },
          { id: a, is_favorite: false, category: null },
        ],
        defaultLocationId: b,
      }),
    ).toEqual({
      locations: [
        { id: b, is_favorite: true, category: 'work' },
        { id: a, is_favorite: false, category: null },
      ],
      defaultLocationId: b,
    });
    expect(
      parseReplaceSavedLocationPreferences({ locations: [], defaultLocationId: null }),
    ).toEqual({ locations: [], defaultLocationId: null });
  });
  it('rejects missing fields, duplicate IDs, bad categories, malformed IDs and foreign defaults', () => {
    const base = {
      locations: [{ id: a, is_favorite: false, category: null }],
      defaultLocationId: null,
    };
    expect(
      parseReplaceSavedLocationPreferences({
        ...base,
        locations: [{ id: a, is_favorite: false, category: 'admin' }],
      }),
    ).toBeUndefined();
    expect(
      parseReplaceSavedLocationPreferences({
        ...base,
        locations: [
          { id: a, is_favorite: false, category: null },
          { id: a, is_favorite: true, category: 'work' },
        ],
      }),
    ).toBeUndefined();
    expect(parseReplaceSavedLocationPreferences({ ...base, defaultLocationId: b })).toBeUndefined();
    expect(
      parseReplaceSavedLocationPreferences({
        ...base,
        locations: [{ id: 'bad', is_favorite: false, category: null }],
      }),
    ).toBeUndefined();
    expect(
      parseReplaceSavedLocationPreferences({ ...base, locations: [{ id: a, category: null }] }),
    ).toBeUndefined();
    expect(
      parseReplaceSavedLocationPreferences({
        locations: Array.from({ length: 101 }, (_, index) => ({
          id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
          is_favorite: false,
          category: null,
        })),
        defaultLocationId: null,
      }),
    ).toBeUndefined();
  });
});
