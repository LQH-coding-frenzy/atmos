import { dashboardSchema, type Dashboard } from '@atmos/contracts';

export const offlineDashboardStorageKey = 'atmos.offline.last-dashboard';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function canPersistDashboardOffline(dashboard: Dashboard) {
  return (
    dashboard.location.id !== 'device-location' && dashboard.location.country !== 'Device location'
  );
}

export function saveOfflineDashboard(storage: StorageLike, dashboard: Dashboard) {
  if (!canPersistDashboardOffline(dashboard)) return false;
  try {
    storage.setItem(offlineDashboardStorageKey, JSON.stringify(dashboard));
    return true;
  } catch {
    return false;
  }
}

export function readOfflineDashboard(storage: StorageLike): Dashboard | undefined {
  try {
    const stored = storage.getItem(offlineDashboardStorageKey);
    if (!stored) return undefined;
    const parsed = dashboardSchema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function asOfflineDashboard(dashboard: Dashboard): Dashboard {
  return { ...dashboard, meta: { ...dashboard.meta, cached: true, stale: true } };
}
