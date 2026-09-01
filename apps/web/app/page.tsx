import { MockWeatherProvider } from '@atmos/provider-openmeteo';
import { Dashboard } from '../components/dashboard';

export default async function Home() {
  const dashboard = await new MockWeatherProvider().getDashboard({
    latitude: 52.52,
    longitude: 13.405,
    timezone: 'Europe/Berlin',
    units: 'metric',
  });

  return <Dashboard initialDashboard={dashboard} />;
}
