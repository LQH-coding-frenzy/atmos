import { describe, expect, it } from 'vitest';
import type { SavedLocation } from '@atmos/contracts';
import {
  aqiMarkerColor,
  aqiMapSampleKey,
  createAqiPlaceCollection,
  createSavedPlaceCollection,
  createUnavailableAqiMapPoint,
  formatOpenWeatherLegendValue,
  maxAqiMapSamples,
  openWeatherMapLegend,
  reserveAqiMapSampleSlots,
  runWithConcurrency,
  selectAqiMapCandidates,
  usAqiMapLegend,
} from './map-overlays';

const saved: SavedLocation = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Home',
  latitude: 1,
  longitude: 2,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
  is_favorite: true,
  category: 'home',
  sort_order: 0,
  is_default: true,
};

describe('map data overlays and legends', () => {
  it('maps only caller-supplied owned place data to GeoJSON coordinates and metadata', () => {
    expect(createSavedPlaceCollection([saved]).features[0]).toMatchObject({
      id: saved.id,
      properties: {
        id: saved.id,
        name: 'Home',
        class: 'city',
        isFavorite: true,
        category: 'home',
        isDefault: true,
      },
      geometry: { type: 'Point', coordinates: [2, 1] },
    });
  });
  it('retains model, unavailable and stale metadata without fabricating AQI values', () => {
    const point = {
      id: 'current',
      name: 'Berlin',
      country: 'Germany',
      latitude: 52.5,
      longitude: 13.4,
      usAqi: null,
      europeanAqi: 35,
      observedAt: '2026-10-01T12:00:00Z',
      stale: true,
      status: 'ready' as const,
    };
    expect(createAqiPlaceCollection([point]).features[0]).toMatchObject({
      id: 'current',
      properties: { usAqi: null, europeanAqi: 35, stale: true, status: 'ready' },
      geometry: { coordinates: [13.4, 52.5] },
    });
    expect(createUnavailableAqiMapPoint(point, 'unavailable')).toMatchObject({
      usAqi: null,
      europeanAqi: null,
      observedAt: null,
      status: 'unavailable',
    });
  });
  it('bounds AQI sample candidates and deduplicates overlapping saved coordinates', () => {
    const candidates = selectAqiMapCandidates(
      { id: 'berlin', name: 'Berlin', country: 'Germany', latitude: 52.52, longitude: 13.405 },
      Array.from({ length: 20 }, (_, index) => ({
        ...saved,
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        name: `Place ${index + 1}`,
        latitude: index === 0 ? 52.52001 : index + 1,
      })),
    );
    expect(candidates).toHaveLength(maxAqiMapSamples);
    expect(new Set(candidates.map(aqiMapSampleKey)).size).toBe(candidates.length);
    expect(candidates[0]).toMatchObject({ name: 'Berlin', country: 'Germany' });
  });
  it('limits new AQI samples to twelve per rolling minute', () => {
    expect(reserveAqiMapSampleSlots([], 100_000, 8)).toMatchObject({ reserved: 8 });
    const timestamps = Array.from({ length: 10 }, (_, index) => 100_000 + index);
    expect(reserveAqiMapSampleSlots(timestamps, 100_100, 8).reserved).toBe(2);
    expect(reserveAqiMapSampleSlots([...timestamps, 100_100, 100_100], 100_200, 8).reserved).toBe(
      0,
    );
    expect(reserveAqiMapSampleSlots(timestamps, 160_010, 8).reserved).toBe(8);
  });
  it('keeps the AQI request worker pool within its concurrency bound', async () => {
    let inFlight = 0;
    let peakInFlight = 0;
    await runWithConcurrency(
      Array.from({ length: 8 }, (_, index) => index),
      2,
      async () => {
        inFlight += 1;
        peakInFlight = Math.max(peakInFlight, inFlight);
        await Promise.resolve();
        inFlight -= 1;
      },
    );
    expect(peakInFlight).toBe(2);
  });
  it('uses U.S.-AQI breakpoints consistently with the point legend', () => {
    expect(aqiMarkerColor(null)).toBe('#76869a');
    expect(aqiMarkerColor(50)).toBe(usAqiMapLegend[0].color);
    expect(aqiMarkerColor(51)).toBe(usAqiMapLegend[1].color);
    expect(aqiMarkerColor(101)).toBe(usAqiMapLegend[2].color);
    expect(aqiMarkerColor(151)).toBe(usAqiMapLegend[3].color);
    expect(aqiMarkerColor(201)).toBe(usAqiMapLegend[4].color);
    expect(aqiMarkerColor(301)).toBe(usAqiMapLegend[5].color);
  });
  it('provides quantitative published units/stops for all enabled OpenWeather layers', () => {
    expect(openWeatherMapLegend('precipitation_new')).toMatchObject({
      unit: 'mm',
      stops: [
        { value: 0 },
        { value: 0.1 },
        { value: 0.2 },
        { value: 0.5 },
        { value: 1 },
        { value: 10 },
        { value: 140 },
      ],
    });
    expect(openWeatherMapLegend('clouds_new')).toMatchObject({
      unit: '%',
      stops: [
        { value: 0 },
        { value: 10 },
        { value: 20 },
        { value: 30 },
        { value: 40 },
        { value: 50 },
        { value: 60 },
        { value: 70 },
        { value: 80 },
        { value: 90 },
        { value: 100 },
      ],
    });
    expect(openWeatherMapLegend('pressure_new')).toMatchObject({
      unit: 'hPa',
      stops: [
        { value: 940 },
        { value: 960 },
        { value: 980 },
        { value: 1000 },
        { value: 1010 },
        { value: 1020 },
        { value: 1040 },
        { value: 1060 },
        { value: 1080 },
      ],
    });
    expect(openWeatherMapLegend('wind_new')).toMatchObject({
      unit: 'm/s',
      stops: [
        { value: 1 },
        { value: 5 },
        { value: 15 },
        { value: 25 },
        { value: 50 },
        { value: 100 },
        { value: 200 },
      ],
    });
    expect(openWeatherMapLegend('temp_new')).toMatchObject({
      unit: '°C',
      stops: [
        { value: -65 },
        { value: -55 },
        { value: -45 },
        { value: -40 },
        { value: -30 },
        { value: -20 },
        { value: -10 },
        { value: 0 },
        { value: 10 },
        { value: 20 },
        { value: 25 },
        { value: 30 },
      ],
    });
    expect(formatOpenWeatherLegendValue(10, 'temp_new', 'imperial')).toBe('50°F');
    expect(formatOpenWeatherLegendValue(10, 'wind_new', 'metric')).toBe('36 km/h');
    expect(formatOpenWeatherLegendValue(1010, 'pressure_new', 'metric')).toBe('1,010 hPa');
  });
});
