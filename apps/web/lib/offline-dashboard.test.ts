import { describe, expect, it } from 'vitest';
import type { Dashboard } from '@atmos/contracts';
import {
  asOfflineDashboard,
  canPersistDashboardOffline,
  offlineDashboardStorageKey,
  readOfflineDashboard,
  saveOfflineDashboard,
} from './offline-dashboard';

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

const cityDashboard: Dashboard = {
  location: {
    id: 'berlin-de',
    name: 'Berlin',
    country: 'Germany',
    latitude: 52.52,
    longitude: 13.405,
    timezone: 'Europe/Berlin',
  },
  current: {
    observedAt: '2026-10-11T10:00:00.000Z',
    temperatureC: 16,
    apparentTemperatureC: 15,
    humidityPercent: 58,
    windSpeedKph: 8,
    pressureHpa: 1015,
    condition: 'partly-cloudy',
  },
  hourly: [
    {
      time: '2026-10-11T11:00:00.000Z',
      temperatureC: 16,
      precipitationProbability: 12,
      condition: 'partly-cloudy',
    },
  ],
  daily: [
    {
      date: '2026-10-11',
      highC: 18,
      lowC: 11,
      precipitationProbability: 12,
      condition: 'partly-cloudy',
    },
  ],
  meta: {
    provider: 'open-meteo',
    cached: false,
    stale: false,
    updatedAt: '2026-10-11T10:00:00.000Z',
  },
};

describe('offline dashboard snapshots', () => {
  it('stores a valid city forecast and restores it marked stale', () => {
    const storage = createMemoryStorage();
    expect(saveOfflineDashboard(storage, cityDashboard)).toBe(true);
    expect(storage.getItem(offlineDashboardStorageKey)).toBeTruthy();
    const restored = readOfflineDashboard(storage);
    expect(restored).toEqual(cityDashboard);
    expect(asOfflineDashboard(restored!).meta).toMatchObject({ cached: true, stale: true });
  });

  it('does not save device coordinates and rejects malformed snapshots', () => {
    const storage = createMemoryStorage();
    const deviceDashboard = {
      ...cityDashboard,
      location: { ...cityDashboard.location, id: 'device-location', country: 'Device location' },
    };
    expect(canPersistDashboardOffline(deviceDashboard)).toBe(false);
    expect(saveOfflineDashboard(storage, deviceDashboard)).toBe(false);
    storage.setItem(offlineDashboardStorageKey, '{invalid');
    expect(readOfflineDashboard(storage)).toBeUndefined();
  });
});
