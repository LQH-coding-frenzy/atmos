'use client';

import { airQualitySchema, type AirQuality, type Location } from '@atmos/contracts';
import { Wind } from 'lucide-react';
import { useEffect, useState } from 'react';
import { classifyEuropeanAqi, classifyUsAqi, formatAqiValue } from '../lib/air-quality';

type AirQualityPanelProps = {
  gatewayOrigin: string;
  location: Location;
};

function formatObservedTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(value));
}

function formatPollutant(value: number | null): string {
  return value === null ? 'Unavailable' : `${value.toFixed(1)} µg/m³`;
}

export function AirQualityPanel({ gatewayOrigin, location }: AirQualityPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [airQuality, setAirQuality] = useState<AirQuality | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    setAirQuality(null);
    const url = new URL('/api/v1/weather/air-quality', gatewayOrigin);
    url.search = new URLSearchParams({
      lat: String(location.latitude),
      lon: String(location.longitude),
    }).toString();

    void fetch(url, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const parsed = airQualitySchema.safeParse(await response.json().catch(() => undefined));
        if (!response.ok || !parsed.success) throw new Error('Air quality is unavailable');
        setAirQuality(parsed.data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [expanded, gatewayOrigin, location.latitude, location.longitude]);

  const usCategory = airQuality ? classifyUsAqi(airQuality.usAqi) : null;
  const europeanCategory = airQuality ? classifyEuropeanAqi(airQuality.europeanAqi) : null;

  return (
    <details
      className="air-quality-panel"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>
        <Wind size={17} aria-hidden="true" />
        <span>Air quality</span>
      </summary>
      <section className="air-quality-popover" aria-label="Air quality">
        <h2>Air quality now</h2>
        <p className="air-quality-location">{location.name}</p>
        {loading ? <p role="status">Loading air quality…</p> : null}
        {failed ? <p role="status">Air quality is temporarily unavailable.</p> : null}
        {airQuality && !loading ? (
          <>
            <p className="air-quality-observed">
              Model time {formatObservedTime(airQuality.observedAt, location.timezone)}
            </p>
            {airQuality.meta.stale ? (
              <p className="air-quality-stale" role="status">
                Showing a cached estimate while live air-quality data is unavailable.
              </p>
            ) : null}
            <div className="air-quality-indices">
              <article className={usCategory ? `aqi-index aqi-${usCategory.level}` : 'aqi-index'}>
                <span>U.S. AQI</span>
                <strong>{formatAqiValue(airQuality.usAqi)}</strong>
                <small>{usCategory?.label ?? 'Unavailable'}</small>
              </article>
              <article
                className={
                  europeanCategory ? `aqi-index aqi-${europeanCategory.level}` : 'aqi-index'
                }
              >
                <span>European AQI</span>
                <strong>{formatAqiValue(airQuality.europeanAqi)}</strong>
                <small>{europeanCategory?.label ?? 'Unavailable'}</small>
              </article>
            </div>
            <h3>Pollutants</h3>
            <dl className="air-quality-pollutants">
              <div>
                <dt>PM2.5</dt>
                <dd>{formatPollutant(airQuality.pollutants.pm25)}</dd>
              </div>
              <div>
                <dt>PM10</dt>
                <dd>{formatPollutant(airQuality.pollutants.pm10)}</dd>
              </div>
              <div>
                <dt>NO₂</dt>
                <dd>{formatPollutant(airQuality.pollutants.nitrogenDioxide)}</dd>
              </div>
              <div>
                <dt>O₃</dt>
                <dd>{formatPollutant(airQuality.pollutants.ozone)}</dd>
              </div>
              <div>
                <dt>SO₂</dt>
                <dd>{formatPollutant(airQuality.pollutants.sulphurDioxide)}</dd>
              </div>
              <div>
                <dt>CO</dt>
                <dd>{formatPollutant(airQuality.pollutants.carbonMonoxide)}</dd>
              </div>
            </dl>
            <p className="air-quality-attribution">
              Model estimate (not a ground-station reading) from{' '}
              <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
                Open-Meteo Air Quality API
              </a>{' '}
              using{' '}
              <a href="https://atmosphere.copernicus.eu/" target="_blank" rel="noreferrer">
                CAMS ENSEMBLE
              </a>{' '}
              data, under{' '}
              <a
                href="https://creativecommons.org/licenses/by/4.0/"
                target="_blank"
                rel="noreferrer"
              >
                CC BY 4.0
              </a>
              . Model resolution is regional (approximately 11–45 km).
            </p>
          </>
        ) : null}
      </section>
    </details>
  );
}
