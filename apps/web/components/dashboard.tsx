'use client';

import {
  dashboardSchema,
  type Dashboard as DashboardData,
  type LocationSearchResult,
  type UnitSystem,
  type SavedLocation,
  type WeatherCondition,
} from '@atmos/contracts';
import { formatTemperature, formatWindSpeed } from '@atmos/domain';
import {
  Cloud,
  CloudLightning,
  CloudRain,
  CloudSun,
  ArrowUpRight,
  ChevronDown,
  Droplets,
  Wind,
  LocateFixed,
  LayoutDashboard,
  Map,
  MapPin,
  RefreshCw,
  Snowflake,
  Sun,
  UserRound,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DashboardMap } from './dashboard-map';
import { ActivityPlanner } from './activity-planner';
import { ForecastTrendChart } from './forecast-trend-chart';
import { LocationSearch } from './location-search';
import { SavedLocationsPanel } from './saved-locations-panel';
import { WeatherHistoryPanel } from './weather-history-panel';
import { AirQualityPanel } from './air-quality-panel';
import { InAppAlertsPanel } from './in-app-alerts-panel';
import { PreferencesPanel, type ThemePreference } from './preferences-panel';
import { WeatherComparisonPanel } from './weather-comparison-panel';
import {
  forecastTrendAvailable,
  forecastTrendMetricLabels,
  forecastTrendMetrics,
  type ForecastTrendMetric,
  type ForecastTrendRange,
} from '../lib/forecast-trend';
import { versionAffinityHeaders } from '../lib/version-affinity';
import {
  asOfflineDashboard,
  readOfflineDashboard,
  saveOfflineDashboard,
} from '../lib/offline-dashboard';
import { locationFromShareUrl } from '../lib/location-url';
import { LegalLinks } from './legal-links';
import { WeatherTools } from './weather-tools';
import { CurrentMeasurements, HourlyMeasurements, DailyMeasurements } from './weather-measurements';

type DashboardProps = {
  initialDashboard: DashboardData;
  gatewayOrigin: string;
};

type LocationUrlBehavior = 'push' | 'clear' | 'preserve';

function WeatherIcon({ condition, size = 22 }: { condition: WeatherCondition; size?: number }) {
  const iconProps = { size, strokeWidth: 1.6, 'aria-hidden': true };
  if (condition === 'clear') return <Sun {...iconProps} />;
  if (condition === 'partly-cloudy') return <CloudSun {...iconProps} />;
  if (condition === 'cloudy') return <Cloud {...iconProps} />;
  if (condition === 'thunderstorm') return <CloudLightning {...iconProps} />;
  if (condition === 'snow') return <Snowflake {...iconProps} />;
  return <CloudRain {...iconProps} />;
}

function conditionLabel(condition: WeatherCondition): string {
  return condition.replace('-', ' ');
}

function temperature(value: number, units: UnitSystem): string {
  return formatTemperature(value, units).replace(' deg', '');
}

function formatHour(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('en', { hour: 'numeric', timeZone: timezone }).format(
    new Date(value),
  );
}

function formatDashboardDate(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('en', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: timezone,
  }).format(new Date(value));
}

function formatForecastDate(value: string): string {
  const [year = 0, month = 1, day = 1] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatTimestamp(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(value));
}

export function Dashboard({ initialDashboard, gatewayOrigin }: DashboardProps) {
  const [units, setUnits] = useState<UnitSystem>('metric');
  const [theme, setTheme] = useState<ThemePreference>('system');
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [mapView, setMapView] = useState(false);
  const [mapPanelOpen, setMapPanelOpen] = useState(true);
  const [mapPanel, setMapPanel] = useState('now');
  const [activeMetric, setActiveMetric] = useState<ForecastTrendMetric>('temperature');
  const [chartRange, setChartRange] = useState<ForecastTrendRange>('7d');
  const [selectedHourTime, setSelectedHourTime] = useState<string | null>(null);
  const [selectedDayDate, setSelectedDayDate] = useState<string | null>(null);
  const [forecastDays, setForecastDays] = useState<7 | 16>(7);
  const [locationStatus, setLocationStatus] = useState<
    'idle' | 'locating' | 'success' | 'permission-denied' | 'unavailable' | 'weather-failed'
  >('idle');
  const mapViewRef = useRef(false);
  const mapPanelInitialized = useRef(false);
  const currentLocationRef = useRef(initialDashboard.location);
  const locationSearchRef = useRef('');
  const locationRequestGeneration = useRef(0);
  const locationRequestController = useRef<AbortController | null>(null);
  const selectLocationRef = useRef<
    (location: LocationSearchResult, urlBehavior?: LocationUrlBehavior) => Promise<boolean>
  >(async () => false);
  const refreshRequestGeneration = useRef(0);
  const offlineSnapshotApplied = useRef(false);
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [connectivityReady, setConnectivityReady] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<'idle' | 'refreshing' | 'failed'>('idle');
  const currentTemperature = temperature(dashboard.current.temperatureC, units);
  const LocationHeading = mapView ? 'h2' : 'h1';
  currentLocationRef.current = dashboard.location;
  const outlook = dashboard.extendedDaily ?? dashboard.daily;
  const forecastLow = Math.min(...outlook.map((day) => day.lowC));
  const forecastRange = Math.max(1, Math.max(...outlook.map((day) => day.highC)) - forecastLow);
  const selectedHourIndex = dashboard.hourly.findIndex((hour) => hour.time === selectedHourTime);
  const selectedHour = selectedHourIndex >= 0 ? dashboard.hourly[selectedHourIndex] : undefined;
  const visibleDays = outlook.slice(0, forecastDays);

  useEffect(() => {
    setSelectedHourTime(null);
    setSelectedDayDate(null);
  }, [dashboard.location.id, dashboard.location.latitude, dashboard.location.longitude]);

  useEffect(() => {
    try {
      const storedUnits = window.localStorage.getItem('atmos.units');
      if (storedUnits === 'metric' || storedUnits === 'imperial') setUnits(storedUnits);
      const storedTheme = window.localStorage.getItem('atmos.theme');
      if (storedTheme === 'system' || storedTheme === 'light' || storedTheme === 'dark') {
        setTheme(storedTheme);
      }
    } catch {
      // Preferences remain available for this session if local storage is disabled.
    }
    setPreferencesReady(true);
  }, []);

  useEffect(() => {
    if (preferencesReady) document.documentElement.dataset.theme = theme;
  }, [preferencesReady, theme]);

  useEffect(() => {
    if (!preferencesReady) return;
    try {
      window.localStorage.setItem('atmos.units', units);
      window.localStorage.setItem('atmos.theme', theme);
    } catch {
      // Do not interrupt weather controls when browser storage is unavailable.
    }
  }, [preferencesReady, theme, units]);

  useEffect(() => {
    locationSearchRef.current = window.location.search;
    const syncView = () => {
      const nextMapView = window.location.hash === '#map';
      mapViewRef.current = nextMapView;
      setMapView(nextMapView);
      if (nextMapView && !mapPanelInitialized.current) {
        setMapPanelOpen(window.matchMedia('(min-width: 900px)').matches);
        mapPanelInitialized.current = true;
      }
    };
    syncView();
    window.addEventListener('hashchange', syncView);
    window.addEventListener('popstate', syncView);
    return () => {
      window.removeEventListener('hashchange', syncView);
      window.removeEventListener('popstate', syncView);
    };
  }, []);

  useEffect(() => {
    const updateConnectivity = () => {
      setIsOnline(navigator.onLine);
    };
    const onlineOnLoad = navigator.onLine;
    setIsOnline(onlineOnLoad);
    setConnectivityReady(true);
    offlineSnapshotApplied.current = onlineOnLoad;
    window.addEventListener('online', updateConnectivity);
    window.addEventListener('offline', updateConnectivity);
    return () => {
      window.removeEventListener('online', updateConnectivity);
      window.removeEventListener('offline', updateConnectivity);
    };
  }, []);

  useEffect(() => {
    if (!connectivityReady) return;
    try {
      if (!isOnline) {
        if (offlineSnapshotApplied.current) return;
        offlineSnapshotApplied.current = true;
        const snapshot = readOfflineDashboard(window.localStorage);
        if (snapshot) setDashboard(asOfflineDashboard(snapshot));
        return;
      }
      if (!dashboard.meta.stale) saveOfflineDashboard(window.localStorage, dashboard);
    } catch {
      // Offline recovery degrades to the already-rendered dashboard when storage is unavailable.
    }
  }, [connectivityReady, dashboard, isOnline]);

  async function selectLocation(
    location: LocationSearchResult,
    urlBehavior: LocationUrlBehavior = 'push',
  ): Promise<boolean> {
    if (urlBehavior !== 'preserve') {
      refreshRequestGeneration.current += 1;
      setRefreshStatus('idle');
    }
    const generation = ++locationRequestGeneration.current;
    locationRequestController.current?.abort();
    const controller = new AbortController();
    locationRequestController.current = controller;
    const url = new URL('/api/v1/weather/dashboard', gatewayOrigin);
    url.search = new URLSearchParams({
      lat: String(location.latitude),
      lon: String(location.longitude),
      timezone: location.timezone,
      units: 'metric',
    }).toString();
    try {
      const response = await fetch(url, {
        headers: versionAffinityHeaders(),
        signal: controller.signal,
      });
      const parsed = dashboardSchema.safeParse(await response.json());
      if (!response.ok || !parsed.success) throw new Error('Weather request failed');
      if (generation !== locationRequestGeneration.current) return false;
      const selectedLocation = {
        ...location,
        timezone: location.timezone === 'auto' ? parsed.data.location.timezone : location.timezone,
      };
      setDashboard({ ...parsed.data, location: selectedLocation });
      if (urlBehavior === 'push') {
        const locationUrl = new URL(window.location.href);
        locationUrl.search = new URLSearchParams({
          lat: String(selectedLocation.latitude),
          lon: String(selectedLocation.longitude),
          timezone: selectedLocation.timezone,
          name: selectedLocation.name,
          country: selectedLocation.country,
        }).toString();
        // Preserve the App Router's current entry metadata. Weather selection is
        // local state; a queued router URL transition must not overwrite Back.
        window.history.pushState({ ...window.history.state }, '', locationUrl);
        locationSearchRef.current = locationUrl.search;
      } else if (urlBehavior === 'clear') {
        window.history.replaceState(
          { ...window.history.state },
          '',
          `${window.location.pathname}${mapViewRef.current ? '#map' : ''}`,
        );
        locationSearchRef.current = '';
      }
      return true;
    } catch {
      // The existing dashboard remains visible when a selected-location request fails.
      return false;
    } finally {
      if (generation === locationRequestGeneration.current)
        locationRequestController.current = null;
    }
  }

  selectLocationRef.current = selectLocation;

  useEffect(() => {
    function restoreHistoryLocation() {
      const searchChanged = window.location.search !== locationSearchRef.current;
      locationSearchRef.current = window.location.search;
      const sharedLocation = locationFromShareUrl(new URL(window.location.href));
      if (sharedLocation.kind === 'invalid') return;
      // Empty-query hash navigation must retain a device/default saved place.
      if (!searchChanged && sharedLocation.kind === 'root') return;
      const location =
        sharedLocation.kind === 'location' ? sharedLocation.location : initialDashboard.location;
      const current = currentLocationRef.current;
      if (
        current.latitude === location.latitude &&
        current.longitude === location.longitude &&
        current.name === location.name
      )
        return;
      void selectLocationRef.current(location, 'preserve');
    }
    window.addEventListener('popstate', restoreHistoryLocation);
    return () => window.removeEventListener('popstate', restoreHistoryLocation);
  }, [initialDashboard.location]);

  async function refreshWeather() {
    const generation = ++refreshRequestGeneration.current;
    setRefreshStatus('refreshing');
    const currentLocation = dashboard.location;
    const loaded = await selectLocation(currentLocation, 'preserve');
    if (generation === refreshRequestGeneration.current) {
      setRefreshStatus(loaded ? 'idle' : 'failed');
    }
  }

  function selectMapLocation(selectedDashboard: DashboardData) {
    setDashboard(selectedDashboard);
    setRefreshStatus('idle');
    refreshRequestGeneration.current += 1;
    locationRequestController.current?.abort();
    locationRequestGeneration.current += 1;
    const locationUrl = new URL(window.location.href);
    locationUrl.search = new URLSearchParams({
      lat: String(selectedDashboard.location.latitude),
      lon: String(selectedDashboard.location.longitude),
      timezone: selectedDashboard.location.timezone,
      name: selectedDashboard.location.name,
      country: selectedDashboard.location.country,
    }).toString();
    window.history.pushState({ ...window.history.state }, '', locationUrl);
    locationSearchRef.current = locationUrl.search;
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationStatus('unavailable');
      return;
    }
    setLocationStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const location: LocationSearchResult = {
          id: 'device-location',
          name: 'Your location',
          country: 'Device location',
          latitude,
          longitude,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        };
        void selectLocation(location, 'clear').then((loaded) => {
          setLocationStatus(loaded ? 'success' : 'weather-failed');
        });
      },
      (error) => {
        setLocationStatus(
          error.code === error.PERMISSION_DENIED ? 'permission-denied' : 'unavailable',
        );
      },
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 10_000 },
    );
  }

  return (
    <main
      className={`atmos-page weather-app${mapView ? ' is-map-view' : ''}`}
      data-map-panel={mapPanelOpen ? mapPanel : 'closed'}
    >
      <a className="skip-link" href="#current-weather">
        Skip to weather
      </a>
      <section className="dashboard-shell" id="dashboard">
        <header className="topbar">
          {mapView ? <h1 className="sr-only">Atmos Observatory</h1> : null}
          <a className="app-brand" href="#dashboard" aria-label="Atmos home">
            <span className="brand" aria-hidden="true">
              a<span>o</span>
            </span>
            <span>
              atmos<span className="brand-caption">A little closer to outside.</span>
            </span>
          </a>
          <div className="search-cluster">
            <LocationSearch gatewayOrigin={gatewayOrigin} onSelect={selectLocation} />
            <button
              className="current-location-button icon-button"
              type="button"
              onClick={useCurrentLocation}
              disabled={locationStatus === 'locating'}
              aria-label="Use my current location"
              title="Use my current location"
            >
              <LocateFixed
                size={18}
                aria-hidden="true"
                className={locationStatus === 'locating' ? 'refresh-spinning' : undefined}
              />
            </button>
          </div>
          <div className="header-utilities">
            <div className="unit-switch" aria-label="Temperature unit">
              <button
                type="button"
                className={units === 'metric' ? 'active' : ''}
                onClick={() => setUnits('metric')}
                aria-pressed={units === 'metric'}
                aria-label="Celsius"
              >
                °C
              </button>
              <button
                type="button"
                className={units === 'imperial' ? 'active' : ''}
                onClick={() => setUnits('imperial')}
                aria-pressed={units === 'imperial'}
                aria-label="Fahrenheit"
              >
                °F
              </button>
            </div>
            <button
              className="refresh-weather-button icon-button"
              type="button"
              onClick={() => void refreshWeather()}
              disabled={refreshStatus === 'refreshing'}
              aria-label="Refresh weather"
              title="Refresh weather"
            >
              <RefreshCw
                size={17}
                aria-hidden="true"
                className={refreshStatus === 'refreshing' ? 'refresh-spinning' : undefined}
              />
            </button>
          </div>
          <nav className="app-navigation" aria-label="Main navigation">
            <a href="#dashboard" aria-label="Weather" aria-current={!mapView ? 'page' : undefined}>
              <LayoutDashboard size={18} aria-hidden="true" />
              <span>Weather</span>
            </a>
            <a href="#map" aria-label="Map" aria-current={mapView ? 'page' : undefined}>
              <Map size={18} aria-hidden="true" />
              <span>Map</span>
            </a>
            <WeatherTools>
              <SavedLocationsPanel
                gatewayOrigin={gatewayOrigin}
                currentLocation={dashboard.location}
                initialLocationExplicit={initialDashboard.location.id !== 'berlin-de'}
                onSelect={selectLocation}
                onLocationsChange={setSavedLocations}
              />
              <AirQualityPanel gatewayOrigin={gatewayOrigin} location={dashboard.location} />
              <WeatherComparisonPanel
                current={dashboard}
                gatewayOrigin={gatewayOrigin}
                units={units}
                onUseAsCurrent={selectLocation}
              />
              <WeatherHistoryPanel
                gatewayOrigin={gatewayOrigin}
                location={dashboard.location}
                current={dashboard.current}
                provider={dashboard.meta.provider}
                stale={dashboard.meta.stale}
                units={units}
              />
              <InAppAlertsPanel
                gatewayOrigin={gatewayOrigin}
                location={dashboard.location}
                current={dashboard.current}
                hourly={dashboard.hourly}
                stale={dashboard.meta.stale}
              />
              <PreferencesPanel theme={theme} onThemeChange={setTheme} />
            </WeatherTools>
            <a
              className="user-management-link"
              href="/user"
              aria-label="User management"
              title="User management"
            >
              <UserRound size={18} aria-hidden="true" />
              <span>Account</span>
            </a>
          </nav>
        </header>
        <div className="dashboard-intro">
          <p>{formatDashboardDate(dashboard.current.observedAt, dashboard.location.timezone)}</p>
          <span>
            <span className="status-dot" />
            {dashboard.meta.stale ? 'Cached forecast' : 'Your daily outlook'}
          </span>
        </div>
        {mapView ? (
          <aside className="map-inspector" aria-label="Selected city weather">
            <button
              className="map-inspector-toggle"
              type="button"
              aria-expanded={mapPanelOpen}
              aria-controls="map-inspector-tabs"
              onClick={() => setMapPanelOpen((open) => !open)}
            >
              <CloudSun size={20} aria-hidden="true" />
              <span>
                {dashboard.location.name}
                <small>Weather at a glance</small>
              </span>
              <ChevronDown size={18} aria-hidden="true" />
            </button>
            {mapPanelOpen ? (
              <div
                className="map-inspector-tabs"
                id="map-inspector-tabs"
                role="group"
                aria-label="Map weather panel"
              >
                {[
                  ['now', 'Now', 'current-weather'],
                  ['forecast', '7 days', 'forecast'],
                  ['trends', 'Trends', 'trends'],
                  ['activities', 'Plan', 'activities'],
                ].map(([value, label, target]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={mapPanel === value}
                    aria-controls={target}
                    onClick={() => setMapPanel(value!)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </aside>
        ) : null}
        {locationStatus !== 'idle' ? (
          <p className="location-status" role="status" aria-live="polite">
            {locationStatus === 'locating' && 'Requesting your location…'}
            {locationStatus === 'success' && 'Showing weather for your current location.'}
            {locationStatus === 'permission-denied' &&
              'Location permission was denied. Allow location access in your browser settings to try again.'}
            {locationStatus === 'unavailable' &&
              'Your device location is unavailable. You can still search for a city.'}
            {locationStatus === 'weather-failed' &&
              'Weather for your current location could not be loaded. Please try again.'}
          </p>
        ) : null}
        {!isOnline ? (
          <p className="weather-offline" role="status" aria-live="polite">
            Offline · showing {dashboard.location.name}'s last city forecast saved on this device.
            Reconnect to refresh.
          </p>
        ) : null}
        {refreshStatus === 'failed' ? (
          <p className="location-status" role="status" aria-live="polite">
            Weather could not be refreshed. Your current forecast is still shown; try again.
          </p>
        ) : null}

        <section className="dashboard-grid">
          <article
            className="current-card panel"
            id="current-weather"
            tabIndex={-1}
            aria-labelledby="location-name"
          >
            <div className="current-place">
              <div>
                <p className="eyebrow">
                  <MapPin size={13} aria-hidden="true" /> Current weather
                </p>
                <LocationHeading className="location-name" id="location-name">
                  {dashboard.location.name}
                </LocationHeading>
                <p className="muted">{dashboard.location.country}</p>
              </div>
              <p className="weather-freshness">
                Observed <br />
                {formatTimestamp(dashboard.current.observedAt, dashboard.location.timezone)}
              </p>
            </div>
            <div className="current-summary">
              <div className="hero-reading">
                <p
                  className="hero-temperature"
                  aria-label={`${currentTemperature} degrees ${units === 'metric' ? 'Celsius' : 'Fahrenheit'}`}
                >
                  {currentTemperature}
                  <span>°</span>
                </p>
                <p className="hero-condition">{conditionLabel(dashboard.current.condition)}</p>
                {dashboard.daily[0] ? (
                  <p className="hero-range">
                    H: {temperature(dashboard.daily[0].highC, units)}°
                    <span>L: {temperature(dashboard.daily[0].lowC, units)}°</span>
                  </p>
                ) : null}
              </div>
              <div
                className={`condition-mark condition-${dashboard.current.condition}`}
                aria-label={conditionLabel(dashboard.current.condition)}
              >
                <WeatherIcon condition={dashboard.current.condition} size={124} />
              </div>
            </div>
            <div className="weather-stats">
              <Stat
                value={`${temperature(dashboard.current.apparentTemperatureC, units)}°`}
                label="Feels like"
              />
              <Stat
                value={`${dashboard.current.humidityPercent}%`}
                label="Humidity"
                icon={<Droplets size={14} />}
              />
              <Stat
                value={formatWindSpeed(dashboard.current.windSpeedKph, units)}
                label="Wind"
                icon={<Wind size={14} />}
              />
              <Stat
                value={`${dashboard.hourly[0]?.precipitationProbability ?? '—'}%`}
                label="Rain chance"
              />
            </div>
            <details className="weather-extra-details">
              <summary>More conditions</summary>
              <CurrentMeasurements
                current={dashboard.current}
                day={dashboard.daily[0]}
                timezone={dashboard.location.timezone}
                units={units}
              />
            </details>
            <div className="hourly-heading">
              <h2>The next 12 hours</h2>
              <span>Local time</span>
            </div>
            <div className="hourly-row" aria-label="Hourly forecast">
              {dashboard.hourly.map((hour, index) => (
                <button
                  className="hourly-item"
                  key={hour.time}
                  type="button"
                  aria-expanded={selectedHourTime === hour.time}
                  aria-controls={`hourly-detail-${index}`}
                  aria-label={`${selectedHourTime === hour.time ? 'Hide' : 'Show'} details for ${formatHour(hour.time, dashboard.location.timezone)} hourly forecast`}
                  onClick={() =>
                    setSelectedHourTime((selected) => (selected === hour.time ? null : hour.time))
                  }
                >
                  <span>{formatHour(hour.time, dashboard.location.timezone)}</span>
                  <WeatherIcon condition={hour.condition} size={18} />
                  <strong>{temperature(hour.temperatureC, units)}°</strong>
                </button>
              ))}
            </div>
            {selectedHour ? (
              <section
                className="forecast-detail hourly-detail"
                id={`hourly-detail-${selectedHourIndex}`}
                aria-label={`Hourly forecast details for ${formatTimestamp(selectedHour.time, dashboard.location.timezone)}`}
              >
                <div className="forecast-detail-heading">
                  <strong>{formatTimestamp(selectedHour.time, dashboard.location.timezone)}</strong>
                  <span>{conditionLabel(selectedHour.condition)}</span>
                </div>
                <div className="forecast-detail-stats">
                  <div>
                    <span>Temperature</span>
                    <strong>{temperature(selectedHour.temperatureC, units)}°</strong>
                  </div>
                  <div>
                    <span>Precipitation chance</span>
                    <strong>{selectedHour.precipitationProbability}%</strong>
                  </div>
                </div>
                <HourlyMeasurements hour={selectedHour} units={units} />
              </section>
            ) : null}
          </article>

          <DashboardMap
            dashboard={dashboard}
            gatewayOrigin={gatewayOrigin}
            units={units}
            onSelectLocation={selectMapLocation}
            onOpenLocation={selectLocation}
            observatory={mapView}
            savedLocations={savedLocations}
          />

          <article className="overview-card panel" id="trends" aria-labelledby="trend-title">
            <div className="card-heading">
              <div>
                <p className="eyebrow">The bigger picture</p>
                <h2 id="trend-title">
                  {chartRange === '12h'
                    ? 'The hours ahead.'
                    : chartRange === '7d'
                      ? 'A week in view.'
                      : 'The next sixteen days.'}
                </h2>
              </div>
              <label className="chart-series-picker" htmlFor="forecast-chart-series">
                Measure
                <select
                  id="forecast-chart-series"
                  aria-label="Chart metric"
                  value={activeMetric}
                  onChange={(event) => {
                    const metric = event.target.value as ForecastTrendMetric;
                    if (forecastTrendAvailable(metric, chartRange, dashboard.hourly))
                      setActiveMetric(metric);
                  }}
                >
                  {forecastTrendMetrics.map((metric) => (
                    <option
                      key={metric}
                      value={metric}
                      disabled={!forecastTrendAvailable(metric, chartRange, dashboard.hourly)}
                    >
                      {forecastTrendMetricLabels[metric]}
                      {!forecastTrendAvailable(metric, chartRange, dashboard.hourly)
                        ? ' · unavailable'
                        : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div
              className="chart-range-picker metric-tabs"
              role="group"
              aria-label="Chart time range"
            >
              {(
                [
                  ['12h', 'Next 12 hours'],
                  ['7d', '7 days'],
                  ['16d', '16 days'],
                ] as const
              ).map(([range, label]) => (
                <button
                  key={range}
                  type="button"
                  aria-pressed={chartRange === range}
                  className={chartRange === range ? 'active' : ''}
                  disabled={range === '16d' && outlook.length <= 7}
                  onClick={() => {
                    setChartRange(range);
                    if (!forecastTrendAvailable(activeMetric, range, dashboard.hourly))
                      setActiveMetric('temperature');
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="chart-wrap">
              <ForecastTrendChart
                daily={outlook}
                hourly={dashboard.hourly}
                metric={activeMetric}
                range={chartRange}
                units={units}
                timezone={dashboard.location.timezone}
              />
            </div>
          </article>

          <article className="forecast-card panel" id="forecast" aria-labelledby="forecast-title">
            <div className="card-heading">
              <div>
                <p className="eyebrow">Looking ahead</p>
                <h2 id="forecast-title">
                  {forecastDays === 7
                    ? 'The next seven days.'
                    : `The next ${Math.min(16, outlook.length)} days.`}
                </h2>
              </div>
              <span className="forecast-unit">°{units === 'metric' ? 'C' : 'F'}</span>
            </div>
            <div
              className="forecast-horizon metric-tabs"
              role="group"
              aria-label="Forecast horizon"
            >
              <button
                type="button"
                aria-pressed={forecastDays === 7}
                className={forecastDays === 7 ? 'active' : ''}
                onClick={() => {
                  setForecastDays(7);
                  setSelectedDayDate(null);
                }}
              >
                7 days
              </button>
              <button
                type="button"
                aria-pressed={forecastDays === 16}
                className={forecastDays === 16 ? 'active' : ''}
                disabled={outlook.length <= 7}
                onClick={() => setForecastDays(16)}
              >
                Up to 16 days
              </button>
            </div>
            {forecastDays === 16 ? (
              <p className="measurement-note">
                Longer-range forecasts have greater uncertainty. Showing the days available from the
                provider.
              </p>
            ) : null}
            <div className="forecast-list">
              {visibleDays.map((day, index) => (
                <div className="forecast-day" key={day.date}>
                  <button
                    className="forecast-row"
                    type="button"
                    aria-expanded={selectedDayDate === day.date}
                    aria-controls={`daily-detail-${index}`}
                    aria-label={`${selectedDayDate === day.date ? 'Hide' : 'Show'} details for ${formatForecastDate(day.date)} forecast`}
                    onClick={() =>
                      setSelectedDayDate((selected) => (selected === day.date ? null : day.date))
                    }
                  >
                    <time dateTime={day.date}>
                      {index === 0 ? 'Today' : formatForecastDate(day.date)}
                    </time>
                    <span className="forecast-icon" aria-label={conditionLabel(day.condition)}>
                      <WeatherIcon condition={day.condition} size={20} />
                    </span>
                    <span className="forecast-rain">
                      <Droplets size={11} aria-hidden="true" />
                      {day.precipitationProbability === null ? (
                        <span aria-label="Rain probability unavailable">—</span>
                      ) : (
                        `${day.precipitationProbability}%`
                      )}
                    </span>
                    <span className="forecast-low">{temperature(day.lowC, units)}°</span>
                    <span className="temperature-track" aria-hidden="true">
                      <span
                        style={{
                          left: `${((day.lowC - forecastLow) / forecastRange) * 100}%`,
                          width: `${Math.max(5, ((day.highC - day.lowC) / forecastRange) * 100)}%`,
                        }}
                      />
                    </span>
                    <strong>{temperature(day.highC, units)}°</strong>
                  </button>
                  {selectedDayDate === day.date ? (
                    <section
                      className="forecast-detail daily-detail"
                      id={`daily-detail-${index}`}
                      aria-label={`Daily forecast details for ${formatForecastDate(day.date)}`}
                    >
                      <div className="forecast-detail-heading">
                        <strong>{formatForecastDate(day.date)}</strong>
                        <span>{conditionLabel(day.condition)}</span>
                      </div>
                      <div className="forecast-detail-stats">
                        <div>
                          <span>High / low</span>
                          <strong>
                            {temperature(day.highC, units)}° / {temperature(day.lowC, units)}°
                          </strong>
                        </div>
                        <div>
                          <span>Precipitation chance</span>
                          <strong>
                            {day.precipitationProbability === null
                              ? 'Unavailable'
                              : `${day.precipitationProbability}%`}
                          </strong>
                        </div>
                      </div>
                      <DailyMeasurements
                        day={day}
                        units={units}
                        timezone={dashboard.location.timezone}
                      />
                    </section>
                  ) : null}
                </div>
              ))}
            </div>
          </article>

          <ActivityPlanner
            key={`${dashboard.location.id}:${dashboard.location.latitude}:${dashboard.location.longitude}`}
            gatewayOrigin={gatewayOrigin}
            units={units}
            hourly={dashboard.hourly}
            location={dashboard.location}
          />

          {isOnline && dashboard.meta.stale ? (
            <p className="weather-stale" role="status">
              Showing cached weather while Open-Meteo is unavailable.
            </p>
          ) : null}
        </section>
        <a className="observatory-invitation" href="#map">
          <Map size={20} aria-hidden="true" />
          <span>
            There’s a bigger picture.<small>Explore radar and weather layers in Observatory.</small>
          </span>
          <ArrowUpRight size={22} aria-hidden="true" />
        </a>
        <footer>
          <span>Live weather data: Open-Meteo.</span>
          <span>Maps: OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors.</span>
          <LegalLinks />
        </footer>
      </section>
    </main>
  );
}

function Stat({ value, label, icon }: { value: string; label: string; icon?: ReactNode }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>
        {icon}
        {label}
      </span>
    </div>
  );
}
