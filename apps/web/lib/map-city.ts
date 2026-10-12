export type MapCity = {
  key: string;
  name: string;
  country?: string;
  latitude: number;
  longitude: number;
  placeClass: string;
};

type MapFeatureLike = {
  id?: string | number;
  source?: string;
  sourceLayer?: string;
  properties?: Record<string, unknown> | null;
  geometry?: { type?: string; coordinates?: unknown } | null;
};

type MapLayerLike = {
  id: string;
  type: string;
  'source-layer'?: string;
  layout?: { visibility?: unknown };
};

const supportedPlaceClasses = new Set(['city', 'town', 'village', 'hamlet']);
export const cityPreviewCacheMilliseconds = 300_000;
export const automaticCityPreviewsPerMinute = 12;

function firstText(properties: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = properties[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

export function mapCityFromFeature(feature: MapFeatureLike): MapCity | undefined {
  if (feature.geometry?.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) {
    return undefined;
  }
  const [longitude, latitude] = feature.geometry.coordinates;
  if (
    typeof longitude !== 'number' ||
    typeof latitude !== 'number' ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    return undefined;
  }

  const properties = feature.properties ?? {};
  const placeClass = firstText(properties, ['class', 'place'])?.toLowerCase();
  const name = firstText(properties, ['name:en', 'name_en', 'name', 'name_int']);
  if (!placeClass || !supportedPlaceClasses.has(placeClass) || !name) return undefined;

  const featureId = feature.id ?? properties.osm_id ?? properties.wikidata;
  const key = [
    feature.source ?? 'map',
    feature.sourceLayer ?? 'place',
    featureId === undefined ? name.toLocaleLowerCase('en-US') : String(featureId),
    latitude.toFixed(4),
    longitude.toFixed(4),
  ].join(':');

  return {
    key,
    name,
    country: firstText(properties, ['country_name', 'country', 'country_en']),
    latitude,
    longitude,
    placeClass,
  };
}

export function mapCityLayerIds(layers: readonly MapLayerLike[]) {
  return layers
    .filter(
      (layer) =>
        layer.type === 'symbol' &&
        layer['source-layer'] === 'place' &&
        layer.layout?.visibility !== 'none',
    )
    .map((layer) => layer.id);
}

export function reserveAutomaticCityPreviewSlot(timestamps: number[], now: number) {
  const recentTimestamps = timestamps.filter((timestamp) => now - timestamp < 60_000);
  if (recentTimestamps.length >= automaticCityPreviewsPerMinute) {
    return { allowed: false, timestamps: recentTimestamps };
  }
  return { allowed: true, timestamps: [...recentTimestamps, now] };
}
