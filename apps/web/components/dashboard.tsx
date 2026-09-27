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
  Snowflake,
  Sun,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { DashboardMap } from './dashboard-map';
import { ActivityPlanner } from './activity-planner';
import { ForecastTrendChart } from './forecast-trend-chart';
import { LocationSearch } from './location-search';
import { SavedLocationsPanel } from './saved-locations-panel';
import type { ForecastTrendMetric } from '../lib/forecast-trend';

type DashboardProps = {
  initialDashboard: DashboardData;
  gatewayOrigin: string;
};

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
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [activeMetric, setActiveMetric] = useState<ForecastTrendMetric>('temperature');
  const [locationStatus, setLocationStatus] = useState<
    'idle' | 'locating' | 'success' | 'permission-denied' | 'unavailable' | 'weather-failed'
  >('idle');
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [dashboard, setDashboard] = useState(initialDashboard);
  const currentTemperature = temperature(dashboard.current.temperatureC, units);

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

  async function selectLocation(
    location: LocationSearchResult,
    shareInUrl = true,
  ): Promise<boolean> {
    const url = new URL('/api/v1/weather/dashboard', gatewayOrigin);
    url.search = new URLSearchParams({
      lat: String(location.latitude),
      lon: String(location.longitude),
      timezone: location.timezone,
      units: 'metric',
    }).toString();
    try {
      const response = await fetch(url);
      const parsed = dashboardSchema.safeParse(await response.json());
      if (!response.ok || !parsed.success) throw new Error('Weather request failed');
      const selectedLocation = {
        ...location,
        timezone: location.timezone === 'auto' ? parsed.data.location.timezone : location.timezone,
      };
      setDashboard({ ...parsed.data, location: selectedLocation });
      if (shareInUrl) {
        const locationUrl = new URL(window.location.href);
        locationUrl.search = new URLSearchParams({
          lat: String(selectedLocation.latitude),
          lon: String(selectedLocation.longitude),
          timezone: selectedLocation.timezone,
          name: selectedLocation.name,
          country: selectedLocation.country,
        }).toString();
        window.history.pushState({}, '', locationUrl);
      } else {
        window.history.replaceState({}, '', window.location.pathname);
      }
      return true;
    } catch {
      // The existing dashboard remains visible when a selected-location request fails.
      return false;
    }
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
        void selectLocation(location, false).then((loaded) => {
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
            <SavedLocationsPanel
              gatewayOrigin={gatewayOrigin}
              currentLocation={dashboard.location}
              onSelect={selectLocation}
            />
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
            <div className="hourly-row" aria-label="Hourly forecast">
              {dashboard.hourly.map((hour) => (
                <div
                  className="hourly-item"
                  key={hour.time}
                  aria-label={`${formatHour(hour.time, dashboard.location.timezone)}, ${conditionLabel(hour.condition)}, ${temperature(hour.temperatureC, units)} degrees`}
                >
                  <span>{formatHour(hour.time, dashboard.location.timezone)}</span>
                  <WeatherIcon condition={hour.condition} size={18} />
                  <strong>{temperature(hour.temperatureC, units)} deg</strong>
                </div>
              ))}
            </div>
          </article>

          <DashboardMap location={dashboard.location} current={dashboard.current} />

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
              {dashboard.daily.map((day) => (
                <div className="forecast-row" key={day.date}>
                  <span className="forecast-icon">
                    <WeatherIcon condition={day.condition} size={20} />
                  </span>
                  <div>
                    <strong>{temperature(day.highC, units)} deg</strong>
                    <span> / {temperature(day.lowC, units)} deg</span>
                  </div>
                  <time>{formatForecastDate(day.date)}</time>
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
          {dashboard.meta.stale ? (
            <p className="weather-stale" role="status">
              Showing cached weather while Open-Meteo is unavailable.
            </p>
          ) : null}
        </section>
        <footer>Live weather data: Open-Meteo. Map view: MapLibre.</footer>
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
