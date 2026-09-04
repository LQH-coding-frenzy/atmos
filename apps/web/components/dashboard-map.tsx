'use client';

import type { Dashboard } from '@atmos/contracts';
import type { StyleSpecification } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { createMockMapData } from '../lib/mock-map';

type DashboardMapProps = {
  location: Dashboard['location'];
  current: Dashboard['current'];
};

export function DashboardMap({ location, current }: DashboardMapProps) {
  const mapElement = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mapContainer = mapElement.current;
    if (!mapContainer) return;

    const mapData = createMockMapData(location, current);
    let disposed = false;
    let map: { remove: () => void; resize: () => void } | undefined;

    async function initializeMap(container: HTMLDivElement) {
      const maplibregl = await import('maplibre-gl');
      if (disposed) return;

      const style: StyleSpecification = {
        version: 8,
        sources: {
          'current-weather': { type: 'geojson', data: mapData.point },
        },
        layers: [
          { id: 'background', type: 'background', paint: { 'background-color': '#1b2730' } },
          {
            id: 'current-weather-glow',
            type: 'circle',
            source: 'current-weather',
            paint: {
              'circle-radius': 24,
              'circle-color': mapData.markerColor,
              'circle-opacity': 0.14,
              'circle-blur': 0.5,
            },
          },
          {
            id: 'current-weather-point',
            type: 'circle',
            source: 'current-weather',
            paint: {
              'circle-radius': 7,
              'circle-color': mapData.markerColor,
              'circle-stroke-color': '#1d2a2f',
              'circle-stroke-width': 3,
            },
          },
        ],
      };

      const instance = new maplibregl.Map({
        container,
        style,
        center: mapData.center,
        zoom: 10,
        attributionControl: false,
      });
      instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
      new maplibregl.Marker({ color: mapData.markerColor })
        .setLngLat(mapData.center)
        .addTo(instance);
      map = instance;
    }

    void initializeMap(mapContainer);
    const observer = new ResizeObserver(() => map?.resize());
    observer.observe(mapContainer);

    return () => {
      disposed = true;
      observer.disconnect();
      map?.remove();
    };
  }, [current, location]);

  return (
    <article
      className="map-card"
      id="map"
      aria-label={`Interactive map centered on ${location.name}`}
    >
      <div className="local-map-canvas" ref={mapElement} />
      <p className="map-caption">Interactive local MapLibre view · mock dashboard location</p>
    </article>
  );
}
