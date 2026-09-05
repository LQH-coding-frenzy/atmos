import type { Dashboard } from '@atmos/contracts';
import { compareWeather, mockComparisonLocation } from '../lib/weather-comparison';

export function WeatherComparisonCard({ dashboard }: { dashboard: Dashboard }) {
  const comparison = compareWeather(mockComparisonLocation, dashboard.current);
  const temperatureDirection = comparison.temperatureDeltaC >= 0 ? 'warmer' : 'cooler';

  return (
    <article className="comparison-card panel" aria-labelledby="comparison-heading">
      <p className="eyebrow">Comparison</p>
      <h2 id="comparison-heading">
        {dashboard.location.name} vs {comparison.location.name}
      </h2>
      <p className="comparison-temperature">
        {Math.abs(comparison.temperatureDeltaC)} C {temperatureDirection}
      </p>
      <p className="muted">
        Wind is {Math.abs(comparison.windDeltaKph)} km/h{' '}
        {comparison.windDeltaKph >= 0 ? 'stronger' : 'lighter'} in {dashboard.location.name}.
      </p>
      <p className="comparison-source">
        Deterministic comparison fixture until saved locations are connected.
      </p>
    </article>
  );
}
