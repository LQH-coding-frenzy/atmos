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

async function getDashboard(): Promise<DashboardData | undefined> {
  const url = new URL('/api/v1/weather/dashboard', gatewayOrigin());
  url.search = new URLSearchParams({
    lat: '52.52',
    lon: '13.405',
    timezone: 'Europe/Berlin',
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
