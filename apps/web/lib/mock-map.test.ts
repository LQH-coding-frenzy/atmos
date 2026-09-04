import { describe, expect, it } from 'vitest';
import { createMockMapData } from './mock-map';

describe('createMockMapData', () => {
  it('preserves normalized dashboard coordinates without creating a synthetic location', () => {
    const data = createMockMapData(
      {
        id: 'berlin-de',
        name: 'Berlin',
        country: 'Germany',
        latitude: 52.52,
        longitude: 13.405,
        timezone: 'Europe/Berlin',
      },
      {
        observedAt: '2026-09-01T10:00:00.000Z',
        temperatureC: 20,
        apparentTemperatureC: 19,
        humidityPercent: 64,
        windSpeedKph: 13,
        pressureHpa: 1017,
        condition: 'partly-cloudy',
      },
    );

    expect(data.center).toEqual([13.405, 52.52]);
    expect(data.point.geometry.coordinates).toEqual([13.405, 52.52]);
    expect(data.point.properties.condition).toBe('partly-cloudy');
    expect(data.markerColor).toBe('#cde8ed');
  });
});
