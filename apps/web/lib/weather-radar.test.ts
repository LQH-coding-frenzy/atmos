import { describe, expect, it } from 'vitest';
import {
  formatRadarTimestamp,
  openWeatherTileTemplate,
  rainViewerMaximumZoom,
  rainViewerPlaybackIntervalMilliseconds,
  rainViewerTileTemplate,
} from './weather-radar';

describe('RainViewer map helpers', () => {
  it('builds a trusted tile template for a recent frame', () => {
    expect(rainViewerTileTemplate(1_791_825_600)).toBe(
      'https://tilecache.rainviewer.com/v2/radar/1791825600/256/{z}/{x}/{y}/2/1_0.png',
    );
    expect(rainViewerMaximumZoom).toBe(7);
    expect(rainViewerPlaybackIntervalMilliseconds).toBe(15_000);
  });

  it('rejects malformed timestamps and formats the frame time', () => {
    expect(rainViewerTileTemplate(0)).toBeUndefined();
    expect(rainViewerTileTemplate(1.5)).toBeUndefined();
    expect(formatRadarTimestamp(1_791_825_600, 'en-US')).toMatch(/\d{1,2}:\d{2}/);
  });

  it('routes OpenWeather current tiles through the Atmos gateway', () => {
    expect(openWeatherTileTemplate('https://api.rainify.dpdns.org', 'precipitation_new')).toBe(
      'https://api.rainify.dpdns.org/api/v1/weather/maps/openweather/precipitation_new/{z}/{x}/{y}',
    );
    expect(openWeatherTileTemplate('http://weather.example', 'clouds_new')).toBeUndefined();
  });
});
