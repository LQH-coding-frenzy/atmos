import type { OpenWeatherMapLayer } from '@atmos/contracts';

const rainViewerTileHost = 'https://tilecache.rainviewer.com';

export const rainViewerMaximumZoom = 7;
export const rainViewerPlaybackIntervalMilliseconds = 15_000;

export function rainViewerTileTemplate(path: string) {
  if (!/^\/v2\/radar\/[A-Za-z0-9_-]{1,64}$/.test(path)) return undefined;

  return `${rainViewerTileHost}${path}/256/{z}/{x}/{y}/2/1_0.png`;
}

export function openWeatherTileTemplate(gatewayOrigin: string, layer: OpenWeatherMapLayer) {
  try {
    const gateway = new URL(gatewayOrigin);
    if (
      gateway.protocol !== 'https:' &&
      gateway.hostname !== '127.0.0.1' &&
      gateway.hostname !== 'localhost'
    ) {
      return undefined;
    }
    return `${gateway.origin}/api/v1/weather/maps/openweather/${layer}/{z}/{x}/{y}`;
  } catch {
    return undefined;
  }
}

export function formatRadarTimestamp(timestamp: number, locale?: string) {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(timestamp * 1000));
}
