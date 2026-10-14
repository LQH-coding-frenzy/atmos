'use client';

import {
  dashboardSchema,
  locationSearchResultSchema,
  type Dashboard as DashboardData,
  type LocationSearchResult,
  type UnitSystem,
} from '@atmos/contracts';
import { formatTemperature, formatWindSpeed } from '@atmos/domain';
import { ArrowLeftRight, GitCompareArrows, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { temperatureDifference } from '../lib/weather-comparison';
import { versionAffinityHeaders } from '../lib/version-affinity';

type WeatherComparisonPanelProps = {
  current: DashboardData;
  gatewayOrigin: string;
  units: UnitSystem;
  onUseAsCurrent: (location: LocationSearchResult) => Promise<boolean>;
};

function temperature(value: number, units: UnitSystem) {
  return formatTemperature(value, units).replace(' deg', '°');
}

function conditionLabel(condition: string) {
  return condition.replace('-', ' ');
}

export function WeatherComparisonPanel({
  current,
  gatewayOrigin,
  units,
  onUseAsCurrent,
}: WeatherComparisonPanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocationSearchResult[]>([]);
  const [comparison, setComparison] = useState<DashboardData>();
  const [searchState, setSearchState] = useState<
    'idle' | 'searching' | 'empty' | 'invalid' | 'failed'
  >('idle');
  const [selectionState, setSelectionState] = useState<'idle' | 'loading' | 'failed'>('idle');
  const [switching, setSwitching] = useState(false);
  const [switchFailed, setSwitchFailed] = useState(false);
  const requestGeneration = useRef(0);
  const weatherController = useRef<AbortController | null>(null);
  const panel = useRef<HTMLDetailsElement>(null);

  useEffect(
    () => () => {
      requestGeneration.current += 1;
      weatherController.current?.abort();
    },
    [],
  );

  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    if (value.length < 2) {
      setSearchState('invalid');
      setResults([]);
      return;
    }
    const generation = ++requestGeneration.current;
    weatherController.current?.abort();
    setSelectionState('idle');
    setResults([]);
    setSearchState('searching');
    try {
      const url = new URL('/api/v1/locations/search', gatewayOrigin);
      url.searchParams.set('q', value);
      const response = await fetch(url, { headers: versionAffinityHeaders() });
      const body = (await response.json().catch(() => undefined)) as
        { results?: unknown } | undefined;
      const parsed = locationSearchResultSchema.array().safeParse(body?.results);
      if (!response.ok || !parsed.success) throw new Error('Comparison search unavailable');
      if (generation !== requestGeneration.current) return;
      setResults(parsed.data);
      setSearchState(parsed.data.length ? 'idle' : 'empty');
    } catch {
      if (generation !== requestGeneration.current) return;
      setSearchState('failed');
    }
  }

  async function compareLocation(location: LocationSearchResult) {
    if (
      location.latitude === current.location.latitude &&
      location.longitude === current.location.longitude
    ) {
      setSelectionState('failed');
      return;
    }
    const generation = ++requestGeneration.current;
    weatherController.current?.abort();
    const controller = new AbortController();
    weatherController.current = controller;
    setSelectionState('loading');
    setSearchState('idle');
    try {
      const url = new URL('/api/v1/weather/dashboard', gatewayOrigin);
      url.search = new URLSearchParams({
        lat: String(location.latitude),
        lon: String(location.longitude),
        timezone: location.timezone,
        units: 'metric',
      }).toString();
      const response = await fetch(url, {
        cache: 'no-store',
        headers: versionAffinityHeaders(),
        signal: controller.signal,
      });
      const parsed = dashboardSchema.safeParse(await response.json());
      if (!response.ok || !parsed.success) throw new Error('Comparison weather unavailable');
      if (generation !== requestGeneration.current) return;
      setComparison({
        ...parsed.data,
        location: {
          ...parsed.data.location,
          id: location.id,
          name: location.name,
          country: location.country,
          latitude: location.latitude,
          longitude: location.longitude,
          timezone:
            location.timezone === 'auto' ? parsed.data.location.timezone : location.timezone,
        },
      });
      setQuery(location.name);
      setResults([]);
      setSelectionState('idle');
    } catch {
      if (generation !== requestGeneration.current) return;
      setSelectionState('failed');
    } finally {
      if (generation === requestGeneration.current) weatherController.current = null;
    }
  }

  async function useComparedCity() {
    if (!comparison) return;
    setSwitching(true);
    setSwitchFailed(false);
    const switched = await onUseAsCurrent({
      id: comparison.location.id,
      name: comparison.location.name,
      country: comparison.location.country,
      latitude: comparison.location.latitude,
      longitude: comparison.location.longitude,
      timezone: comparison.location.timezone,
    });
    setSwitching(false);
    setSwitchFailed(!switched);
    if (switched) {
      if (panel.current) panel.current.open = false;
      panel.current?.closest('dialog')?.close();
      setComparison(undefined);
      setQuery('');
      setResults([]);
    }
  }

  function clearComparison() {
    requestGeneration.current += 1;
    weatherController.current?.abort();
    weatherController.current = null;
    setComparison(undefined);
    setResults([]);
    setQuery('');
    setSelectionState('idle');
    setSearchState('idle');
  }

  const delta = comparison
    ? temperatureDifference(comparison.current.temperatureC, current.current.temperatureC, units)
    : undefined;

  return (
    <details className="weather-comparison-panel" name="dashboard-tools" ref={panel}>
      <summary aria-controls="weather-comparison-content">
        <GitCompareArrows size={17} aria-hidden="true" />
        <span>Compare cities</span>
      </summary>
      <section className="weather-comparison-popover" id="weather-comparison-content">
        <div className="weather-comparison-heading">
          <div>
            <h2>Live city comparison</h2>
            <p>Compare current conditions without switching your dashboard.</p>
          </div>
          {comparison ? (
            <button
              type="button"
              className="weather-comparison-clear"
              aria-label="Clear compared city"
              onClick={clearComparison}
            >
              <X size={16} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <form className="weather-comparison-search" onSubmit={search} role="search">
          <label className="sr-only" htmlFor="comparison-city-query">
            Search for a city to compare
          </label>
          <input
            id="comparison-city-query"
            value={query}
            minLength={2}
            maxLength={80}
            autoComplete="off"
            placeholder="Search a city to compare"
            onChange={(event) => {
              requestGeneration.current += 1;
              weatherController.current?.abort();
              setQuery(event.target.value);
              setResults([]);
              setSearchState('idle');
              setSelectionState('idle');
            }}
          />
          <button
            type="submit"
            aria-label="Search comparison cities"
            disabled={searchState === 'searching'}
          >
            <Search size={16} aria-hidden="true" />
          </button>
        </form>
        {searchState === 'searching' ? <p role="status">Searching cities…</p> : null}
        {searchState === 'invalid' ? <p role="status">Enter at least two characters.</p> : null}
        {searchState === 'empty' ? (
          <p role="status">No matching cities. Try another search.</p>
        ) : null}
        {searchState === 'failed' ? (
          <p role="status">City search is temporarily unavailable. Try again.</p>
        ) : null}
        {selectionState === 'loading' ? <p role="status">Loading comparison weather…</p> : null}
        {selectionState === 'failed' ? (
          <p role="status">That city could not be compared. Choose another city or try again.</p>
        ) : null}
        {results.length > 0 ? (
          <ul className="weather-comparison-results" aria-label="Comparison city results">
            {results.map((location) => (
              <li key={location.id}>
                <button
                  type="button"
                  disabled={selectionState === 'loading'}
                  onClick={() => void compareLocation(location)}
                >
                  <strong>{location.name}</strong>
                  <span>{location.country}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {comparison ? (
          <>
            <div className="weather-comparison-cities">
              <ComparisonCity dashboard={current} units={units} label="Current city" />
              <ComparisonCity dashboard={comparison} units={units} label="Compared city" />
            </div>
            <p className="weather-comparison-delta">
              {delta?.value === 0
                ? `${comparison.location.name} and ${current.location.name} have the same temperature.`
                : `${comparison.location.name} is ${delta?.label} ${delta?.direction} than ${current.location.name}.`}
            </p>
            {switchFailed ? (
              <p className="weather-comparison-status" role="status">
                {comparison.location.name} could not be opened. Your current city remains selected.
              </p>
            ) : null}
            <button
              className="weather-comparison-switch"
              type="button"
              onClick={() => void useComparedCity()}
              disabled={switching}
            >
              <ArrowLeftRight size={15} aria-hidden="true" />
              {switching ? 'Switching…' : `Make ${comparison.location.name} current`}
            </button>
          </>
        ) : null}
      </section>
    </details>
  );
}

function ComparisonCity({
  dashboard,
  units,
  label,
}: {
  dashboard: DashboardData;
  units: UnitSystem;
  label: string;
}) {
  return (
    <article className="weather-comparison-city">
      <p>{label}</p>
      <h3>{dashboard.location.name}</h3>
      <span className="weather-comparison-country">{dashboard.location.country}</span>
      <strong className="weather-comparison-temperature">
        {temperature(dashboard.current.temperatureC, units)}
      </strong>
      <span className="weather-comparison-condition">
        {conditionLabel(dashboard.current.condition)}
      </span>
      <dl>
        <div>
          <dt>Humidity</dt>
          <dd>{dashboard.current.humidityPercent}%</dd>
        </div>
        <div>
          <dt>Wind</dt>
          <dd>{formatWindSpeed(dashboard.current.windSpeedKph, units)}</dd>
        </div>
        <div>
          <dt>Next-hour rain</dt>
          <dd>{dashboard.hourly[0]?.precipitationProbability ?? '—'}%</dd>
        </div>
      </dl>
      <small className={dashboard.meta.stale ? 'stale' : ''}>
        {dashboard.meta.stale ? 'Cached weather · ' : 'Observed '}
        {new Intl.DateTimeFormat('en', {
          hour: 'numeric',
          minute: '2-digit',
          timeZone: dashboard.location.timezone,
        }).format(new Date(dashboard.current.observedAt))}
      </small>
    </article>
  );
}
