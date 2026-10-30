'use client';

import {
  airQualitySchema,
  dashboardSchema,
  openWeatherMapLayerSchema,
  type Dashboard as DashboardData,
  type LocationSearchResult,
  type SavedLocation,
  type OpenWeatherMapLayer,
  type UnitSystem,
  type WeatherCondition,
  weatherMapConfigurationSchema,
  weatherRadarTimelineSchema,
  type WeatherRadarTimeline,
} from '@atmos/contracts';
import { formatTemperature, formatWindSpeed } from '@atmos/domain';
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  MapGeoJSONFeature,
  MapMouseEvent,
  RasterTileSource,
} from 'maplibre-gl';
import {
  LocateFixed,
  MapPinned,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RefreshCw,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createLocationMapData } from '../lib/location-map';
import {
  aqiMapCacheMilliseconds,
  aqiMapSampleKey,
  aqiMarkerColor,
  createAqiPlaceCollection,
  createSavedPlaceCollection,
  createUnavailableAqiMapPoint,
  failedAqiMapCacheMilliseconds,
  formatOpenWeatherLegendValue,
  maxAqiMapCacheEntries,
  maxConcurrentAqiMapRequests,
  openWeatherMapLegend,
  reserveAqiMapSampleSlots,
  runWithConcurrency,
  selectAqiMapCandidates,
  usAqiMapLegend,
  type AqiMapPoint,
} from '../lib/map-overlays';
import { observeMapAppearance } from '../lib/map-appearance';
import {
  cityPreviewCacheMilliseconds,
  mapCityFromFeature,
  mapCityLayerIds,
  reserveAutomaticCityPreviewSlot,
  type MapCity,
} from '../lib/map-city';
import { fetchPublicAirQuality, fetchPublicDashboard } from '../lib/public-weather-api';
import { versionAffinityHeaders } from '../lib/version-affinity';
import {
  formatRadarTimestamp,
  openWeatherTileTemplate,
  rainViewerMaximumZoom,
  rainViewerPlaybackIntervalMilliseconds,
  rainViewerTileTemplate,
} from '../lib/weather-radar';

const openFreeMapStyle = 'https://tiles.openfreemap.org/styles/liberty';

type DashboardMapProps = {
  dashboard: DashboardData;
  gatewayOrigin: string;
  units: UnitSystem;
  savedLocations: readonly SavedLocation[];
  observatory?: boolean;
  onSelectLocation: (dashboard: DashboardData) => void;
  onOpenLocation: (location: LocationSearchResult) => Promise<boolean>;
};

type CityPreview = {
  city: MapCity;
  status: 'loading' | 'ready' | 'unavailable' | 'limited';
  dashboard?: DashboardData;
};

type RadarStatus = 'idle' | 'loading' | 'ready' | 'unavailable';
type AqiMapStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'limited';
type SelectedWeatherMapLayer = 'cities' | 'rainviewer' | 'aqi' | OpenWeatherMapLayer;

const weatherOverlaySourceId = 'atmos-weather-overlay';
const weatherOverlayLayerId = 'atmos-weather-overlay-layer';
const openWeatherLayerLabels: Record<OpenWeatherMapLayer, string> = {
  precipitation_new: 'Precipitation',
  clouds_new: 'Cloud cover',
  pressure_new: 'Pressure',
  wind_new: 'Wind',
  temp_new: 'Temperature',
};

function temperature(value: number, units: UnitSystem) {
  return formatTemperature(value, units).replace(' deg', '°');
}

function conditionLabel(condition: WeatherCondition) {
  return condition.replace('-', ' ');
}

function locationForCity(city: MapCity): LocationSearchResult {
  return {
    id: `map:${city.key}`,
    name: city.name,
    country: city.country ?? 'Mapped location',
    latitude: city.latitude,
    longitude: city.longitude,
    timezone: 'auto',
  };
}

function asCity(feature: MapGeoJSONFeature): MapCity | undefined {
  return mapCityFromFeature(feature);
}

function uniqueCities(features: MapGeoJSONFeature[], limit = 24) {
  const cities = new Map<string, MapCity>();
  for (const feature of features) {
    const city = asCity(feature);
    if (city && !cities.has(city.key)) cities.set(city.key, city);
    if (cities.size >= limit) break;
  }
  return [...cities.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function currentDashboardCity(dashboard: DashboardData): MapCity {
  return {
    key: `selected:${dashboard.location.latitude.toFixed(4)}:${dashboard.location.longitude.toFixed(4)}`,
    name: dashboard.location.name,
    country: dashboard.location.country,
    latitude: dashboard.location.latitude,
    longitude: dashboard.location.longitude,
    placeClass: 'city',
  };
}

export function DashboardMap({
  dashboard,
  gatewayOrigin,
  units,
  savedLocations,
  observatory = false,
  onSelectLocation,
  onOpenLocation,
}: DashboardMapProps) {
  const mapElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const collectSavedLocationsRef = useRef<() => void>(() => {});
  const openMapLink = useRef<HTMLAnchorElement>(null);
  const closeMapLink = useRef<HTMLAnchorElement>(null);
  const viewOpener = useRef<HTMLElement | null>(null);
  const wasObservatory = useRef(false);
  const propsRef = useRef({
    dashboard,
    gatewayOrigin,
    onSelectLocation,
    onOpenLocation,
    savedLocations,
  });
  propsRef.current = { dashboard, gatewayOrigin, onSelectLocation, onOpenLocation, savedLocations };

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [radarTimeline, setRadarTimeline] = useState<WeatherRadarTimeline>();
  const [radarStatus, setRadarStatus] = useState<RadarStatus>('idle');
  const [selectedMapLayer, setSelectedMapLayer] = useState<SelectedWeatherMapLayer>('rainviewer');
  const [openWeatherAvailable, setOpenWeatherAvailable] = useState(false);
  const [selectedRadarTimestamp, setSelectedRadarTimestamp] = useState<number>();
  const [radarPlaying, setRadarPlaying] = useState(false);
  const [radarOpacity, setRadarOpacity] = useState(0.58);
  const [cityLayersAvailable, setCityLayersAvailable] = useState(false);
  const [visibleCities, setVisibleCities] = useState<MapCity[]>([]);
  const [visibleSavedLocations, setVisibleSavedLocations] = useState<SavedLocation[]>([]);
  const [aqiMapPoints, setAqiMapPoints] = useState<AqiMapPoint[]>([]);
  const [aqiMapStatus, setAqiMapStatus] = useState<AqiMapStatus>('idle');
  const [aqiMapRetry, setAqiMapRetry] = useState(0);
  const [preview, setPreview] = useState<CityPreview>();
  const [pickerValue, setPickerValue] = useState('');
  const [openingCity, setOpeningCity] = useState(false);
  const previewCache = useRef(new Map<string, { data: DashboardData; storedAt: number }>());
  const aqiCache = useRef(new Map<string, { point: AqiMapPoint; storedAt: number }>());
  const aqiGeneration = useRef(0);
  const aqiController = useRef<AbortController | null>(null);
  const aqiRequestTimestamps = useRef<number[]>([]);
  const aqiMapRetryRef = useRef(0);
  const previewRequests = useRef<number[]>([]);
  const previewGeneration = useRef(0);
  const previewController = useRef<AbortController | null>(null);
  const debounceTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  const activeCityKey = useRef<string | undefined>(undefined);
  const previewPanelHovered = useRef(false);
  const radarTimelineRef = useRef<WeatherRadarTimeline | undefined>(undefined);
  const selectedRadarTimestampRef = useRef<number | undefined>(undefined);
  const weatherOverlayProviderRef = useRef<'openweather' | 'rainviewer' | undefined>(undefined);
  const radarVisible = selectedMapLayer === 'rainviewer';
  const aqiVisible = selectedMapLayer === 'aqi';
  const aqiCandidates = useMemo(
    () => selectAqiMapCandidates(dashboard.location, visibleSavedLocations),
    [dashboard.location, visibleSavedLocations],
  );
  const aqiCandidateKey = aqiCandidates
    .map((item) => `${item.id}:${aqiMapSampleKey(item)}`)
    .join('|');
  radarTimelineRef.current = radarTimeline;
  selectedRadarTimestampRef.current = selectedRadarTimestamp;

  useEffect(() => {
    if (observatory) {
      viewOpener.current ??= document.querySelector<HTMLElement>('.app-navigation a[href="#map"]');
      closeMapLink.current?.focus({ preventScroll: true });
    } else if (wasObservatory.current) {
      viewOpener.current?.focus({ preventScroll: true });
      viewOpener.current = null;
    }
    wasObservatory.current = observatory;
    const onEscape = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        !observatory ||
        event.defaultPrevented ||
        document.querySelector('dialog[open]') ||
        event.target instanceof HTMLSelectElement
      )
        return;
      window.location.hash = 'dashboard';
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [observatory]);

  useEffect(() => {
    const container = mapElement.current;
    if (!container) return;

    let disposed = false;
    let mapLoadComplete = false;
    let styleTimeout: number | undefined;
    let stopObservingAppearance: (() => void) | undefined;
    let cityLayerIds: string[] = [];
    let hasPlaceLayers = false;

    const initial = propsRef.current.dashboard;
    const marker = createLocationMapData(initial.location, initial.current);
    async function initializeMap() {
      try {
        const maplibregl = await import('maplibre-gl');
        if (disposed) return;
        maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
        const instance = new maplibregl.Map({
          container: container as HTMLDivElement,
          style: openFreeMapStyle,
          center: marker.center,
          zoom: 8,
          minZoom: 2,
          maxZoom: 17,
          attributionControl: { compact: true },
          cooperativeGestures: true,
        });
        mapRef.current = instance;
        instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

        const collectVisibleCities = () => {
          if (!cityLayerIds.length) return;
          if (!hasPlaceLayers) {
            setVisibleCities([currentDashboardCity(propsRef.current.dashboard)]);
            return;
          }
          const canvas = instance.getCanvas();
          const features = instance.queryRenderedFeatures(
            [
              [0, 0],
              [canvas.clientWidth, canvas.clientHeight],
            ],
            { layers: cityLayerIds },
          );
          const nextCities = uniqueCities(features);
          setVisibleCities((current) =>
            current.length === nextCities.length &&
            current.every((city, index) => city.key === nextCities[index]?.key)
              ? current
              : nextCities,
          );
        };

        const collectVisibleSavedLocations = () => {
          const bounds = instance.getBounds();
          const next = propsRef.current.savedLocations.filter((location) =>
            bounds.contains([location.longitude, location.latitude]),
          );
          setVisibleSavedLocations((current) =>
            current.length === next.length &&
            current.every((location, index) => location.id === next[index]?.id)
              ? current
              : next,
          );
        };
        collectSavedLocationsRef.current = collectVisibleSavedLocations;

        const addWeatherMarker = () => {
          if (instance.getSource('atmos-current-location')) return;
          const latest = propsRef.current.dashboard;
          const currentMarker = createLocationMapData(latest.location, latest.current);
          instance.addSource('atmos-current-location', {
            type: 'geojson',
            data: currentMarker.point,
          });
          instance.addLayer({
            id: 'atmos-location-glow',
            type: 'circle',
            source: 'atmos-current-location',
            paint: {
              'circle-radius': 24,
              'circle-color': currentMarker.markerColor,
              'circle-opacity': 0.26,
              'circle-blur': 0.65,
            },
          });
          instance.addLayer({
            id: 'atmos-location-point',
            type: 'circle',
            source: 'atmos-current-location',
            paint: {
              'circle-radius': 7,
              'circle-color': currentMarker.markerColor,
              'circle-stroke-color': '#173b3c',
              'circle-stroke-width': 3,
            },
          });
        };

        const addPlaceOverlaySources = () => {
          if (!instance.getSource('atmos-saved-locations')) {
            instance.addSource('atmos-saved-locations', {
              type: 'geojson',
              data: createSavedPlaceCollection(propsRef.current.savedLocations),
            });
            instance.addLayer({
              id: 'atmos-saved-location-points',
              type: 'circle',
              source: 'atmos-saved-locations',
              paint: {
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 4, 8, 7, 14, 10],
                'circle-color': [
                  'case',
                  ['==', ['get', 'isDefault'], true],
                  '#d98b38',
                  ['==', ['get', 'isFavorite'], true],
                  '#4269ad',
                  '#3f8179',
                ],
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 2,
              },
            });
            instance.addLayer({
              id: 'atmos-saved-location-labels',
              type: 'symbol',
              source: 'atmos-saved-locations',
              layout: {
                'text-field': ['get', 'name'],
                'text-size': 10,
                'text-offset': [0, 1.25],
                'text-anchor': 'top',
                'text-allow-overlap': true,
              },
              paint: {
                'text-color': '#183236',
                'text-halo-color': '#ffffff',
                'text-halo-width': 1.5,
              },
            });
          }
          if (!instance.getSource('atmos-aqi-points')) {
            instance.addSource('atmos-aqi-points', {
              type: 'geojson',
              data: createAqiPlaceCollection([]),
            });
            instance.addLayer({
              id: 'atmos-aqi-point-circles',
              type: 'circle',
              source: 'atmos-aqi-points',
              layout: { visibility: 'none' },
              paint: {
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 7, 8, 12, 14, 16],
                'circle-color': [
                  'case',
                  ['==', ['get', 'usAqi'], null],
                  '#76869a',
                  ['<=', ['get', 'usAqi'], 50],
                  '#4fa779',
                  ['<=', ['get', 'usAqi'], 100],
                  '#d5ad35',
                  ['<=', ['get', 'usAqi'], 150],
                  '#df873b',
                  ['<=', ['get', 'usAqi'], 200],
                  '#d85a50',
                  ['<=', ['get', 'usAqi'], 300],
                  '#a16bb0',
                  '#8d536f',
                ],
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 2,
                'circle-translate': [0, -12],
              },
            });
            instance.addLayer({
              id: 'atmos-aqi-point-labels',
              type: 'symbol',
              source: 'atmos-aqi-points',
              layout: {
                visibility: 'none',
                'text-field': [
                  'case',
                  ['==', ['get', 'usAqi'], null],
                  '—',
                  ['to-string', ['round', ['get', 'usAqi']]],
                ],
                'text-size': 10,
                'text-allow-overlap': true,
              },
              paint: {
                'text-color': '#ffffff',
                'text-halo-color': '#183236',
                'text-halo-width': 1.5,
              },
            });
          }
        };

        const showPreview = (city: MapCity, delay = 280) => {
          if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
          if (closeTimer.current) window.clearTimeout(closeTimer.current);
          activeCityKey.current = city.key;

          previewController.current?.abort();
          const generation = ++previewGeneration.current;
          const currentDashboard = propsRef.current.dashboard;
          if (
            Math.abs(city.latitude - currentDashboard.location.latitude) < 0.001 &&
            Math.abs(city.longitude - currentDashboard.location.longitude) < 0.001
          ) {
            setPreview({ city, status: 'ready', dashboard: currentDashboard });
            return;
          }
          const cached = previewCache.current.get(city.key);
          if (cached && Date.now() - cached.storedAt < cityPreviewCacheMilliseconds) {
            setPreview({ city, status: 'ready', dashboard: cached.data });
            return;
          }

          setPreview({ city, status: 'loading' });
          debounceTimer.current = window.setTimeout(() => {
            const now = Date.now();
            const budget = reserveAutomaticCityPreviewSlot(previewRequests.current, now);
            previewRequests.current = budget.timestamps;
            if (!budget.allowed) {
              setPreview({ city, status: 'limited' });
              return;
            }
            previewRequests.current.push(now);
            const controller = new AbortController();
            previewController.current = controller;

            void (async () => {
              try {
                const response = await fetchPublicDashboard(
                  {
                    latitude: city.latitude,
                    longitude: city.longitude,
                    timezone: 'auto',
                    units: 'metric',
                  },
                  { signal: controller.signal },
                );
                const parsed = dashboardSchema.safeParse(await response.json());
                if (!response.ok || !parsed.success) throw new Error('City weather unavailable');
                if (disposed || generation !== previewGeneration.current) return;
                const cityDashboard: DashboardData = {
                  ...parsed.data,
                  location: {
                    ...parsed.data.location,
                    id: `map:${city.key}`,
                    name: city.name,
                    country: city.country ?? parsed.data.location.country,
                    latitude: city.latitude,
                    longitude: city.longitude,
                  },
                };
                previewCache.current.set(city.key, { data: cityDashboard, storedAt: Date.now() });
                setPreview({ city, status: 'ready', dashboard: cityDashboard });
              } catch {
                if (!disposed && generation === previewGeneration.current) {
                  setPreview({ city, status: 'unavailable' });
                }
              }
            })();
          }, delay);
        };

        const closePreviewSoon = () => {
          if (closeTimer.current) window.clearTimeout(closeTimer.current);
          closeTimer.current = window.setTimeout(() => {
            if (previewPanelHovered.current) return;
            if (debounceTimer.current) {
              window.clearTimeout(debounceTimer.current);
              debounceTimer.current = undefined;
            }
            previewController.current?.abort();
            previewGeneration.current += 1;
            setPreview(undefined);
          }, 900);
        };

        const handlePointerMove = (event: MapMouseEvent) => {
          const layers = [
            ...cityLayerIds,
            'atmos-saved-location-points',
            'atmos-aqi-point-circles',
          ].filter((layer) => instance.getLayer(layer));
          const feature = layers.length
            ? instance.queryRenderedFeatures(event.point, { layers })[0]
            : undefined;
          const current = propsRef.current.dashboard;
          const currentPoint = instance.project([
            current.location.longitude,
            current.location.latitude,
          ]);
          const currentPinHovered =
            Math.hypot(currentPoint.x - event.point.x, currentPoint.y - event.point.y) <= 18;
          const city = currentPinHovered
            ? currentDashboardCity(current)
            : feature
              ? asCity(feature)
              : undefined;
          if (!city) {
            activeCityKey.current = undefined;
            instance.getCanvas().style.cursor = 'crosshair';
            closePreviewSoon();
            return;
          }
          instance.getCanvas().style.cursor = 'pointer';
          if (activeCityKey.current === city.key) return;
          showPreview(city);
        };

        const handleMapClick = (event: MapMouseEvent) => {
          const layers = [
            'atmos-aqi-point-circles',
            'atmos-saved-location-points',
            ...cityLayerIds,
          ].filter((layer) => instance.getLayer(layer));
          const feature = layers.length
            ? instance.queryRenderedFeatures(event.point, { layers })[0]
            : undefined;
          const current = propsRef.current.dashboard;
          const projected = instance.project([
            current.location.longitude,
            current.location.latitude,
          ]);
          const isCurrent =
            Math.hypot(projected.x - event.point.x, projected.y - event.point.y) <= 18;
          const city = isCurrent
            ? currentDashboardCity(current)
            : feature
              ? asCity(feature)
              : undefined;
          const point = event.lngLat;
          showPreview(
            city ?? {
              key: `coordinates:${point.lat.toFixed(5)}:${point.lng.toFixed(5)}`,
              name: `${point.lat.toFixed(2)}°, ${point.lng.toFixed(2)}°`,
              country: 'Selected coordinates',
              latitude: point.lat,
              longitude: point.lng,
              placeClass: 'coordinates',
            },
            0,
          );
        };

        const handlePointerLeave = () => {
          activeCityKey.current = undefined;
          instance.getCanvas().style.cursor = '';
          closePreviewSoon();
        };

        instance.once('style.load', () => {
          if (disposed) return;
          stopObservingAppearance = observeMapAppearance(instance);
          setMapReady(true);
          setMapError(false);
          if (styleTimeout) window.clearTimeout(styleTimeout);
          addWeatherMarker();
          addPlaceOverlaySources();
          const layers = instance.getStyle().layers ?? [];
          cityLayerIds = mapCityLayerIds(layers);
          hasPlaceLayers = cityLayerIds.length > 0;
          if (!hasPlaceLayers) cityLayerIds.push('atmos-location-point');
          setCityLayersAvailable(hasPlaceLayers);
          instance.on('mousemove', handlePointerMove);
          instance.on('mouseout', handlePointerLeave);
          instance.on('idle', collectVisibleCities);
          instance.on('idle', collectVisibleSavedLocations);
          instance.on('moveend', collectVisibleSavedLocations);
          instance.on('click', handleMapClick);
          collectVisibleCities();
          collectVisibleSavedLocations();
        });

        instance.on('error', () => {
          if (!mapLoadComplete && !disposed) setMapError(true);
        });
        instance.once('load', () => {
          if (disposed) return;
          mapLoadComplete = true;
          setMapReady(true);
          setMapError(false);
          if (styleTimeout) window.clearTimeout(styleTimeout);
        });
        styleTimeout = window.setTimeout(() => {
          if (!mapLoadComplete && !disposed) setMapError(true);
        }, 12_000);
      } catch {
        if (!disposed) setMapError(true);
      }
    }

    void initializeMap();
    const observer = new ResizeObserver(() => mapRef.current?.resize());
    observer.observe(container);

    return () => {
      disposed = true;
      if (styleTimeout) window.clearTimeout(styleTimeout);
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
      previewController.current?.abort();
      stopObservingAppearance?.();
      collectSavedLocationsRef.current = () => {};
      mapRef.current?.remove();
      mapRef.current = null;
      observer.disconnect();
    };
    // Keep one map instance for the lifetime of the map card; data updates use its GeoJSON source.
  }, [gatewayOrigin]);

  useEffect(() => {
    const resizeMap = () => {
      window.requestAnimationFrame(() => mapRef.current?.resize());
    };
    window.addEventListener('hashchange', resizeMap);
    return () => window.removeEventListener('hashchange', resizeMap);
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource('atmos-current-location') as GeoJSONSource | undefined;
    if (!source) return;
    const currentMarker = createLocationMapData(dashboard.location, dashboard.current);
    source.setData(currentMarker.point);
    if (map.getLayer('atmos-location-glow')) {
      map.setPaintProperty('atmos-location-glow', 'circle-color', currentMarker.markerColor);
    }
    if (map.getLayer('atmos-location-point')) {
      map.setPaintProperty('atmos-location-point', 'circle-color', currentMarker.markerColor);
    }
  }, [dashboard.current.condition, dashboard.location.latitude, dashboard.location.longitude]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource('atmos-saved-locations') as GeoJSONSource | undefined;
    source?.setData(createSavedPlaceCollection(savedLocations));
    collectSavedLocationsRef.current();
  }, [mapReady, savedLocations]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource('atmos-aqi-points') as GeoJSONSource | undefined;
    source?.setData(createAqiPlaceCollection(aqiMapPoints));
  }, [aqiMapPoints, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const visibility = aqiVisible ? 'visible' : 'none';
    for (const layerId of ['atmos-aqi-point-circles', 'atmos-aqi-point-labels']) {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', visibility);
    }
  }, [aqiVisible, mapReady]);

  useEffect(() => {
    if (!mapReady) return;
    const controller = new AbortController();

    void (async () => {
      try {
        const url = new URL('/api/v1/weather/map/layers', gatewayOrigin);
        const response = await fetch(url, {
          cache: 'no-store',
          headers: versionAffinityHeaders(),
          signal: controller.signal,
        });
        const parsed = weatherMapConfigurationSchema.safeParse(await response.json());
        setOpenWeatherAvailable(
          !controller.signal.aborted &&
            response.ok &&
            parsed.success &&
            parsed.data.openWeatherAvailable,
        );
      } catch {
        if (!controller.signal.aborted) setOpenWeatherAvailable(false);
      }
    })();

    return () => controller.abort();
  }, [gatewayOrigin, mapReady]);

  useEffect(() => {
    if (!mapReady || !radarVisible) {
      if (!radarVisible) setRadarPlaying(false);
      return;
    }

    const controller = new AbortController();
    let disposed = false;
    let loading = false;

    const loadTimeline = async () => {
      if (loading) return;
      loading = true;
      if (!radarTimelineRef.current) setRadarStatus('loading');
      try {
        const url = new URL('/api/v1/weather/radar/frames', gatewayOrigin);
        const response = await fetch(url, {
          cache: 'no-store',
          headers: versionAffinityHeaders(),
          signal: controller.signal,
        });
        const parsed = weatherRadarTimelineSchema.safeParse(await response.json());
        if (!response.ok || !parsed.success || parsed.data.frames.length === 0) {
          throw new Error('Radar timeline unavailable');
        }
        if (disposed) return;

        const latestFrame = parsed.data.frames.at(-1);
        if (!latestFrame) throw new Error('Radar timeline contains no frames');
        const previousTimeline = radarTimelineRef.current;
        const previousSelection = selectedRadarTimestampRef.current;
        const wasFollowingLatest =
          !previousTimeline || previousSelection === previousTimeline.frames.at(-1)?.timestamp;
        const nextSelection =
          wasFollowingLatest ||
          !parsed.data.frames.some((frame) => frame.timestamp === previousSelection)
            ? latestFrame.timestamp
            : previousSelection;
        radarTimelineRef.current = parsed.data;
        selectedRadarTimestampRef.current = nextSelection;
        setRadarTimeline(parsed.data);
        setSelectedRadarTimestamp(nextSelection);
        setRadarStatus('ready');
      } catch {
        if (!disposed && !controller.signal.aborted) {
          setRadarStatus(radarTimelineRef.current ? 'ready' : 'unavailable');
          setRadarPlaying(false);
        }
      } finally {
        loading = false;
      }
    };

    void loadTimeline();
    const refreshInterval = window.setInterval(() => void loadTimeline(), 5 * 60 * 1000);
    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(refreshInterval);
    };
  }, [gatewayOrigin, mapReady, radarVisible]);

  useEffect(() => {
    if (!mapReady || !aqiVisible) {
      if (!aqiVisible) {
        aqiController.current?.abort();
        aqiGeneration.current += 1;
        setAqiMapStatus('idle');
      }
      return;
    }

    aqiController.current?.abort();
    const controller = new AbortController();
    aqiController.current = controller;
    const generation = ++aqiGeneration.current;
    let disposed = false;
    const results = new Map<string, AqiMapPoint>();
    const candidatesToFetch: (typeof aqiCandidates)[number][] = [];
    const now = Date.now();
    const manualRetry = aqiMapRetry !== aqiMapRetryRef.current;
    aqiMapRetryRef.current = aqiMapRetry;

    for (const candidate of aqiCandidates) {
      const key = aqiMapSampleKey(candidate);
      const cached = aqiCache.current.get(key);
      if (manualRetry && cached?.point.status === 'unavailable') {
        aqiCache.current.delete(key);
      }
      const nextCached = aqiCache.current.get(key);
      const cacheTtl =
        nextCached?.point.status === 'unavailable'
          ? failedAqiMapCacheMilliseconds
          : aqiMapCacheMilliseconds;
      if (nextCached && now - nextCached.storedAt < cacheTtl) {
        results.set(key, nextCached.point);
      } else {
        if (nextCached) aqiCache.current.delete(key);
        candidatesToFetch.push(candidate);
      }
    }

    setAqiMapPoints([...results.values()]);
    const reservation = reserveAqiMapSampleSlots(
      aqiRequestTimestamps.current,
      now,
      candidatesToFetch.length,
    );
    aqiRequestTimestamps.current = reservation.timestamps;
    const reservedCandidates = candidatesToFetch.slice(0, reservation.reserved);
    const rateLimitedCandidates = candidatesToFetch.slice(reservation.reserved);

    const storePoint = (candidate: (typeof aqiCandidates)[number], point: AqiMapPoint) => {
      const key = aqiMapSampleKey(candidate);
      if (!aqiCache.current.has(key) && aqiCache.current.size >= maxAqiMapCacheEntries) {
        const oldestKey = aqiCache.current.keys().next().value;
        if (oldestKey !== undefined) aqiCache.current.delete(oldestKey);
      }
      aqiCache.current.set(key, { point, storedAt: Date.now() });
      results.set(key, point);
    };

    if (reservedCandidates.length === 0) {
      const points = aqiCandidates.map((candidate) => {
        const key = aqiMapSampleKey(candidate);
        return results.get(key) ?? createUnavailableAqiMapPoint(candidate, 'rate-limited');
      });
      setAqiMapPoints(points);
      setAqiMapStatus(
        rateLimitedCandidates.length > 0
          ? 'limited'
          : points.length > 0 && points.every((point) => point.status === 'unavailable')
            ? 'unavailable'
            : 'ready',
      );
      return () => {
        disposed = true;
        controller.abort();
      };
    }

    setAqiMapStatus('loading');
    let startedRequests = 0;

    const fetchCandidate = async (candidate: (typeof aqiCandidates)[number]) => {
      if (controller.signal.aborted) return;
      startedRequests += 1;
      try {
        const response = await fetchPublicAirQuality(
          { latitude: candidate.latitude, longitude: candidate.longitude },
          { signal: controller.signal },
        );
        const parsed = airQualitySchema.safeParse(await response.json().catch(() => undefined));
        if (!response.ok || !parsed.success) throw new Error('AQI sample unavailable');
        storePoint(candidate, {
          ...candidate,
          usAqi: parsed.data.usAqi,
          europeanAqi: parsed.data.europeanAqi,
          observedAt: parsed.data.observedAt,
          stale: parsed.data.meta.stale,
          status: 'ready',
        });
      } catch {
        if (!controller.signal.aborted) {
          storePoint(candidate, createUnavailableAqiMapPoint(candidate, 'unavailable'));
        }
      }
    };

    void (async () => {
      await runWithConcurrency(reservedCandidates, maxConcurrentAqiMapRequests, fetchCandidate);
      if (disposed || controller.signal.aborted || generation !== aqiGeneration.current) return;
      const points = aqiCandidates.map((candidate) => {
        const key = aqiMapSampleKey(candidate);
        return (
          results.get(key) ??
          createUnavailableAqiMapPoint(
            candidate,
            rateLimitedCandidates.some((limited) => aqiMapSampleKey(limited) === key)
              ? 'rate-limited'
              : 'unavailable',
          )
        );
      });
      setAqiMapPoints(points);
      if (
        rateLimitedCandidates.length > 0 ||
        points.some((point) => point.status === 'rate-limited')
      ) {
        setAqiMapStatus('limited');
      } else if (points.every((point) => point.status === 'unavailable')) {
        setAqiMapStatus('unavailable');
      } else {
        setAqiMapStatus('ready');
      }
    })();

    return () => {
      disposed = true;
      controller.abort();
      const unstartedReservations = reservedCandidates.length - startedRequests;
      if (unstartedReservations > 0) {
        aqiRequestTimestamps.current.splice(-unstartedReservations, unstartedReservations);
      }
      if (aqiController.current === controller) aqiController.current = null;
    };
  }, [aqiCandidateKey, aqiCandidates, aqiMapRetry, aqiVisible, gatewayOrigin, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const isRadarLayer = selectedMapLayer === 'rainviewer';
    const overlayProvider = isRadarLayer ? 'rainviewer' : 'openweather';
    const selectedOpenWeatherLayer = openWeatherMapLayerSchema.safeParse(selectedMapLayer);
    const frame = isRadarLayer
      ? radarTimeline?.frames.find((item) => item.timestamp === selectedRadarTimestamp)
      : undefined;
    const layerExists = Boolean(map.getLayer(weatherOverlayLayerId));
    let tileTemplate: string | undefined;
    let maxzoom = rainViewerMaximumZoom;

    if (isRadarLayer && frame) {
      tileTemplate = rainViewerTileTemplate(frame.path);
    } else if (selectedOpenWeatherLayer.success && openWeatherAvailable) {
      tileTemplate = openWeatherTileTemplate(gatewayOrigin, selectedOpenWeatherLayer.data);
      maxzoom = 17;
    }

    if (!tileTemplate) {
      if (layerExists) map.setLayoutProperty(weatherOverlayLayerId, 'visibility', 'none');
      return;
    }

    let source = map.getSource(weatherOverlaySourceId) as RasterTileSource | undefined;
    if (source && weatherOverlayProviderRef.current !== overlayProvider) {
      if (layerExists) map.removeLayer(weatherOverlayLayerId);
      map.removeSource(weatherOverlaySourceId);
      source = undefined;
    }
    if (!source) {
      map.addSource(weatherOverlaySourceId, {
        type: 'raster',
        tiles: [tileTemplate],
        tileSize: 256,
        minzoom: isRadarLayer ? 2 : 0,
        maxzoom,
        attribution: isRadarLayer ? 'RainViewer' : 'OpenWeather',
      });
      const styleLayers = map.getStyle().layers ?? [];
      const firstSymbolLayer = styleLayers.find((layer) => layer.type === 'symbol')?.id;
      const beforeLayer =
        firstSymbolLayer ??
        (map.getLayer('atmos-location-glow') ? 'atmos-location-glow' : undefined);
      map.addLayer(
        {
          id: weatherOverlayLayerId,
          type: 'raster',
          source: weatherOverlaySourceId,
          paint: { 'raster-opacity': radarOpacity, 'raster-fade-duration': 180 },
        },
        beforeLayer,
      );
      weatherOverlayProviderRef.current = overlayProvider;
    } else {
      if (source.tiles[0] !== tileTemplate) source.setTiles([tileTemplate]);
      if (layerExists) map.setLayoutProperty(weatherOverlayLayerId, 'visibility', 'visible');
      map.setPaintProperty(weatherOverlayLayerId, 'raster-opacity', radarOpacity);
      weatherOverlayProviderRef.current = overlayProvider;
    }
  }, [
    gatewayOrigin,
    mapReady,
    openWeatherAvailable,
    radarOpacity,
    radarTimeline,
    radarVisible,
    selectedMapLayer,
    selectedRadarTimestamp,
  ]);

  useEffect(() => {
    if (!radarPlaying || !radarVisible || (radarTimeline?.frames.length ?? 0) < 2) return;
    const timer = window.setInterval(() => {
      const frames = radarTimelineRef.current?.frames ?? [];
      if (frames.length < 2) return;
      const currentIndex = frames.findIndex(
        (frame) => frame.timestamp === selectedRadarTimestampRef.current,
      );
      const nextFrame = frames[(Math.max(currentIndex, 0) + 1) % frames.length];
      if (!nextFrame) return;
      selectedRadarTimestampRef.current = nextFrame.timestamp;
      setSelectedRadarTimestamp(nextFrame.timestamp);
    }, rainViewerPlaybackIntervalMilliseconds);
    return () => window.clearInterval(timer);
  }, [radarPlaying, radarTimeline, radarVisible]);

  useEffect(() => {
    mapRef.current?.easeTo({
      center: [dashboard.location.longitude, dashboard.location.latitude],
      duration: 650,
    });
    setPickerValue('');
    if (mapReady && !cityLayersAvailable) {
      setVisibleCities([currentDashboardCity(dashboard)]);
    }
  }, [
    cityLayersAvailable,
    dashboard.location.country,
    dashboard.location.latitude,
    dashboard.location.longitude,
    dashboard.location.name,
    mapReady,
  ]);

  function previewFromPicker(cityKey: string) {
    setPickerValue(cityKey);
    const city = visibleCities.find((item) => item.key === cityKey);
    if (!city) return;
    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    previewController.current?.abort();
    const generation = ++previewGeneration.current;
    activeCityKey.current = undefined;
    const matchingCurrent =
      Math.abs(city.latitude - dashboard.location.latitude) < 0.001 &&
      Math.abs(city.longitude - dashboard.location.longitude) < 0.001;
    if (matchingCurrent) {
      setPreview({ city, status: 'ready', dashboard });
      return;
    }
    const cached = previewCache.current.get(city.key);
    if (cached && Date.now() - cached.storedAt < cityPreviewCacheMilliseconds) {
      setPreview({ city, status: 'ready', dashboard: cached.data });
      return;
    }
    setPreview({ city, status: 'loading' });
    const controller = new AbortController();
    previewController.current = controller;
    void fetchPublicDashboard(
      {
        latitude: city.latitude,
        longitude: city.longitude,
        timezone: 'auto',
        units: 'metric',
      },
      { signal: controller.signal },
    )
      .then(async (response) => {
        const parsed = dashboardSchema.safeParse(await response.json());
        if (!response.ok || !parsed.success) throw new Error('City weather unavailable');
        if (generation !== previewGeneration.current) return;
        const cityDashboard: DashboardData = {
          ...parsed.data,
          location: {
            ...parsed.data.location,
            id: `map:${city.key}`,
            name: city.name,
            country: city.country ?? parsed.data.location.country,
            latitude: city.latitude,
            longitude: city.longitude,
          },
        };
        previewCache.current.set(city.key, { data: cityDashboard, storedAt: Date.now() });
        setPreview({ city, status: 'ready', dashboard: cityDashboard });
      })
      .catch(() => {
        if (generation === previewGeneration.current) setPreview({ city, status: 'unavailable' });
      });
  }

  async function openPreviewCity() {
    if (!preview) return;
    if (preview.dashboard) {
      onSelectLocation(preview.dashboard);
      setPreview(undefined);
      return;
    }
    setOpeningCity(true);
    const opened = await onOpenLocation(locationForCity(preview.city));
    setOpeningCity(false);
    if (opened) setPreview(undefined);
    else setPreview({ city: preview.city, status: 'unavailable' });
  }

  function selectRadarFrame(index: number) {
    const frame = radarTimeline?.frames[index];
    if (!frame) return;
    selectedRadarTimestampRef.current = frame.timestamp;
    setSelectedRadarTimestamp(frame.timestamp);
    setRadarPlaying(false);
  }

  function stepRadarFrame(direction: -1 | 1) {
    const frames = radarTimeline?.frames ?? [];
    if (frames.length < 2) return;
    const currentIndex = frames.findIndex(
      (frame) => frame.timestamp === selectedRadarTimestampRef.current,
    );
    const nextIndex = (Math.max(currentIndex, 0) + direction + frames.length) % frames.length;
    selectRadarFrame(nextIndex);
  }

  function recenter() {
    mapRef.current?.easeTo({
      center: [dashboard.location.longitude, dashboard.location.latitude],
      zoom: Math.max(mapRef.current.getZoom(), 8),
      duration: 650,
    });
  }

  const radarFrames = radarTimeline?.frames ?? [];
  const selectedRadarFrameIndex = radarFrames.findIndex(
    (frame) => frame.timestamp === selectedRadarTimestamp,
  );
  const selectedRadarFrame = radarFrames[selectedRadarFrameIndex];
  const selectedOpenWeatherLayer = openWeatherMapLayerSchema.safeParse(selectedMapLayer);
  const selectedOpenWeatherLegend = selectedOpenWeatherLayer.success
    ? openWeatherMapLegend(selectedOpenWeatherLayer.data)
    : undefined;

  return (
    <article className="map-card" id="map" aria-labelledby="map-title" tabIndex={-1}>
      <div className="local-map-canvas" ref={mapElement} aria-label="Interactive weather map" />
      <header className="map-overlay-heading">
        <div>
          <p className="eyebrow">
            {observatory ? 'Map-first perspective' : 'A change of perspective'}
          </p>
          <h2 id="map-title">{observatory ? 'Observatory' : 'Weather, beyond your window.'}</h2>
        </div>
        <div className="map-overlay-actions">
          <a
            className="map-fullscreen-open"
            href="#map"
            aria-label="Open full map view"
            title="Open full map view"
            ref={openMapLink}
            onClick={(event) => {
              viewOpener.current = event.currentTarget;
            }}
          >
            <Maximize2 size={16} aria-hidden="true" />
          </a>
          <a
            className="map-fullscreen-close"
            href="#dashboard"
            aria-label="Close full map view"
            title="Close full map view"
            ref={closeMapLink}
          >
            <Minimize2 size={16} aria-hidden="true" />
          </a>
          <button
            type="button"
            className="map-recenter"
            onClick={recenter}
            aria-label="Recenter map"
          >
            <LocateFixed size={17} aria-hidden="true" />
          </button>
        </div>
      </header>
      <label className="map-layer-control">
        <span>Map layer</span>
        <select
          aria-label="Weather map layer"
          value={selectedMapLayer}
          onChange={(event) => {
            const value = event.target.value;
            if (value === 'cities' || value === 'rainviewer' || value === 'aqi') {
              setSelectedMapLayer(value);
            } else {
              const openWeatherLayer = openWeatherMapLayerSchema.safeParse(value);
              if (openWeatherLayer.success && openWeatherAvailable) {
                setSelectedMapLayer(openWeatherLayer.data);
              }
            }
            if (value !== 'rainviewer') setRadarPlaying(false);
          }}
        >
          <option value="cities">City map only</option>
          <option value="rainviewer">RainViewer radar</option>
          <option value="aqi">Air-quality sample points</option>
          <optgroup label="OpenWeather · current maps">
            {openWeatherAvailable ? (
              openWeatherMapLayerSchema.options.map((layer) => (
                <option key={layer} value={layer}>
                  {openWeatherLayerLabels[layer]}
                </option>
              ))
            ) : (
              <option value="openweather-disabled" disabled>
                Configure a server API key to enable
              </option>
            )}
          </optgroup>
        </select>
      </label>
      {selectedOpenWeatherLayer.success ? (
        <div className="map-current-layer-status">
          <p role="status">
            OpenWeather · {openWeatherLayerLabels[selectedOpenWeatherLayer.data]} · current snapshot
          </p>
          {selectedOpenWeatherLegend ? (
            <div
              className="map-layer-legend"
              aria-label={`${openWeatherLayerLabels[selectedOpenWeatherLayer.data]} legend`}
            >
              <p>Provider scale · stops shown in selected units</p>
              <div
                className="map-layer-color-ramp"
                aria-hidden="true"
                style={{
                  background: `linear-gradient(90deg, ${selectedOpenWeatherLegend.stops
                    .map(
                      (stop, index, stops) =>
                        `${stop.color} ${(index / Math.max(1, stops.length - 1)) * 100}%`,
                    )
                    .join(', ')})`,
                }}
              />
              <ol
                className="map-layer-color-stops"
                aria-label="Map color scale thresholds"
                tabIndex={0}
              >
                {selectedOpenWeatherLegend.stops.map((stop) => (
                  <li key={stop.value}>
                    <span aria-hidden="true" style={{ backgroundColor: stop.color }} />
                    {formatOpenWeatherLegendValue(stop.value, selectedOpenWeatherLayer.data, units)}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          <label className="map-current-layer-opacity">
            <span>Overlay opacity</span>
            <input
              type="range"
              min={0.15}
              max={0.85}
              step={0.05}
              value={radarOpacity}
              aria-label="Weather overlay opacity"
              onChange={(event) => setRadarOpacity(Number(event.target.value))}
            />
          </label>
        </div>
      ) : null}
      {aqiVisible ? (
        <section className="map-aqi-controls" aria-label="Air quality map samples" tabIndex={0}>
          <div className="map-aqi-heading">
            <div>
              <p className="eyebrow">Modeled air quality</p>
              <h3>Point samples</h3>
            </div>
            <button
              type="button"
              aria-label="Refresh air-quality map samples"
              disabled={aqiMapStatus === 'loading'}
              onClick={() => setAqiMapRetry((retry) => retry + 1)}
            >
              <RefreshCw size={15} aria-hidden="true" />
            </button>
          </div>
          <p className="map-aqi-explanation">
            Current estimates at this place and up to seven visible saved places. Dots only—not a
            continuous surface.
          </p>
          {aqiMapStatus === 'loading' ? (
            <p className="map-aqi-status" role="status">
              Loading bounded AQI samples…
            </p>
          ) : null}
          {aqiMapStatus === 'unavailable' ? (
            <p className="map-aqi-status" role="status">
              AQI is unavailable for these locations right now. Unavailable values are not shown as
              zero.
            </p>
          ) : null}
          {aqiMapStatus === 'limited' ? (
            <p className="map-aqi-status" role="status">
              Some places were not sampled. This map session allows 12 new samples per minute; retry
              after a minute.
            </p>
          ) : null}
          <ul className="map-aqi-sample-list" aria-label="Sampled location values" tabIndex={0}>
            {aqiCandidates.map((candidate) => {
              const point = aqiMapPoints.find(
                (item) => aqiMapSampleKey(item) === aqiMapSampleKey(candidate),
              );
              const value =
                point?.status === 'ready'
                  ? point.usAqi === null
                    ? 'Unavailable'
                    : String(Math.round(point.usAqi))
                  : point?.status === 'rate-limited'
                    ? 'Not sampled'
                    : point?.status === 'unavailable'
                      ? 'Unavailable'
                      : aqiMapStatus === 'loading'
                        ? 'Loading…'
                        : 'Not sampled';
              return (
                <li key={candidate.id}>
                  <span
                    className="map-aqi-dot"
                    aria-hidden="true"
                    style={{ backgroundColor: aqiMarkerColor(point?.usAqi ?? null) }}
                  />
                  <span className="map-aqi-place-name">{candidate.name}</span>
                  <span className="map-aqi-value">U.S. AQI {value}</span>
                  {point?.status === 'ready' ? (
                    <small>
                      European AQI{' '}
                      {point.europeanAqi === null ? 'Unavailable' : Math.round(point.europeanAqi)}
                      {point.observedAt
                        ? ` · ${new Intl.DateTimeFormat('en', {
                            hour: 'numeric',
                            minute: '2-digit',
                            timeZone: 'UTC',
                          }).format(new Date(point.observedAt))} UTC`
                        : ''}
                      {point.stale ? ' · cached estimate' : ''}
                    </small>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <div className="map-aqi-legend" role="list" aria-label="U.S. AQI color legend">
            {usAqiMapLegend.map((item) => (
              <span
                key={item.label}
                role="listitem"
                aria-label={`${item.range} ${item.label}`}
                title={item.label}
              >
                <i aria-hidden="true" style={{ backgroundColor: item.color }} />
                <strong>{item.range}</strong>{' '}
                {item.label === 'Unhealthy for sensitive groups' ? 'Sensitive groups' : item.label}
              </span>
            ))}
          </div>
          <p className="map-aqi-attribution">
            Model estimates (~11–45 km resolution), not station readings.{' '}
            <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
              Open-Meteo Air Quality API
            </a>{' '}
            ·{' '}
            <a href="https://atmosphere.copernicus.eu/" target="_blank" rel="noreferrer">
              CAMS
            </a>{' '}
            ·{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
              CC BY 4.0
            </a>
          </p>
        </section>
      ) : null}
      {radarVisible ? (
        <section className="map-radar-controls" aria-label="RainViewer radar playback">
          <div className="map-radar-controls-heading">
            <div>
              <p className="eyebrow">Recent radar</p>
              <p className="map-radar-source">
                RainViewer · past 2 h · 10-minute frames · 15 s playback
              </p>
            </div>
            <div className="map-radar-playback">
              <button
                type="button"
                aria-label="Previous radar frame"
                title="Previous radar frame"
                disabled={radarFrames.length < 2}
                onClick={() => stepRadarFrame(-1)}
              >
                <SkipBack size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={radarPlaying ? 'Pause radar animation' : 'Play radar animation'}
                title={radarPlaying ? 'Pause radar animation' : 'Play radar animation'}
                disabled={radarFrames.length < 2}
                onClick={() => setRadarPlaying((playing) => !playing)}
              >
                {radarPlaying ? (
                  <Pause size={15} aria-hidden="true" />
                ) : (
                  <Play size={15} aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                aria-label="Next radar frame"
                title="Next radar frame"
                disabled={radarFrames.length < 2}
                onClick={() => stepRadarFrame(1)}
              >
                <SkipForward size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
          {radarStatus === 'loading' ? (
            <p className="map-radar-status" role="status">
              Loading radar frames…
            </p>
          ) : null}
          {radarStatus === 'unavailable' ? (
            <p className="map-radar-status" role="status">
              Radar is unavailable right now. The city map is still available.
            </p>
          ) : null}
          {selectedRadarFrame ? (
            <>
              <label className="map-radar-timeline">
                <span className="sr-only">Radar frame time</span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, radarFrames.length - 1)}
                  step={1}
                  value={Math.max(0, selectedRadarFrameIndex)}
                  aria-label="Radar frame time"
                  aria-valuetext={formatRadarTimestamp(selectedRadarFrame.timestamp)}
                  onChange={(event) => selectRadarFrame(Number(event.target.value))}
                />
                <span>{formatRadarTimestamp(selectedRadarFrame.timestamp)}</span>
              </label>
              <details className="map-opacity-settings">
                <summary>Opacity</summary>
                <label className="map-radar-opacity">
                  <span>Overlay opacity</span>
                  <input
                    type="range"
                    min={0.15}
                    max={0.85}
                    step={0.05}
                    value={radarOpacity}
                    aria-label="Radar overlay opacity"
                    onChange={(event) => setRadarOpacity(Number(event.target.value))}
                  />
                </label>
              </details>
            </>
          ) : null}
        </section>
      ) : null}
      {!mapReady && !mapError ? (
        <p className="map-feedback" role="status">
          <RefreshCw size={14} className="refresh-spinning" aria-hidden="true" /> Loading map…
        </p>
      ) : null}
      {mapError ? (
        <p className="map-feedback map-error" role="status">
          Map tiles are unavailable. City search and forecasts are still available above.
        </p>
      ) : null}
      {mapReady && !cityLayersAvailable ? (
        <p className="map-feedback" role="status">
          City labels are unavailable in this map style. City search is still available above.
        </p>
      ) : null}
      {mapReady && cityLayersAvailable && visibleCities.length === 0 ? (
        <p className="map-feedback" role="status">
          No city labels are visible here yet. Pan or zoom the map to explore another area.
        </p>
      ) : null}
      {!aqiVisible && visibleCities.length > 0 ? (
        <label className="map-city-picker">
          <MapPinned size={15} aria-hidden="true" />
          <span className="sr-only">Browse cities visible on the map</span>
          <select
            aria-label="Browse cities visible on the map"
            value={pickerValue}
            onChange={(event) => previewFromPicker(event.target.value)}
          >
            <option value="">Browse visible cities…</option>
            {visibleCities.map((city) => (
              <option key={city.key} value={city.key}>
                {city.name}
                {city.country ? `, ${city.country}` : ''}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {preview ? (
        <section
          className="map-weather-preview"
          aria-live="polite"
          aria-label={`Weather preview for ${preview.city.name}`}
          onMouseEnter={() => {
            previewPanelHovered.current = true;
            activeCityKey.current = undefined;
            if (closeTimer.current) window.clearTimeout(closeTimer.current);
          }}
          onMouseLeave={() => {
            previewPanelHovered.current = false;
            if (!activeCityKey.current) {
              previewController.current?.abort();
              previewGeneration.current += 1;
              setPreview(undefined);
            }
          }}
        >
          <div className="map-preview-heading">
            <div>
              <p className="eyebrow">
                {preview.city.placeClass === 'coordinates'
                  ? 'Selected map point'
                  : 'Place forecast'}
              </p>
              <h3>{preview.city.name}</h3>
              {preview.city.country ? <span>{preview.city.country}</span> : null}
            </div>
            <button
              type="button"
              className="map-preview-close"
              aria-label="Close city weather preview"
              onClick={() => setPreview(undefined)}
            >
              ×
            </button>
          </div>
          {preview.status === 'loading' ? <p role="status">Loading this city’s weather…</p> : null}
          {preview.status === 'unavailable' ? (
            <p role="status">Weather preview unavailable. You can still open this city to retry.</p>
          ) : null}
          {preview.status === 'limited' ? (
            <p role="status">Preview limit reached. Open the city to load its weather.</p>
          ) : null}
          {preview.status === 'ready' && preview.dashboard ? (
            <>
              <div className="map-preview-current">
                <strong>{temperature(preview.dashboard.current.temperatureC, units)}</strong>
                <span>{conditionLabel(preview.dashboard.current.condition)}</span>
              </div>
              <div className="map-preview-stats">
                <span>
                  Feels like {temperature(preview.dashboard.current.apparentTemperatureC, units)}
                </span>
                <span>Rain {preview.dashboard.hourly[0]?.precipitationProbability ?? '—'}%</span>
                <span>Humidity {preview.dashboard.current.humidityPercent}%</span>
                <span>{formatWindSpeed(preview.dashboard.current.windSpeedKph, units)} wind</span>
              </div>
              <p className="map-preview-freshness" role="status">
                {preview.dashboard.meta.stale ? 'Cached · observed ' : 'Observed '}
                {new Intl.DateTimeFormat('en', {
                  hour: 'numeric',
                  minute: '2-digit',
                  timeZone: preview.dashboard.location.timezone,
                }).format(new Date(preview.dashboard.current.observedAt))}
              </p>
            </>
          ) : null}
          <button
            type="button"
            className="map-open-city"
            onClick={() => void openPreviewCity()}
            disabled={openingCity}
          >
            {openingCity
              ? 'Opening…'
              : preview.city.placeClass === 'coordinates'
                ? 'Use this location'
                : `Open ${preview.city.name}`}
          </button>
        </section>
      ) : null}
      <p className="map-caption">
        Choose a label or click the map to preview a place. Use coordinate search above for keyboard
        entry.
      </p>
    </article>
  );
}
