'use client';

import {
  dashboardSchema,
  type Dashboard as DashboardData,
  type LocationSearchResult,
  type UnitSystem,
  type WeatherCondition,
} from '@atmos/contracts';
import { formatTemperature, formatWindSpeed } from '@atmos/domain';
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  MapGeoJSONFeature,
  MapMouseEvent,
} from 'maplibre-gl';
import { LocateFixed, MapPinned, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createLocationMapData } from '../lib/location-map';
import {
  cityPreviewCacheMilliseconds,
  mapCityFromFeature,
  mapCityLayerIds,
  reserveAutomaticCityPreviewSlot,
  type MapCity,
} from '../lib/map-city';
import { versionAffinityHeaders } from '../lib/version-affinity';

const openFreeMapStyle = 'https://tiles.openfreemap.org/styles/liberty';

type DashboardMapProps = {
  dashboard: DashboardData;
  gatewayOrigin: string;
  units: UnitSystem;
  onSelectLocation: (dashboard: DashboardData) => void;
  onOpenLocation: (location: LocationSearchResult) => Promise<boolean>;
};

type CityPreview = {
  city: MapCity;
  status: 'loading' | 'ready' | 'unavailable' | 'limited';
  dashboard?: DashboardData;
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
  onSelectLocation,
  onOpenLocation,
}: DashboardMapProps) {
  const mapElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const propsRef = useRef({ dashboard, gatewayOrigin, onSelectLocation, onOpenLocation });
  propsRef.current = { dashboard, gatewayOrigin, onSelectLocation, onOpenLocation };

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [cityLayersAvailable, setCityLayersAvailable] = useState(false);
  const [visibleCities, setVisibleCities] = useState<MapCity[]>([]);
  const [preview, setPreview] = useState<CityPreview>();
  const [pickerValue, setPickerValue] = useState('');
  const [openingCity, setOpeningCity] = useState(false);
  const previewCache = useRef(new Map<string, { data: DashboardData; storedAt: number }>());
  const previewRequests = useRef<number[]>([]);
  const previewGeneration = useRef(0);
  const previewController = useRef<AbortController | null>(null);
  const debounceTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  const activeCityKey = useRef<string | undefined>(undefined);
  const previewPanelHovered = useRef(false);

  useEffect(() => {
    const container = mapElement.current;
    if (!container) return;

    let disposed = false;
    let mapLoadComplete = false;
    let styleTimeout: number | undefined;
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
        instance.addControl(
          new maplibregl.NavigationControl({ showCompass: false }),
          'bottom-right',
        );

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
                const url = new URL('/api/v1/weather/dashboard', propsRef.current.gatewayOrigin);
                url.search = new URLSearchParams({
                  lat: String(city.latitude),
                  lon: String(city.longitude),
                  timezone: 'auto',
                  units: 'metric',
                }).toString();
                const response = await fetch(url, {
                  cache: 'no-store',
                  headers: versionAffinityHeaders(),
                  signal: controller.signal,
                });
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
          const feature = cityLayerIds.length
            ? instance.queryRenderedFeatures(event.point, { layers: cityLayerIds })[0]
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
            instance.getCanvas().style.cursor = '';
            closePreviewSoon();
            return;
          }
          instance.getCanvas().style.cursor = 'pointer';
          if (activeCityKey.current === city.key) return;
          showPreview(city);
        };

        const handlePointerLeave = () => {
          activeCityKey.current = undefined;
          instance.getCanvas().style.cursor = '';
          closePreviewSoon();
        };

        instance.once('style.load', () => {
          if (disposed) return;
          setMapReady(true);
          setMapError(false);
          if (styleTimeout) window.clearTimeout(styleTimeout);
          addWeatherMarker();
          const layers = instance.getStyle().layers ?? [];
          cityLayerIds = mapCityLayerIds(layers);
          hasPlaceLayers = cityLayerIds.length > 0;
          if (!hasPlaceLayers) cityLayerIds.push('atmos-location-point');
          setCityLayersAvailable(hasPlaceLayers);
          instance.on('mousemove', handlePointerMove);
          instance.on('mouseout', handlePointerLeave);
          instance.on('idle', collectVisibleCities);
          collectVisibleCities();
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
      mapRef.current?.remove();
      mapRef.current = null;
      observer.disconnect();
    };
    // Keep one map instance for the lifetime of the map card; data updates use its GeoJSON source.
  }, [gatewayOrigin]);

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
    const url = new URL('/api/v1/weather/dashboard', gatewayOrigin);
    url.search = new URLSearchParams({
      lat: String(city.latitude),
      lon: String(city.longitude),
      timezone: 'auto',
      units: 'metric',
    }).toString();
    const controller = new AbortController();
    previewController.current = controller;
    void fetch(url, {
      cache: 'no-store',
      headers: versionAffinityHeaders(),
      signal: controller.signal,
    })
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

  function recenter() {
    mapRef.current?.easeTo({
      center: [dashboard.location.longitude, dashboard.location.latitude],
      zoom: Math.max(mapRef.current.getZoom(), 8),
      duration: 650,
    });
  }

  return (
    <article className="map-card" id="map" aria-labelledby="map-title">
      <div className="local-map-canvas" ref={mapElement} aria-label="Interactive weather map" />
      <header className="map-overlay-heading">
        <div>
          <p className="eyebrow">Weather watch</p>
          <h2 id="map-title">Explore nearby cities</h2>
        </div>
        <button type="button" className="map-recenter" onClick={recenter} aria-label="Recenter map">
          <LocateFixed size={17} aria-hidden="true" />
        </button>
      </header>
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
      {visibleCities.length > 0 ? (
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
              <p className="eyebrow">City forecast</p>
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
            {openingCity ? 'Opening…' : `Open ${preview.city.name}`}
          </button>
        </section>
      ) : null}
      <p className="map-caption">Hover a map label or choose a city to preview its weather.</p>
    </article>
  );
}
