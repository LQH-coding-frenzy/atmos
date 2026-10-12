import type { CurrentWeather, Location } from '@atmos/contracts';

export type LocationMapData = {
  center: [number, number];
  point: {
    type: 'Feature';
    properties: {
      condition: CurrentWeather['condition'];
      class: 'city';
      name: string;
      country: string;
    };
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

export function createLocationMapData(
  location: Location,
  current: CurrentWeather,
): LocationMapData {
  const center: [number, number] = [location.longitude, location.latitude];
  return {
    center,
    point: {
      type: 'Feature',
      properties: {
        condition: current.condition,
        class: 'city',
        name: location.name,
        country: location.country,
      },
      geometry: { type: 'Point', coordinates: center },
    },
    markerColor: markerColors[current.condition],
  };
}
