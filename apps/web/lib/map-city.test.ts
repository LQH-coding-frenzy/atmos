import { describe, expect, it } from 'vitest';
import {
  automaticCityPreviewsPerMinute,
  mapCityFromFeature,
  mapCityLayerIds,
  reserveAutomaticCityPreviewSlot,
} from './map-city';

describe('mapCityFromFeature', () => {
  it('preserves a city label and geographic point as a stable preview target', () => {
    expect(
      mapCityFromFeature({
        id: 901,
        source: 'openmaptiles',
        sourceLayer: 'place',
        properties: { class: 'city', name: 'Paris', country: 'France' },
        geometry: { type: 'Point', coordinates: [2.3522, 48.8566] },
      }),
    ).toEqual({
      key: 'openmaptiles:place:901:48.8566:2.3522',
      name: 'Paris',
      country: 'France',
      latitude: 48.8566,
      longitude: 2.3522,
      placeClass: 'city',
    });
  });

  it('uses the English name when available and ignores non-city place classes', () => {
    const feature = {
      properties: { class: 'town', name: 'München', name_en: 'Munich' },
      geometry: { type: 'Point', coordinates: [11.5761, 48.1372] },
    };
    expect(mapCityFromFeature(feature)?.name).toBe('Munich');
    expect(
      mapCityFromFeature({
        ...feature,
        properties: { class: 'suburb', name: 'Schwabing' },
      }),
    ).toBeUndefined();
  });

  it('rejects invalid or missing point coordinates', () => {
    const feature = {
      properties: { class: 'city', name: 'Invalid' },
      geometry: { type: 'Point', coordinates: [181, 91] },
    };
    expect(mapCityFromFeature(feature)).toBeUndefined();
    expect(
      mapCityFromFeature({ ...feature, geometry: { type: 'LineString', coordinates: [] } }),
    ).toBeUndefined();
  });
});

describe('mapCityLayerIds', () => {
  it('limits hover hit-testing to visible OpenMapTiles place-label symbol layers', () => {
    expect(
      mapCityLayerIds([
        { id: 'place-city-label', type: 'symbol', 'source-layer': 'place' },
        { id: 'place-village-label', type: 'symbol', 'source-layer': 'place' },
        {
          id: 'place-hidden-label',
          type: 'symbol',
          'source-layer': 'place',
          layout: { visibility: 'none' },
        },
        { id: 'road-label', type: 'symbol', 'source-layer': 'transportation_name' },
        { id: 'park', type: 'fill', 'source-layer': 'park' },
      ]),
    ).toEqual(['place-city-label', 'place-village-label']);
  });
});

describe('reserveAutomaticCityPreviewSlot', () => {
  it('limits uncached automatic previews and releases slots after a minute', () => {
    const timestamps = Array.from({ length: automaticCityPreviewsPerMinute }, (_, index) => index);
    expect(reserveAutomaticCityPreviewSlot(timestamps, 59_999).allowed).toBe(false);
    const expired = reserveAutomaticCityPreviewSlot(timestamps, 60_000);
    expect(expired.allowed).toBe(true);
    expect(expired.timestamps).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 60_000]);
  });
});
