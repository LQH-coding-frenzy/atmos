'use client';

import type { Dashboard as DashboardData, UnitSystem, WeatherCondition } from '@atmos/contracts';
import { formatTemperature, formatWindSpeed } from '@atmos/domain';
import {
  Bell,
  Cloud,
  CloudLightning,
  CloudRain,
  CloudSun,
  Compass,
  Droplets,
  Gauge,
  LayoutDashboard,
  LocateFixed,
  Map,
  Menu,
  Search,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import { useState } from 'react';

type DashboardProps = {
  initialDashboard: DashboardData;
};

const chartLabels = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function WeatherIcon({ condition, size = 22 }: { condition: WeatherCondition; size?: number }) {
  const iconProps = { size, strokeWidth: 1.6, 'aria-hidden': true };
  if (condition === 'clear') return <Sun {...iconProps} />;
  if (condition === 'partly-cloudy') return <CloudSun {...iconProps} />;
  if (condition === 'cloudy') return <Cloud {...iconProps} />;
  if (condition === 'thunderstorm') return <CloudLightning {...iconProps} />;
  return <CloudRain {...iconProps} />;
}

function temperature(value: number, units: UnitSystem): string {
  return formatTemperature(value, units).replace(' deg', '');
}

function formatHour(value: string): string {
  return new Intl.DateTimeFormat('en', { hour: 'numeric' }).format(new Date(value));
}

export function Dashboard({ initialDashboard }: DashboardProps) {
  const [units, setUnits] = useState<UnitSystem>('metric');
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [activeMetric, setActiveMetric] = useState('Humidity');
  const dashboard = initialDashboard;
  const currentTemperature = temperature(dashboard.current.temperatureC, units);
  const weatherDescription = dashboard.current.condition.replace('-', ' ');

  return (
    <main className="atmos-page">
      <aside
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
          <a href="#saved">
            <LocateFixed size={19} />
            <span>Locations</span>
          </a>
          <a href="#alerts">
            <Bell size={19} />
            <span>Alerts</span>
          </a>
          <a href="#explore">
            <Compass size={19} />
            <span>Explore</span>
          </a>
        </nav>
        <a className="settings-link" href="#settings">
          <Settings size={19} />
          <span>Settings</span>
        </a>
      </aside>

      <section className="dashboard-shell" id="dashboard">
        <header className="topbar">
          <button
            className="menu-button"
            onClick={() => setNavigationOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={21} />
          </button>
          <div>
            <p className="eyebrow">Weather intelligence</p>
            <h1>Tuesday, 1 September</h1>
          </div>
          <div className="topbar-actions">
            <label className="search-control">
              <Search size={17} aria-hidden="true" />
              <span className="sr-only">Search city or postcode</span>
              <input aria-label="Search city or postcode" placeholder="Search city or postcode" />
            </label>
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
              <div className="condition-mark">
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
                <div className="hourly-item" key={hour.time}>
                  <span>{formatHour(hour.time)}</span>
                  <WeatherIcon condition={hour.condition} size={18} />
                  <strong>{temperature(hour.temperatureC, units)} deg</strong>
                </div>
              ))}
            </div>
          </article>

          <article className="map-card" id="map" aria-label="OpenStreetMap-compatible map preview">
            <div className="map-grid" />
            <div className="map-contour contour-one" />
            <div className="map-contour contour-two" />
            <div className="map-label">
              <span className="map-pin" />
              {dashboard.location.name}, {dashboard.location.country}
              <small>
                {currentTemperature} deg, {weatherDescription}
              </small>
            </div>
            <p className="map-caption">OpenStreetMap-compatible map layer</p>
          </article>

          <article className="overview-card panel">
            <div className="card-heading">
              <div>
                <p className="eyebrow">Live patterns</p>
                <h2>Overview</h2>
              </div>
              <div className="metric-tabs" role="tablist" aria-label="Chart metric">
                {['Humidity', 'UV index', 'Rainfall', 'Pressure'].map((metric) => (
                  <button
                    key={metric}
                    className={activeMetric === metric ? 'active' : ''}
                    onClick={() => setActiveMetric(metric)}
                    role="tab"
                    aria-selected={activeMetric === metric}
                  >
                    {metric}
                  </button>
                ))}
              </div>
            </div>
            <div className="chart-wrap" aria-label={`${activeMetric} chart for the previous year`}>
              <svg viewBox="0 0 640 240" role="img" aria-labelledby="chart-title chart-description">
                <title id="chart-title">{`${activeMetric} trend`}</title>
                <desc id="chart-description">A line chart with monthly trend data.</desc>
                {[30, 75, 120, 165].map((y) => (
                  <line key={y} x1="42" x2="620" y1={y} y2={y} className="chart-grid" />
                ))}
                <path
                  className="chart-area"
                  d="M42 112 C80 130,95 150,130 155 S180 142,210 124 S270 78,310 71 S350 93,385 104 S430 107,460 98 S520 55,558 51 S600 67,620 78 L620 205 L42 205 Z"
                />
                <path
                  className="chart-line"
                  d="M42 112 C80 130,95 150,130 155 S180 142,210 124 S270 78,310 71 S350 93,385 104 S430 107,460 98 S520 55,558 51 S600 67,620 78"
                />
                <circle className="chart-dot" cx="310" cy="71" r="7" />
                {chartLabels.map((label, index) => (
                  <text
                    key={label}
                    x={42 + index * 52.5}
                    y="229"
                    className="chart-label"
                    textAnchor="middle"
                  >
                    {label}
                  </text>
                ))}
              </svg>
              <div className="chart-tooltip">
                <span />
                Average 64%
              </div>
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
              {dashboard.daily.slice(0, 4).map((day) => (
                <div className="forecast-row" key={day.date}>
                  <span className="forecast-icon">
                    <WeatherIcon condition={day.condition} size={20} />
                  </span>
                  <div>
                    <strong>{temperature(day.highC, units)} deg</strong>
                    <span> / {temperature(day.lowC, units)} deg</span>
                  </div>
                  <time>
                    {new Intl.DateTimeFormat('en', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    }).format(new Date(`${day.date}T00:00:00Z`))}
                  </time>
                </div>
              ))}
            </div>
          </article>

          <section className="saved-locations" id="saved" aria-label="Saved locations">
            <button className="add-location">
              <span>+</span>
              <strong>Add location</strong>
              <small>Build your weather world</small>
            </button>
            {[
              ['Lisbon', 'Portugal', 23, 'clear'],
              ['Kyoto', 'Japan', 29, 'cloudy'],
              ['Antalya', 'Türkiye', 30, 'partly-cloudy'],
            ].map(([name, country, value, condition]) => (
              <article className="location-card panel" key={name as string}>
                <WeatherIcon condition={condition as WeatherCondition} size={22} />
                <strong>{name}</strong>
                <span>{country}</span>
                <em>{temperature(value as number, units)} deg</em>
              </article>
            ))}
          </section>

          <aside className="attribution-card">
            <Droplets size={25} />
            <div>
              <p className="eyebrow">Data honesty</p>
              <h2>Built for the elements.</h2>
              <p>
                Mock data powers this local dashboard. Live weather uses Open-Meteo with visible
                attribution and quota-aware caching.
              </p>
            </div>
          </aside>
        </section>
        <footer>
          Weather data: Open-Meteo. Map data: OpenStreetMap contributors. Local view currently uses
          deterministic mock weather data.
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
