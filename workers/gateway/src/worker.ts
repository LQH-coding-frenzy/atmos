import { OpenMeteoUsageGuard, searchOpenMeteoLocations } from '@atmos/provider-openmeteo/geocoding';
import { createApp, handleFastPathRequest, type Bindings } from './index';

let cachedApp: ReturnType<typeof createApp> | undefined;

function getApp() {
  if (cachedApp) return cachedApp;
  const geocodingUsageGuard = new OpenMeteoUsageGuard();
  cachedApp = createApp({
    getDashboard: async () => {
      throw new Error('Direct Worker dashboard provider is disabled in production.');
    },
    searchLocations: (query) =>
      searchOpenMeteoLocations(query, fetch.bind(globalThis), geocodingUsageGuard),
  });
  return cachedApp;
}

export default {
  fetch(request: Request, env?: Bindings) {
    return handleFastPathRequest(request, env) ?? getApp().fetch(request, env);
  },
};
