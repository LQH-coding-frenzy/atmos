import type { Location, OpenWeatherMapLayer, SavedLocation } from '@atmos/contracts';

export type AqiMapCandidate = {
  id: string;
  name: string;
  country: string;
  latitude: number;
  longitude: number;
};

export type AqiMapPoint = AqiMapCandidate & {
  usAqi: number | null;
  europeanAqi: number | null;
  observedAt: string | null;
  stale: boolean;
  status: 'ready' | 'unavailable' | 'rate-limited';
};

export type MapPointCollection = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id: string;
    properties: Record<string, string | number | boolean | null>;
    geometry: { type: 'Point'; coordinates: [number, number] };
  }>;
};

export const maxAqiMapSamples = 8;
export const maxAqiMapSamplesPerMinute = 12;
export const maxConcurrentAqiMapRequests = 2;
export const aqiMapCacheMilliseconds = 5 * 60 * 1000;
export const failedAqiMapCacheMilliseconds = 30 * 1000;
export const maxAqiMapCacheEntries = 32;

export function aqiMapSampleKey(location: Pick<AqiMapCandidate, 'latitude' | 'longitude'>) {
  return `${location.latitude.toFixed(4)}:${location.longitude.toFixed(4)}`;
}

export function selectAqiMapCandidates(
  current: Pick<Location, 'id' | 'name' | 'country' | 'latitude' | 'longitude'>,
  visibleSaved: readonly SavedLocation[],
): AqiMapCandidate[] {
  const unique = new Map<string, AqiMapCandidate>();
  const candidates: AqiMapCandidate[] = [
    {
      id: `current:${current.id}`,
      name: current.name,
      country: current.country,
      latitude: current.latitude,
      longitude: current.longitude,
    },
    ...visibleSaved.map((location) => ({
      id: location.id,
      name: location.name,
      country: 'Saved place',
      latitude: location.latitude,
      longitude: location.longitude,
    })),
  ];

  for (const candidate of candidates) {
    const key = aqiMapSampleKey(candidate);
    if (!unique.has(key)) unique.set(key, candidate);
    if (unique.size === maxAqiMapSamples) break;
  }
  return [...unique.values()];
}

export function reserveAqiMapSampleSlots(timestamps: number[], now: number, requested: number) {
  const recentTimestamps = timestamps.filter((timestamp) => now - timestamp < 60_000);
  const available = Math.max(0, maxAqiMapSamplesPerMinute - recentTimestamps.length);
  const reserved = Math.min(available, requested);
  return {
    reserved,
    timestamps: [...recentTimestamps, ...Array.from({ length: reserved }, () => now)],
  };
}

export async function runWithConcurrency<T>(
  items: readonly T[],
  requestedConcurrency: number,
  task: (item: T) => Promise<void>,
) {
  let cursor = 0;
  const concurrency = Math.min(
    items.length,
    Number.isFinite(requestedConcurrency) ? Math.max(1, Math.floor(requestedConcurrency)) : 1,
  );
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        await task(items[index]!);
      }
    }),
  );
}

export function createUnavailableAqiMapPoint(
  candidate: AqiMapCandidate,
  status: 'unavailable' | 'rate-limited',
): AqiMapPoint {
  return {
    ...candidate,
    usAqi: null,
    europeanAqi: null,
    observedAt: null,
    stale: false,
    status,
  };
}

export function createSavedPlaceCollection(
  locations: readonly SavedLocation[],
): MapPointCollection {
  return {
    type: 'FeatureCollection',
    features: locations.map((location) => ({
      type: 'Feature',
      id: location.id,
      properties: {
        id: location.id,
        name: location.name,
        country: 'Saved place',
        class: 'city',
        place: 'city',
        isDefault: location.is_default,
        isFavorite: location.is_favorite,
        category: location.category,
      },
      geometry: { type: 'Point', coordinates: [location.longitude, location.latitude] },
    })),
  };
}

export function createAqiPlaceCollection(points: readonly AqiMapPoint[]): MapPointCollection {
  return {
    type: 'FeatureCollection',
    features: points.map((point) => ({
      type: 'Feature',
      id: point.id,
      properties: {
        id: point.id,
        name: point.name,
        country: point.country,
        class: 'city',
        place: 'city',
        usAqi: point.usAqi,
        europeanAqi: point.europeanAqi,
        observedAt: point.observedAt,
        stale: point.stale,
        status: point.status,
      },
      geometry: { type: 'Point', coordinates: [point.longitude, point.latitude] },
    })),
  };
}

export const usAqiMapLegend = [
  { label: 'Good', range: '0–50', color: '#4fa779' },
  { label: 'Moderate', range: '51–100', color: '#d5ad35' },
  { label: 'Unhealthy for sensitive groups', range: '101–150', color: '#df873b' },
  { label: 'Unhealthy', range: '151–200', color: '#d85a50' },
  { label: 'Very unhealthy', range: '201–300', color: '#a16bb0' },
  { label: 'Hazardous', range: '301+', color: '#8d536f' },
] as const;

type MapLegend = { unit: string; stops: Array<{ value: number; color: string }> };

// OpenWeather's published Weather Maps 1.0 legend stops, including the provider units.
const openWeatherLegends: Record<OpenWeatherMapLayer, MapLegend> = {
  precipitation_new: {
    unit: 'mm',
    stops: [
      { value: 0, color: 'rgba(225,200,100,0)' },
      { value: 0.1, color: 'rgba(200,150,150,0)' },
      { value: 0.2, color: 'rgba(150,150,170,0)' },
      { value: 0.5, color: 'rgba(120,120,190,0)' },
      { value: 1, color: 'rgba(110,110,205,0.3)' },
      { value: 10, color: 'rgba(80,80,225,0.7)' },
      { value: 140, color: 'rgba(20,20,255,0.9)' },
    ],
  },
  clouds_new: {
    unit: '%',
    stops: [
      { value: 0, color: 'rgba(255,255,255,0)' },
      { value: 10, color: 'rgba(253,253,255,0.1)' },
      { value: 20, color: 'rgba(252,251,255,0.2)' },
      { value: 30, color: 'rgba(250,250,255,0.3)' },
      { value: 40, color: 'rgba(249,248,255,0.4)' },
      { value: 50, color: 'rgba(247,247,255,0.5)' },
      { value: 60, color: 'rgba(246,245,255,0.75)' },
      { value: 70, color: 'rgba(244,244,255,1)' },
      { value: 80, color: 'rgba(243,242,255,1)' },
      { value: 90, color: 'rgba(242,241,255,1)' },
      { value: 100, color: 'rgba(240,240,255,1)' },
    ],
  },
  pressure_new: {
    unit: 'hPa',
    stops: [
      { value: 940, color: 'rgb(0,115,255)' },
      { value: 960, color: 'rgb(0,170,255)' },
      { value: 980, color: 'rgb(75,208,214)' },
      { value: 1000, color: 'rgb(141,231,199)' },
      { value: 1010, color: 'rgb(176,247,32)' },
      { value: 1020, color: 'rgb(240,184,0)' },
      { value: 1040, color: 'rgb(251,85,21)' },
      { value: 1060, color: 'rgb(243,54,59)' },
      { value: 1080, color: 'rgb(198,0,0)' },
    ],
  },
  wind_new: {
    unit: 'm/s',
    stops: [
      { value: 1, color: 'rgba(255,255,255,0)' },
      { value: 5, color: 'rgba(238,206,206,0.4)' },
      { value: 15, color: 'rgba(179,100,188,0.7)' },
      { value: 25, color: 'rgba(63,33,59,0.8)' },
      { value: 50, color: 'rgba(116,76,172,0.9)' },
      { value: 100, color: 'rgba(70,0,175,1)' },
      { value: 200, color: 'rgba(13,17,38,1)' },
    ],
  },
  temp_new: {
    unit: '°C',
    stops: [
      { value: -65, color: 'rgb(130,22,146)' },
      { value: -55, color: 'rgb(130,22,146)' },
      { value: -45, color: 'rgb(130,22,146)' },
      { value: -40, color: 'rgb(130,22,146)' },
      { value: -30, color: 'rgb(130,87,219)' },
      { value: -20, color: 'rgb(32,140,236)' },
      { value: -10, color: 'rgb(32,196,232)' },
      { value: 0, color: 'rgb(35,221,221)' },
      { value: 10, color: 'rgb(194,255,40)' },
      { value: 20, color: 'rgb(255,240,40)' },
      { value: 25, color: 'rgb(255,194,40)' },
      { value: 30, color: 'rgb(252,128,20)' },
    ],
  },
};

export function openWeatherMapLegend(layer: OpenWeatherMapLayer) {
  return openWeatherLegends[layer];
}

export function formatOpenWeatherLegendValue(
  value: number,
  layer: OpenWeatherMapLayer,
  units: 'metric' | 'imperial',
) {
  if (layer === 'temp_new') {
    const temperature = units === 'imperial' ? (value * 9) / 5 + 32 : value;
    return `${Math.round(temperature)}°${units === 'imperial' ? 'F' : 'C'}`;
  }
  if (layer === 'pressure_new') {
    return `${new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(value)} hPa`;
  }
  if (layer === 'clouds_new') return `${Math.round(value)}%`;
  if (layer === 'wind_new') {
    const speed = units === 'imperial' ? value * 2.23694 : value * 3.6;
    return `${new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(speed)} ${units === 'imperial' ? 'mph' : 'km/h'}`;
  }
  return `${new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value)} mm`;
}

export function aqiMarkerColor(value: number | null) {
  if (value === null || !Number.isFinite(value) || value < 0) return '#76869a';
  if (value <= 50) return '#4fa779';
  if (value <= 100) return '#d5ad35';
  if (value <= 150) return '#df873b';
  if (value <= 200) return '#d85a50';
  if (value <= 300) return '#a16bb0';
  return '#8d536f';
}
