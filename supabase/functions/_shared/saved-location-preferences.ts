export const savedLocationCategories = ['home', 'work', 'university', 'travel'] as const;
export type SavedLocationCategory = (typeof savedLocationCategories)[number];
export type SavedLocationPreferenceInput = {
  id: string;
  is_favorite: boolean;
  category: SavedLocationCategory | null;
};
export type ReplaceSavedLocationPreferencesInput = {
  locations: SavedLocationPreferenceInput[];
  defaultLocationId: string | null;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseReplaceSavedLocationPreferences(
  value: unknown,
): ReplaceSavedLocationPreferencesInput | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.locations) || input.locations.length > 500) return undefined;
  if (
    input.defaultLocationId !== null &&
    (typeof input.defaultLocationId !== 'string' || !uuidPattern.test(input.defaultLocationId))
  )
    return undefined;
  const locations: SavedLocationPreferenceInput[] = [];
  const ids = new Set<string>();
  for (const candidate of input.locations) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return undefined;
    const item = candidate as Record<string, unknown>;
    if (
      typeof item.id !== 'string' ||
      !uuidPattern.test(item.id) ||
      ids.has(item.id) ||
      typeof item.is_favorite !== 'boolean'
    )
      return undefined;
    if (
      item.category !== null &&
      (typeof item.category !== 'string' ||
        !savedLocationCategories.includes(item.category as SavedLocationCategory))
    )
      return undefined;
    ids.add(item.id);
    locations.push({
      id: item.id,
      is_favorite: item.is_favorite,
      category: item.category as SavedLocationCategory | null,
    });
  }
  if (input.defaultLocationId !== null && !ids.has(input.defaultLocationId as string))
    return undefined;
  return { locations, defaultLocationId: input.defaultLocationId as string | null };
}
