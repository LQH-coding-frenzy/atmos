import type { Dashboard as DashboardData } from '@atmos/contracts';
import { Dashboard } from '../components/dashboard';

const defaultGatewayOrigin = 'https://api.rainify.dpdns.org';

function isDashboard(value: unknown): value is DashboardData {
  if (!value || typeof value !== 'object') return false;

  const dashboard = value as Partial<DashboardData>;
  return (
    typeof dashboard.location === 'object' &&
    dashboard.location !== null &&
    typeof dashboard.current === 'object' &&
    dashboard.current !== null &&
    Array.isArray(dashboard.hourly) &&
    Array.isArray(dashboard.daily)
  );
}

async function getDashboard(): Promise<DashboardData | undefined> {
  const url = new URL(
    '/api/v1/weather/dashboard',
    process.env.ATMOS_GATEWAY_URL ?? defaultGatewayOrigin,
  );
  url.search = new URLSearchParams({
    lat: '52.52',
    lon: '13.405',
    timezone: 'Europe/Berlin',
    units: 'metric',
  }).toString();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) continue;

      const dashboard: unknown = await response.json();
      if (!isDashboard(dashboard)) continue;

      return {
        ...dashboard,
        location: {
          ...dashboard.location,
          name: 'Berlin',
          country: 'Germany',
        },
      };
    } catch {
      // One bounded retry avoids showing an error for a transient edge request failure.
    }
  }

  return undefined;
}

export default async function Home() {
  const dashboard = await getDashboard();

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

  return <Dashboard initialDashboard={dashboard} />;
}
