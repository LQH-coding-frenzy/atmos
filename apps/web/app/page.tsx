import { dashboardSchema, type Dashboard as DashboardData } from '@atmos/contracts';
import { Dashboard } from '../components/dashboard';
import { LegalLinks } from '../components/legal-links';
import { RetryWeatherButton } from '../components/retry-weather-button';
import { defaultLocation } from '../lib/default-location';
import { browserGatewayOrigin, serverGatewayOrigin } from '../lib/gateway-origin';
import { getPublicDashboard } from '../lib/public-weather-runtime';

// A failed build-time weather request must never be cached as the public page.
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function selectedLocation(searchParams: Record<string, string | string[] | undefined>) {
  const value = (name: string) => {
    const parameter = searchParams[name];
    return Array.isArray(parameter) ? parameter[0] : parameter;
  };
  const latitude = Number(value('lat'));
  const longitude = Number(value('lon'));
  const timezone = value('timezone');
  const name = value('name')?.trim();
  const country = value('country')?.trim();
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    !timezone ||
    !/^[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)*$/.test(timezone) ||
    !name ||
    name.length > 80 ||
    !country ||
    country.length > 80
  ) {
    return defaultLocation;
  }
  return {
    id: `${latitude}:${longitude}`,
    name,
    country,
    latitude,
    longitude,
    timezone,
  };
}

async function getDashboardFromGateway(
  location: typeof defaultLocation,
  apiOrigin: string,
): Promise<DashboardData | undefined> {
  const url = new URL('/api/v1/weather/dashboard', apiOrigin);
  url.search = new URLSearchParams({
    lat: String(location.latitude),
    lon: String(location.longitude),
    timezone: location.timezone,
    units: 'metric',
  }).toString();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) continue;

      const parsed = dashboardSchema.safeParse(await response.json());
      if (!parsed.success) continue;
      const dashboard: DashboardData = parsed.data;

      return {
        ...dashboard,
        location,
      };
    } catch {
      // One bounded retry avoids showing an error for a transient edge request failure.
    }
  }

  return undefined;
}

async function getDashboardFromVercel(
  location = defaultLocation,
): Promise<DashboardData | undefined> {
  try {
    const dashboard = await getPublicDashboard({
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: location.timezone,
      units: 'metric',
    });
    return { ...dashboard, location };
  } catch {
    return undefined;
  }
}

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const location = selectedLocation(await searchParams);
  const dashboard = process.env.ATMOS_E2E_GATEWAY_URL
    ? await getDashboardFromGateway(
        location,
        serverGatewayOrigin(
          process.env.VERCEL_ENV,
          process.env.ATMOS_SERVER_GATEWAY_URL ?? process.env.ATMOS_GATEWAY_URL,
        ),
      )
    : await getDashboardFromVercel(location);

  if (!dashboard) {
    return (
      <main className="atmos-page">
        <section className="weather-unavailable panel" aria-labelledby="weather-unavailable-title">
          <p className="eyebrow">Live weather</p>
          <h1 id="weather-unavailable-title">Weather data is temporarily unavailable.</h1>
          <p>The dashboard keeps real weather honest and will not substitute mock data.</p>
          <RetryWeatherButton />
          <LegalLinks />
        </section>
      </main>
    );
  }

  return (
    <Dashboard
      initialDashboard={dashboard}
      gatewayOrigin={browserGatewayOrigin(process.env.VERCEL_ENV, process.env.ATMOS_GATEWAY_URL)}
    />
  );
}
