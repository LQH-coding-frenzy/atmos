import { locationSearchResultSchema, type LocationSearchResult } from '@atmos/contracts';

export type ShareLocationUrl =
  { kind: 'root' } | { kind: 'location'; location: LocationSearchResult } | { kind: 'invalid' };

const locationQueryKeys = ['lat', 'lon', 'timezone', 'name', 'country'];

export function locationFromShareUrl(url: URL): ShareLocationUrl {
  const hasLocationParameters = locationQueryKeys.some((key) => url.searchParams.has(key));
  if (!hasLocationParameters) return { kind: 'root' };

  const latitudeText = url.searchParams.get('lat');
  const longitudeText = url.searchParams.get('lon');
  if (!latitudeText || !longitudeText) return { kind: 'invalid' };
  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return { kind: 'invalid' };

  const parsed = locationSearchResultSchema.safeParse({
    id: `shared:${latitude}:${longitude}`,
    name: url.searchParams.get('name'),
    country: url.searchParams.get('country'),
    latitude,
    longitude,
    timezone: url.searchParams.get('timezone') ?? 'auto',
  });
  return parsed.success ? { kind: 'location', location: parsed.data } : { kind: 'invalid' };
}
