'use client';

import type { Dashboard as DashboardData, UnitSystem, WeatherCondition } from '@atmos/contracts';
import { formatTemperature, formatWindSpeed } from '@atmos/domain';
import {
  Cloud,
  CloudLightning,
  CloudRain,
  CloudSun,
  Droplets,
  Gauge,
  LayoutDashboard,
  Map,
  Menu,
  Sun,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { DashboardMap } from './dashboard-map';
import { ForecastTrendChart } from './forecast-trend-chart';
import type { ForecastTrendMetric } from '../lib/forecast-trend';

type DashboardProps = {
  initialDashboard: DashboardData;
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

function formatForecastDate(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: timezone,
  }).format(new Date(`${value}T00:00:00Z`));
}

export function Dashboard({ initialDashboard }: DashboardProps) {
  const [units, setUnits] = useState<UnitSystem>('metric');
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [activeMetric, setActiveMetric] = useState<ForecastTrendMetric>('temperature');
  const dashboard = initialDashboard;
  const currentTemperature = temperature(dashboard.current.temperatureC, units);

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
          onClick={() => setNavigationOpen(false)}
          aria-label="Close navigation"
        >
          <X size={18} />
        </button>
        <nav aria-label="Main navigation">
          <a href="#dashboard" aria-current="page">
            <LayoutDashboard size={19} />
            <span>Dashboard</span>
          </a>
          <a href="#map">
            <Map size={19} />
            <span>Map</span>
          </a>
        </nav>
      </aside>

      <section className="dashboard-shell" id="dashboard">
        <header className="topbar">
          <button
            className="menu-button"
            onClick={() => setNavigationOpen(true)}
            aria-label="Open navigation"
            aria-controls="main-navigation"
            aria-expanded={navigationOpen}
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
            <div className="unit-switch" aria-label="Temperature unit">
              <button
                className={units === 'metric' ? 'active' : ''}
                onClick={() => setUnits('metric')}
                aria-pressed={units === 'metric'}
              >
                C
              </button>
              <button
                className={units === 'imperial' ? 'active' : ''}
                onClick={() => setUnits('imperial')}
                aria-pressed={units === 'imperial'}
              >
                F
              </button>
            </div>
          </div>
        </header>

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
              <div className="metric-tabs" role="tablist" aria-label="Chart metric">
                {chartMetrics.map((metric) => (
                  <button
                    key={metric.value}
                    className={activeMetric === metric.value ? 'active' : ''}
                    onClick={() => setActiveMetric(metric.value)}
                    role="tab"
                    aria-selected={activeMetric === metric.value}
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
                  <time>{formatForecastDate(day.date, dashboard.location.timezone)}</time>
                </div>
              ))}
            </div>
          </article>

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
