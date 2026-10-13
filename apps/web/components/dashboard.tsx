'use client';

import {
  dashboardSchema,
  type Dashboard as DashboardData,
  type LocationSearchResult,
  type UnitSystem,
  type WeatherCondition,
} from '@atmos/contracts';
import { formatTemperature, formatWindSpeed } from '@atmos/domain';
import {
  Cloud,
  CloudLightning,
  CloudRain,
  CloudSun,
  Droplets,
  Gauge,
  LocateFixed,
  LayoutDashboard,
  Map,
  Menu,
  RefreshCw,
  Snowflake,
  Sun,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
import type { ForecastTrendMetric } from '../lib/forecast-trend';
import { versionAffinityHeaders } from '../lib/version-affinity';
import {
  asOfflineDashboard,
  readOfflineDashboard,
  saveOfflineDashboard,
} from '../lib/offline-dashboard';
import { locationFromShareUrl } from '../lib/location-url';

type DashboardProps = {
  initialDashboard: DashboardData;
  gatewayOrigin: string;
};

type LocationUrlBehavior = 'push' | 'clear' | 'preserve';

const chartMetrics: Array<{ label: string; value: ForecastTrendMetric }> = [
  { label: 'Temperature', value: 'temperature' },
  { label: 'Rain chance', value: 'rain-chance' },
];

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
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [activeMetric, setActiveMetric] = useState<ForecastTrendMetric>('temperature');
  const [selectedHourTime, setSelectedHourTime] = useState<string | null>(null);
  const [selectedDayDate, setSelectedDayDate] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<
    'idle' | 'locating' | 'success' | 'permission-denied' | 'unavailable' | 'weather-failed'
  >('idle');
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const locationRequestGeneration = useRef(0);
  const locationRequestController = useRef<AbortController | null>(null);
  const selectLocationRef = useRef<
    (location: LocationSearchResult, urlBehavior?: LocationUrlBehavior) => Promise<boolean>
  >(async () => false);
  const refreshRequestGeneration = useRef(0);
  const offlineSnapshotApplied = useRef(false);
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [isOnline, setIsOnline] = useState(true);
  const [connectivityReady, setConnectivityReady] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<'idle' | 'refreshing' | 'failed'>('idle');
  const currentTemperature = temperature(dashboard.current.temperatureC, units);
  const selectedHourIndex = dashboard.hourly.findIndex((hour) => hour.time === selectedHourTime);
  const selectedHour = selectedHourIndex >= 0 ? dashboard.hourly[selectedHourIndex] : undefined;

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
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!preferencesReady) return;
    try {
      window.localStorage.setItem('atmos.units', units);
      window.localStorage.setItem('atmos.theme', theme);
    } catch {
      // Do not interrupt weather controls when browser storage is unavailable.
    }
  }, [preferencesReady, theme, units]);

  function closeNavigation() {
    setNavigationOpen(false);
    requestAnimationFrame(() => menuButton.current?.focus());
  }

  useEffect(() => {
    if (!navigationOpen) return;
    closeButton.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') closeNavigation();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [navigationOpen]);

  useEffect(() => {
    const closeToolPanels = (restoreFocus: boolean) => {
      const openPanels = Array.from(
        document.querySelectorAll<HTMLDetailsElement>(
          '.topbar-actions details[name="dashboard-tools"][open]',
        ),
      );
      for (const panel of openPanels) panel.open = false;
      if (restoreFocus) openPanels.at(-1)?.querySelector('summary')?.focus();
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      const openPanel = document.querySelector<HTMLDetailsElement>(
        '.topbar-actions details[name="dashboard-tools"][open]',
      );
      if (!openPanel || (target instanceof Node && openPanel.contains(target))) return;
      closeToolPanels(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const hasOpenPanel = document.querySelector(
        '.topbar-actions details[name="dashboard-tools"][open]',
      );
      if (!hasOpenPanel) return;
      event.preventDefault();
      closeToolPanels(true);
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleEscape);
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
        window.history.pushState({}, '', locationUrl);
      } else if (urlBehavior === 'clear') {
        window.history.replaceState({}, '', window.location.pathname);
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
      const sharedLocation = locationFromShareUrl(new URL(window.location.href));
      if (sharedLocation.kind === 'invalid') return;
      const location =
        sharedLocation.kind === 'location' ? sharedLocation.location : initialDashboard.location;
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
    window.history.pushState({}, '', locationUrl);
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
    <main className="atmos-page">
      <aside
        id="main-navigation"
        className={navigationOpen ? 'sidebar sidebar-open' : 'sidebar'}
        aria-label="Main navigation"
      >
        <div className="brand" aria-label="Atmos home">
          a<span>o</span>
        </div>
        <button
          className="close-nav"
          onClick={closeNavigation}
          aria-label="Close navigation"
          ref={closeButton}
        >
          <X size={18} />
        </button>
        <nav aria-label="Main navigation">
          <a href="#dashboard" aria-current="page" onClick={closeNavigation}>
            <LayoutDashboard size={19} />
            <span>Dashboard</span>
          </a>
          <a href="#map" onClick={closeNavigation}>
            <Map size={19} />
            <span>Map</span>
          </a>
        </nav>
      </aside>

      <section className="dashboard-shell" id="dashboard" inert={navigationOpen}>
        <header className="topbar">
          <button
            className="menu-button"
            onClick={() => setNavigationOpen(true)}
            aria-label="Open navigation"
            aria-controls="main-navigation"
            aria-expanded={navigationOpen}
            ref={menuButton}
          >
            <Menu size={21} />
          </button>
          <div>
            <p className="eyebrow">Weather intelligence</p>
            <h1>
              {formatDashboardDate(dashboard.current.observedAt, dashboard.location.timezone)}
            </h1>
          </div>
          <div className="topbar-actions">
            <LocationSearch gatewayOrigin={gatewayOrigin} onSelect={selectLocation} />
            <a
              className="user-management-link"
              href="/user"
              aria-label="User management"
              title="User management"
            >
              <UserRound size={18} aria-hidden="true" />
            </a>
            <SavedLocationsPanel
              gatewayOrigin={gatewayOrigin}
              currentLocation={dashboard.location}
              initialLocationExplicit={initialDashboard.location.id !== 'berlin-de'}
              onSelect={selectLocation}
            />
            <WeatherHistoryPanel
              gatewayOrigin={gatewayOrigin}
              location={dashboard.location}
              current={dashboard.current}
              provider={dashboard.meta.provider}
              stale={dashboard.meta.stale}
              units={units}
            />
            <AirQualityPanel gatewayOrigin={gatewayOrigin} location={dashboard.location} />
            <InAppAlertsPanel
              gatewayOrigin={gatewayOrigin}
              location={dashboard.location}
              current={dashboard.current}
              hourly={dashboard.hourly}
              stale={dashboard.meta.stale}
            />
            <WeatherComparisonPanel
              current={dashboard}
              gatewayOrigin={gatewayOrigin}
              units={units}
              onUseAsCurrent={selectLocation}
            />
            <PreferencesPanel theme={theme} onThemeChange={setTheme} />
            <button
              className="refresh-weather-button"
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
            <button
              className="current-location-button"
              type="button"
              onClick={useCurrentLocation}
              disabled={locationStatus === 'locating'}
              aria-label="Use my current location"
            >
              <LocateFixed size={17} aria-hidden="true" />
              <span>{locationStatus === 'locating' ? 'Locating…' : 'My location'}</span>
            </button>
            <div className="unit-switch" aria-label="Temperature unit">
              <button
                className={units === 'metric' ? 'active' : ''}
                onClick={() => setUnits('metric')}
                aria-pressed={units === 'metric'}
                aria-label="Celsius"
              >
                C
              </button>
              <button
                className={units === 'imperial' ? 'active' : ''}
                onClick={() => setUnits('imperial')}
                aria-pressed={units === 'imperial'}
                aria-label="Fahrenheit"
              >
                F
              </button>
            </div>
          </div>
        </header>
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
          <article className="current-card panel">
            <div className="current-summary">
              <div
                className="condition-mark"
                aria-label={conditionLabel(dashboard.current.condition)}
              >
                <WeatherIcon condition={dashboard.current.condition} size={59} />
              </div>
              <div>
                <p className="location-name">{dashboard.location.name}</p>
                <p className="muted">{dashboard.location.country}</p>
                <p className="weather-freshness">
                  Observed{' '}
                  {formatTimestamp(dashboard.current.observedAt, dashboard.location.timezone)}
                </p>
              </div>
              <div className="weather-stats">
                <Stat value={`${currentTemperature} deg`} label="Temperature" />
                <Stat value={`${dashboard.current.humidityPercent}%`} label="Humidity" />
                <Stat
                  value={formatWindSpeed(dashboard.current.windSpeedKph, units)}
                  label="Wind speed"
                />
              </div>
            </div>
            <details className="weather-extra-details">
              <summary>More conditions</summary>
              <div className="weather-extra-stats" aria-label="Additional current conditions">
                <Stat
                  value={`${temperature(dashboard.current.apparentTemperatureC, units)} deg`}
                  label="Feels like"
                />
                <Stat value={`${Math.round(dashboard.current.pressureHpa)} hPa`} label="Pressure" />
              </div>
            </details>
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
                  <strong>{temperature(hour.temperatureC, units)} deg</strong>
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
                    <strong>{temperature(selectedHour.temperatureC, units)} deg</strong>
                  </div>
                  <div>
                    <span>Precipitation chance</span>
                    <strong>{selectedHour.precipitationProbability}%</strong>
                  </div>
                </div>
              </section>
            ) : null}
          </article>

          <DashboardMap
            dashboard={dashboard}
            gatewayOrigin={gatewayOrigin}
            units={units}
            onSelectLocation={selectMapLocation}
            onOpenLocation={selectLocation}
          />

          <article className="overview-card panel">
            <div className="card-heading">
              <div>
                <p className="eyebrow">Live patterns</p>
                <h2>Overview</h2>
              </div>
              <div className="metric-tabs" role="group" aria-label="Chart metric">
                {chartMetrics.map((metric) => (
                  <button
                    key={metric.value}
                    className={activeMetric === metric.value ? 'active' : ''}
                    onClick={() => setActiveMetric(metric.value)}
                    aria-pressed={activeMetric === metric.value}
                  >
                    {metric.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="chart-wrap">
              <ForecastTrendChart daily={dashboard.daily} metric={activeMetric} units={units} />
            </div>
          </article>

          <article className="forecast-card panel">
            <div className="card-heading">
              <div>
                <p className="eyebrow">Next seven days</p>
                <h2>Forecasts</h2>
              </div>
              <Gauge size={21} />
            </div>
            <div className="forecast-list">
              {dashboard.daily.map((day, index) => (
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
                    <span className="forecast-icon">
                      <WeatherIcon condition={day.condition} size={20} />
                    </span>
                    <div>
                      <strong>{temperature(day.highC, units)} deg</strong>
                      <span> / {temperature(day.lowC, units)} deg</span>
                    </div>
                    <time>{formatForecastDate(day.date)}</time>
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
                            {temperature(day.highC, units)} / {temperature(day.lowC, units)} deg
                          </strong>
                        </div>
                        <div>
                          <span>Precipitation chance</span>
                          <strong>{day.precipitationProbability}%</strong>
                        </div>
                      </div>
                    </section>
                  ) : null}
                </div>
              ))}
            </div>
          </article>

          <ActivityPlanner hourly={dashboard.hourly} location={dashboard.location} />

          <aside className="attribution-card">
            <Droplets size={25} />
            <div>
              <p className="eyebrow">Data honesty</p>
              <h2>Built for the elements.</h2>
              <p>
                Live weather comes through the Atmos gateway from Open-Meteo, with visible
                attribution and quota-aware caching.
              </p>
            </div>
          </aside>
          {isOnline && dashboard.meta.stale ? (
            <p className="weather-stale" role="status">
              Showing cached weather while Open-Meteo is unavailable.
            </p>
          ) : null}
        </section>
        <footer>
          <span>Live weather data: Open-Meteo.</span>
          <span>Maps: OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors.</span>
        </footer>
      </section>
    </main>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
