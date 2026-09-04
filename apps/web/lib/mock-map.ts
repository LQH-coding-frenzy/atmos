import type { CurrentWeather, Location } from '@atmos/contracts';

export type MockMapData = {
  center: [number, number];
  point: {
    type: 'Feature';
    properties: { condition: CurrentWeather['condition'] };
    geometry: { type: 'Point'; coordinates: [number, number] };
  };
  markerColor: string;
};

const markerColors: Record<CurrentWeather['condition'], string> = {
  clear: '#d9e4e6',
  'partly-cloudy': '#cde8ed',
  cloudy: '#9da6b2',
  rain: '#8ebbc7',
  thunderstorm: '#c7a0d2',
  snow: '#eaf8fb',
};

export function createMockMapData(location: Location, current: CurrentWeather): MockMapData {
  // Home currently supplies MockWeatherProvider. Preserve its exact coordinates here;
  // live map tiles and weather overlays will replace this local rendering boundary later.
  const center: [number, number] = [location.longitude, location.latitude];
  return {
    center,
    point: {
      type: 'Feature',
      properties: { condition: current.condition },
      geometry: { type: 'Point', coordinates: center },
    },
    markerColor: markerColors[current.condition],
  };
}
