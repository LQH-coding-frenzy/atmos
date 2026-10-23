import 'server-only';

import { OpenMeteoProvider } from '@atmos/provider-openmeteo';
import { createWeatherRouteHandlers } from './weather-route-handlers';

const providerCacheSeconds = 300;
type NextFetchInit = RequestInit & { next?: { revalidate?: number } };

const cachedProviderFetch: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    cache: 'force-cache',
    next: { revalidate: providerCacheSeconds },
  } as NextFetchInit);

const provider = new OpenMeteoProvider(cachedProviderFetch);

export const weatherRouteHandlers = createWeatherRouteHandlers(
  provider,
  process.env.ATMOS_WEATHER_TRANSFORM_TOKEN,
);
