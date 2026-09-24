import { dashboardSchema, type Dashboard as DashboardData } from '@atmos/contracts';
import { Dashboard } from '../components/dashboard';

const productionGatewayOrigin = 'https://atmos-gateway.rainify.workers.dev';

// A failed build-time weather request must never be cached as the public page.
export const dynamic = 'force-dynamic';

function gatewayOrigin(): string {
  // Production SSR uses the stable Workers hostname; local and CI can override it explicitly.
  if (process.env.VERCEL_ENV === 'production') return productionGatewayOrigin;
  return process.env.ATMOS_GATEWAY_URL ?? productionGatewayOrigin;
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const defaultLocation = {
  id: 'berlin-de',
  name: 'Berlin',
  country: 'Germany',
  latitude: 52.52,
  longitude: 13.405,
  timezone: 'Europe/Berlin',
};

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

async function getDashboard(location = defaultLocation): Promise<DashboardData | undefined> {
  const url = new URL('/api/v1/weather/dashboard', gatewayOrigin());
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

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const location = selectedLocation(await searchParams);
  const dashboard = await getDashboard(location);

  if (!dashboard) {
    return (
      <main className="atmos-page">
        <section className="weather-unavailable panel" aria-labelledby="weather-unavailable-title">
          <p className="eyebrow">Live weather</p>
          <h1 id="weather-unavailable-title">Weather data is temporarily unavailable.</h1>
          <p>
            Please refresh shortly. The dashboard never substitutes mock data for a live response.
          </p>
        </section>
      </main>
    );
  }

  return <Dashboard initialDashboard={dashboard} gatewayOrigin={gatewayOrigin()} />;
}
