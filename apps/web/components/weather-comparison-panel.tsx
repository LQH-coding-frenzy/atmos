'use client';

import {
  airQualitySchema,
  dashboardSchema,
  locationSearchResultSchema,
  type AirQuality,
  type Dashboard as DashboardData,
  type LocationSearchResult,
  type UnitSystem,
} from '@atmos/contracts';
import {
  formatTemperature,
  formatWindSpeed,
  planActivity,
  plannerActivityLabels,
  plannerActivityKinds,
  type PlannerActivityKind,
} from '@atmos/domain';
import { ArrowLeftRight, GitCompareArrows, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  comparisonLocationKey,
  maximumComparedDestinations,
  maximumComparisonAqiCacheEntries,
  maximumConcurrentComparisonAqiRequests,
  runWithComparisonConcurrency,
  temperatureDifference,
} from '../lib/weather-comparison';
import { versionAffinityHeaders } from '../lib/version-affinity';

type WeatherComparisonPanelProps = {
  current: DashboardData;
  gatewayOrigin: string;
  units: UnitSystem;
  onUseAsCurrent: (location: LocationSearchResult) => Promise<boolean>;
};

type SearchState = 'idle' | 'searching' | 'empty' | 'invalid' | 'failed';
type SelectionState = 'idle' | 'loading' | 'failed' | 'duplicate' | 'limit';
type ComparisonAqiState = 'idle' | 'loading' | 'ready' | 'partial' | 'failed';

function temperature(value: number, units: UnitSystem) {
  return formatTemperature(value, units).replace(' deg', '°');
}

function conditionLabel(condition: string) {
  return condition.replace('-', ' ');
}

function formatOptionalNumber(value: number | null | undefined, suffix: string) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? 'Unavailable'
    : `${new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value)}${suffix}`;
}

function formatPrecipitation(value: number | null | undefined, units: UnitSystem) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'Unavailable';
  return units === 'imperial'
    ? `${new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value / 25.4)} in`
    : `${new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value)} mm`;
}

export function WeatherComparisonPanel({
  current,
  gatewayOrigin,
  units,
  onUseAsCurrent,
}: WeatherComparisonPanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocationSearchResult[]>([]);
  const [comparisonCities, setComparisonCities] = useState<DashboardData[]>([]);
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [selectionState, setSelectionState] = useState<SelectionState>('idle');
  const [switchingId, setSwitchingId] = useState<string>();
  const [switchFailedId, setSwitchFailedId] = useState<string>();
  const [activity, setActivity] = useState<PlannerActivityKind>('running');
  const [airQualityByLocation, setAirQualityByLocation] = useState<
    Record<string, AirQuality | null>
  >({});
  const [airQualityState, setAirQualityState] = useState<ComparisonAqiState>('idle');
  const requestGeneration = useRef(0);
  const airQualityGeneration = useRef(0);
  const weatherController = useRef<AbortController | null>(null);
  const airQualityController = useRef<AbortController | null>(null);
  const airQualityCache = useRef(new Map<string, AirQuality | null>());
  const panel = useRef<HTMLDetailsElement>(null);
  const currentKey = comparisonLocationKey(current.location);

  useEffect(
    () => () => {
      requestGeneration.current += 1;
      airQualityGeneration.current += 1;
      weatherController.current?.abort();
      airQualityController.current?.abort();
    },
    [],
  );

  const uniqueComparisons = useMemo(() => {
    const seen = new Set([currentKey]);
    return comparisonCities.filter((dashboard) => {
      const key = comparisonLocationKey(dashboard.location);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [comparisonCities, currentKey]);
  const comparedPlaces = useMemo(
    () =>
      uniqueComparisons.length > 0
        ? [
            { dashboard: current, isCurrent: true },
            ...uniqueComparisons.map((dashboard) => ({ dashboard, isCurrent: false })),
          ]
        : [],
    [current, uniqueComparisons],
  );
  const rankedPlaces = useMemo(
    () =>
      comparedPlaces
        .map((place) => {
          const locationKey = comparisonLocationKey(place.dashboard.location);
          const airQuality = airQualityByLocation[locationKey];
          const plan = planActivity(activity, place.dashboard.hourly, {
            aqiHours: airQuality?.timeline?.hours ?? [],
          });
          return { ...place, locationKey, airQuality, plan };
        })
        .sort(
          (left, right) =>
            right.plan.score - left.plan.score ||
            right.plan.coveragePercent - left.plan.coveragePercent ||
            left.dashboard.location.name.localeCompare(right.dashboard.location.name),
        )
        .map((place, index) => ({ ...place, rank: index + 1 })),
    [activity, airQualityByLocation, comparedPlaces],
  );

  async function search(event: FormEvent<HTMLFormElement>) {
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
    const locationKey = comparisonLocationKey(location);
    if (
      locationKey === currentKey ||
      uniqueComparisons.some(
        (dashboard) => comparisonLocationKey(dashboard.location) === locationKey,
      )
    ) {
      setSelectionState('duplicate');
      return;
    }
    if (uniqueComparisons.length >= maximumComparedDestinations) {
      setSelectionState('limit');
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
      const parsed = dashboardSchema.safeParse(await response.json().catch(() => undefined));
      if (!response.ok || !parsed.success) throw new Error('Comparison weather unavailable');
      if (generation !== requestGeneration.current) return;
      const nextDashboard: DashboardData = {
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
      };
      setComparisonCities((previous) => {
        const currentUnique = previous.filter(
          (dashboard) => comparisonLocationKey(dashboard.location) !== currentKey,
        );
        if (
          currentUnique.length >= maximumComparedDestinations ||
          currentUnique.some(
            (dashboard) => comparisonLocationKey(dashboard.location) === locationKey,
          )
        ) {
          return currentUnique;
        }
        return [...currentUnique, nextDashboard];
      });
      setQuery('');
      setResults([]);
      setSelectionState('idle');
    } catch {
      if (generation !== requestGeneration.current) return;
      setSelectionState('failed');
    } finally {
      if (generation === requestGeneration.current) weatherController.current = null;
    }
  }

  async function loadComparisonAirQuality() {
    const places = new Map<string, DashboardData['location']>();
    for (const dashboard of [current, ...uniqueComparisons]) {
      places.set(comparisonLocationKey(dashboard.location), dashboard.location);
    }
    const pending = [...places.entries()].filter(
      ([key]) => !airQualityCache.current.get(key)?.timeline,
    );
    if (pending.length === 0) return;

    airQualityController.current?.abort();
    const controller = new AbortController();
    airQualityController.current = controller;
    const generation = ++airQualityGeneration.current;
    setAirQualityState('loading');
    const responses = new Map<string, AirQuality | null>();

    await runWithComparisonConcurrency(
      pending,
      maximumConcurrentComparisonAqiRequests,
      async ([key, location]) => {
        if (controller.signal.aborted) return;
        try {
          const url = new URL('/api/v1/weather/air-quality', gatewayOrigin);
          url.search = new URLSearchParams({
            lat: String(location.latitude),
            lon: String(location.longitude),
            view: 'timeline',
          }).toString();
          const response = await fetch(url, {
            cache: 'no-store',
            headers: versionAffinityHeaders(),
            signal: controller.signal,
          });
          const parsed = airQualitySchema.safeParse(await response.json().catch(() => undefined));
          if (!response.ok || !parsed.success) throw new Error('AQI comparison unavailable');
          responses.set(key, parsed.data);
        } catch {
          if (!controller.signal.aborted) responses.set(key, null);
        }
      },
    );

    if (controller.signal.aborted || generation !== airQualityGeneration.current) return;
    for (const [key, value] of responses) {
      if (
        !airQualityCache.current.has(key) &&
        airQualityCache.current.size >= maximumComparisonAqiCacheEntries
      ) {
        const oldestKey = airQualityCache.current.keys().next().value;
        if (oldestKey !== undefined) airQualityCache.current.delete(oldestKey);
      }
      airQualityCache.current.set(key, value);
    }
    const data = Object.fromEntries(airQualityCache.current);
    setAirQualityByLocation(data);
    const hasIncompleteTimeline = [...places.keys()].some((key) => !data[key]?.timeline);
    const hasAnyTimeline = [...places.keys()].some((key) => Boolean(data[key]?.timeline));
    setAirQualityState(hasIncompleteTimeline ? (hasAnyTimeline ? 'partial' : 'failed') : 'ready');
    if (airQualityController.current === controller) airQualityController.current = null;
  }

  async function useComparedCity(location: LocationSearchResult) {
    const key = comparisonLocationKey(location);
    setSwitchingId(key);
    setSwitchFailedId(undefined);
    const switched = await onUseAsCurrent(location);
    setSwitchingId(undefined);
    if (switched) {
      setComparisonCities((previous) =>
        previous.filter((dashboard) => comparisonLocationKey(dashboard.location) !== key),
      );
      setSwitchFailedId(undefined);
      if (panel.current) panel.current.open = false;
      panel.current?.closest('dialog')?.close();
      setQuery('');
      setResults([]);
    } else {
      setSwitchFailedId(key);
    }
  }

  function removeComparedCity(location: DashboardData['location']) {
    const removedKey = comparisonLocationKey(location);
    setComparisonCities((previous) =>
      previous.filter((dashboard) => comparisonLocationKey(dashboard.location) !== removedKey),
    );
    airQualityCache.current.delete(removedKey);
    setAirQualityByLocation(Object.fromEntries(airQualityCache.current));
    setAirQualityState('idle');
  }

  function clearComparisons() {
    requestGeneration.current += 1;
    airQualityGeneration.current += 1;
    weatherController.current?.abort();
    airQualityController.current?.abort();
    weatherController.current = null;
    airQualityController.current = null;
    setComparisonCities([]);
    setAirQualityByLocation({});
    airQualityCache.current.clear();
    setQuery('');
    setResults([]);
    setSelectionState('idle');
    setSearchState('idle');
    setAirQualityState('idle');
  }

  const displayedAqiTargets = new Map<string, DashboardData['location']>();
  if (uniqueComparisons.length > 0) {
    for (const dashboard of [current, ...uniqueComparisons]) {
      displayedAqiTargets.set(comparisonLocationKey(dashboard.location), dashboard.location);
    }
  }
  const missingAqiCount = [...displayedAqiTargets.keys()].filter(
    (key) => !airQualityByLocation[key]?.timeline,
  ).length;
  return (
    <details className="weather-comparison-panel" name="dashboard-tools" ref={panel}>
      <summary aria-controls="weather-comparison-content">
        <GitCompareArrows size={17} aria-hidden="true" />
        <span>Compare cities</span>
      </summary>
      <section className="weather-comparison-popover" id="weather-comparison-content">
        <div className="weather-comparison-heading">
          <div>
            <h2>Compare destinations</h2>
            <p>Current city plus up to {maximumComparedDestinations} destinations.</p>
          </div>
          {uniqueComparisons.length > 0 ? (
            <button
              type="button"
              className="weather-comparison-clear"
              aria-label="Clear compared cities"
              onClick={clearComparisons}
            >
              <X size={16} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <form
          className="weather-comparison-search"
          onSubmit={(event) => void search(event)}
          role="search"
        >
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
        {selectionState === 'duplicate' ? (
          <p role="status">That place is already the current city or in this comparison.</p>
        ) : null}
        {selectionState === 'limit' || uniqueComparisons.length >= maximumComparedDestinations ? (
          <p role="status">Three destination limit reached. Remove a city before adding another.</p>
        ) : null}
        {results.length > 0 ? (
          <ul className="weather-comparison-results" aria-label="Comparison city results">
            {results.map((location) => {
              const key = comparisonLocationKey(location);
              const duplicate =
                key === currentKey ||
                uniqueComparisons.some(
                  (dashboard) => comparisonLocationKey(dashboard.location) === key,
                );
              const atLimit = uniqueComparisons.length >= maximumComparedDestinations;
              return (
                <li key={location.id}>
                  <button
                    type="button"
                    disabled={
                      selectionState === 'loading' ||
                      airQualityState === 'loading' ||
                      duplicate ||
                      atLimit
                    }
                    onClick={() => void compareLocation(location)}
                  >
                    <strong>{location.name}</strong>
                    <span>
                      {location.country}
                      {duplicate ? ' · Already added' : atLimit ? ' · Remove a city first' : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        {uniqueComparisons.length > 0 ? (
          <>
            <div className="weather-comparison-controls">
              <label htmlFor="comparison-activity-profile">
                <span>Suitability profile</span>
                <select
                  id="comparison-activity-profile"
                  aria-label="Activity suitability profile"
                  value={activity}
                  onChange={(event) => setActivity(event.target.value as PlannerActivityKind)}
                >
                  {plannerActivityKinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {plannerActivityLabels[kind]}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="weather-comparison-aqi"
                type="button"
                aria-label="Load AQI for comparison"
                disabled={airQualityState === 'loading' || missingAqiCount === 0}
                onClick={() => void loadComparisonAirQuality()}
              >
                {airQualityState === 'loading'
                  ? 'Loading AQI…'
                  : missingAqiCount > 0
                    ? `Load AQI for ${missingAqiCount} ${missingAqiCount === 1 ? 'place' : 'places'}`
                    : 'AQI loaded for all places'}
              </button>
            </div>
            {airQualityState === 'loading' ? (
              <p className="weather-comparison-status" role="status">
                Loading model AQI for at most four places, two requests at a time…
              </p>
            ) : null}
            {airQualityState === 'partial' ? (
              <p className="weather-comparison-status" role="status">
                Some AQI timelines are unavailable. Missing values stay unscored and reduce
                coverage.
              </p>
            ) : null}
            {airQualityState === 'failed' ? (
              <p className="weather-comparison-status" role="status">
                AQI timelines are unavailable. AQI remains unscored, not zero.
              </p>
            ) : null}
            {switchFailedId ? (
              <p className="weather-comparison-status" role="status">
                The selected destination could not be opened. Your current city remains selected.
              </p>
            ) : null}
            <p className="weather-comparison-ranking-caption">
              {rankedPlaces.length} places ranked by {plannerActivityLabels[activity]} fit; scroll
              to review every city.
            </p>
            <div
              className="weather-comparison-ranking"
              role="list"
              aria-label="Ranked city comparison"
              tabIndex={0}
            >
              {rankedPlaces.map((place) => (
                <ComparisonCity
                  key={place.locationKey}
                  dashboard={place.dashboard}
                  current={current}
                  units={units}
                  rank={place.rank}
                  isCurrent={place.isCurrent}
                  activity={activity}
                  plan={place.plan}
                  airQuality={place.airQuality}
                  onRemove={() => removeComparedCity(place.dashboard.location)}
                  onUseAsCurrent={() => void useComparedCity(place.dashboard.location)}
                  switching={switchingId === place.locationKey}
                  switchFailed={switchFailedId === place.locationKey}
                  actionsDisabled={selectionState === 'loading' || airQualityState === 'loading'}
                />
              ))}
            </div>
            <p className="weather-comparison-attribution">
              Weather and AQI are model estimates, not station readings. AQI is included only when
              explicitly requested and time-matched; missing metrics lower activity-score coverage.{' '}
              Sources:{' '}
              <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
                Open-Meteo
              </a>
              ,{' '}
              <a href="https://atmosphere.copernicus.eu/" target="_blank" rel="noreferrer">
                CAMS
              </a>
              ,{' '}
              <a
                href="https://creativecommons.org/licenses/by/4.0/"
                target="_blank"
                rel="noreferrer"
              >
                CC BY 4.0
              </a>
              .
            </p>
          </>
        ) : null}
      </section>
    </details>
  );
}

function ComparisonCity({
  dashboard,
  current,
  units,
  rank,
  isCurrent,
  activity,
  plan,
  airQuality,
  onRemove,
  onUseAsCurrent,
  switching,
  switchFailed,
  actionsDisabled,
}: {
  dashboard: DashboardData;
  current: DashboardData;
  units: UnitSystem;
  rank: number;
  isCurrent: boolean;
  activity: PlannerActivityKind;
  plan: ReturnType<typeof planActivity>;
  airQuality: AirQuality | null | undefined;
  onRemove: () => void;
  onUseAsCurrent: () => void;
  switching: boolean;
  switchFailed: boolean;
  actionsDisabled: boolean;
}) {
  const nextHour = dashboard.hourly[0];
  const delta = isCurrent
    ? undefined
    : temperatureDifference(dashboard.current.temperatureC, current.current.temperatureC, units);
  const usAqi =
    airQuality === undefined
      ? 'Not loaded'
      : airQuality === null
        ? 'Unavailable'
        : formatOptionalNumber(airQuality.usAqi, '');
  const europeanAqi =
    airQuality === undefined
      ? 'Not loaded'
      : airQuality === null
        ? 'Unavailable'
        : formatOptionalNumber(airQuality.europeanAqi, '');

  return (
    <article className="weather-comparison-city" role="listitem" data-rank={rank}>
      <div className="weather-comparison-city-heading">
        <p>{isCurrent ? 'Current city' : 'Compared city'}</p>
        <span className="weather-comparison-rank">Rank {rank}</span>
      </div>
      <h3>{dashboard.location.name}</h3>
      <span className="weather-comparison-country">{dashboard.location.country}</span>
      <strong className="weather-comparison-temperature">
        {temperature(dashboard.current.temperatureC, units)}
      </strong>
      <span className="weather-comparison-condition">
        {conditionLabel(dashboard.current.condition)}
      </span>
      <dl className="weather-comparison-metrics">
        <div>
          <dt>Feels like</dt>
          <dd>{temperature(dashboard.current.apparentTemperatureC, units)}</dd>
        </div>
        <div>
          <dt>Humidity</dt>
          <dd>{formatOptionalNumber(dashboard.current.humidityPercent, '%')}</dd>
        </div>
        <div>
          <dt>Wind</dt>
          <dd>{formatWindSpeed(dashboard.current.windSpeedKph, units)}</dd>
        </div>
        <div>
          <dt>Wind gust</dt>
          <dd>
            {dashboard.current.windGustKph == null
              ? 'Unavailable'
              : formatWindSpeed(dashboard.current.windGustKph, units)}
          </dd>
        </div>
        <div>
          <dt>Next-hour rain</dt>
          <dd>{formatOptionalNumber(nextHour?.precipitationProbability, '%')}</dd>
        </div>
        <div>
          <dt>Next-hour precipitation</dt>
          <dd>{formatPrecipitation(nextHour?.precipitationMm, units)}</dd>
        </div>
        <div>
          <dt>Next-hour UV</dt>
          <dd>{formatOptionalNumber(nextHour?.uvIndex, '')}</dd>
        </div>
        <div>
          <dt>U.S. AQI</dt>
          <dd>{usAqi}</dd>
        </div>
        <div>
          <dt>European AQI</dt>
          <dd>{europeanAqi}</dd>
        </div>
      </dl>
      <div className="weather-comparison-suitability">
        <div>
          <span>{plannerActivityLabels[activity]} fit</span>
          <strong>{plan.score}/100</strong>
        </div>
        <small>Coverage {plan.coveragePercent}%</small>
        {plan.missingDimensions.length > 0 ? (
          <small>Not assessed: {plan.missingDimensions.join(', ').replaceAll('-', ' ')}.</small>
        ) : null}
      </div>
      {airQuality ? (
        <small className={airQuality.meta.stale ? 'stale' : ''}>
          {airQuality.meta.stale ? 'Cached AQI model · ' : 'AQI model time '}
          {new Intl.DateTimeFormat('en', {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: dashboard.location.timezone,
          }).format(new Date(airQuality.observedAt))}
        </small>
      ) : null}
      <small className={dashboard.meta.stale ? 'stale' : ''}>
        {dashboard.meta.stale ? 'Cached weather · ' : 'Observed '}
        {new Intl.DateTimeFormat('en', {
          hour: 'numeric',
          minute: '2-digit',
          timeZone: dashboard.location.timezone,
        }).format(new Date(dashboard.current.observedAt))}
      </small>
      {!isCurrent && delta ? (
        <p className="weather-comparison-delta">
          {delta.value === 0
            ? `${dashboard.location.name} and ${current.location.name} have the same temperature.`
            : `${dashboard.location.name} is ${delta.label} ${delta.direction} than ${current.location.name}.`}
        </p>
      ) : null}
      {switchFailed ? (
        <p className="weather-comparison-status" role="status">
          {dashboard.location.name} could not be opened. Your current city remains selected.
        </p>
      ) : null}
      {!isCurrent ? (
        <div className="weather-comparison-city-actions">
          <button
            className="weather-comparison-switch"
            type="button"
            onClick={onUseAsCurrent}
            disabled={switching || actionsDisabled}
          >
            <ArrowLeftRight size={15} aria-hidden="true" />
            {switching ? 'Switching…' : `Make ${dashboard.location.name} current`}
          </button>
          <button
            type="button"
            className="weather-comparison-remove"
            aria-label={`Remove ${dashboard.location.name} from comparison`}
            onClick={onRemove}
            disabled={actionsDisabled}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </article>
  );
}
