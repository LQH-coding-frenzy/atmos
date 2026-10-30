'use client';

import { airQualitySchema, type AirQuality, type Location } from '@atmos/contracts';
import { useEffect, useId, useState } from 'react';
import {
  airQualityMetrics,
  airQualityMetricValue,
  createAirQualityPlot,
  selectAirQualityHours,
  type AirQualityMetric,
  type AirQualityPeriod,
} from '../lib/air-quality-timeline';
import { fetchPublicAirQuality } from '../lib/public-weather-api';

export function AirQualityTimeline({ location, active }: { location: Location; active: boolean }) {
  const [data, setData] = useState<AirQuality | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed' | 'unsupported'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [period, setPeriod] = useState<AirQualityPeriod>('forecast');
  const [range, setRange] = useState<'24h' | 'full'>('24h');
  const [metric, setMetric] = useState<AirQualityMetric>('usAqi');
  const id = useId();
  useEffect(() => {
    if (!active) {
      setData(null);
      setStatus('loading');
      return;
    }
    const controller = new AbortController();
    setStatus('loading');
    setData(null);
    void fetchPublicAirQuality(
      { latitude: location.latitude, longitude: location.longitude, includeTimeline: true },
      { signal: controller.signal },
    )
      .then(async (response) => {
        const parsed = airQualitySchema.safeParse(await response.json().catch(() => undefined));
        if (!response.ok || !parsed.success) throw new Error('AQI timeline unavailable');
        if (controller.signal.aborted) return;
        setData(parsed.data);
        setStatus(parsed.data.timeline ? 'ready' : 'unsupported');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('failed');
      });
    return () => controller.abort();
  }, [active, location.latitude, location.longitude, attempt]);
  const hours = data ? selectAirQualityHours(data, period, range) : [];
  const selected = airQualityMetrics.find((item) => item.value === metric)!;
  const plot = createAirQualityPlot(hours, metric);
  const time = new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: location.timezone,
    timeZoneName: 'short',
  });
  const formatTime = (value: string) => time.format(new Date(value));
  const formatValue = (value: number | null) =>
    value === null
      ? 'Unavailable'
      : new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value);

  if (!active) return null;
  return (
    <section
      className="aqi-timeline"
      aria-labelledby={`${id}-title`}
      aria-busy={status === 'loading'}
    >
      <h3 id={`${id}-title`}>Air quality over time</h3>
      <p>
        Past model data and forecasts—not ground-station observations or your recorded weather
        history.
      </p>
      {status === 'loading' ? <p role="status">Loading AQI forecast and past model data…</p> : null}
      {status === 'failed' || status === 'unsupported' ? (
        <>
          <p role="status">
            {status === 'unsupported'
              ? 'Forecast/history is unavailable in this server response. Current air quality is still shown above.'
              : 'The AQI timeline could not be loaded. Current air quality is still shown above.'}
          </p>
          <button
            className="aqi-timeline-retry"
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry AQI timeline
          </button>
        </>
      ) : null}
      {data && status === 'ready' ? (
        <>
          {data.meta.stale ? (
            <p className="air-quality-stale" role="status">
              Cached model timeline: the provider is unavailable. These values have not been
              refreshed.
            </p>
          ) : null}
          <p className="aqi-model-time">
            Model reference: {formatTime(data.observedAt)}. Updated{' '}
            {formatTime(data.meta.updatedAt)}.
          </p>
          <div className="metric-tabs" role="group" aria-label="AQI timeline period">
            <button
              type="button"
              aria-pressed={period === 'forecast'}
              className={period === 'forecast' ? 'active' : ''}
              onClick={() => setPeriod('forecast')}
            >
              Forecast
            </button>
            <button
              type="button"
              aria-pressed={period === 'history'}
              className={period === 'history' ? 'active' : ''}
              onClick={() => setPeriod('history')}
            >
              Past model data
            </button>
          </div>
          <div className="aqi-timeline-selectors">
            <div>
              <label htmlFor={`${id}-metric`}>Measurement</label>
              <select
                id={`${id}-metric`}
                value={metric}
                onChange={(event) => setMetric(event.target.value as AirQualityMetric)}
              >
                {airQualityMetrics.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${id}-range`}>Range</label>
              <select
                id={`${id}-range`}
                value={range}
                onChange={(event) => setRange(event.target.value as '24h' | 'full')}
              >
                <option value="24h">
                  {period === 'history' ? 'Past 24 hours' : 'Next 24 hours'}
                </option>
                <option value="full">
                  {period === 'history' ? 'Past 7 days' : 'Up to 5 days'}
                </option>
              </select>
            </div>
          </div>
          {plot.available ? (
            <>
              <div className="aqi-chart-layout">
                <div className="aqi-chart-y-axis" aria-hidden="true">
                  {[1, 0.5, 0].map((fraction) => (
                    <span key={fraction}>
                      {new Intl.NumberFormat('en', {
                        notation: 'compact',
                        maximumFractionDigits: 1,
                      }).format(plot.maximum * fraction)}
                    </span>
                  ))}
                </div>
                <svg
                  className="aqi-timeline-chart"
                  viewBox="30 0 600 200"
                  preserveAspectRatio="none"
                  role="img"
                  aria-labelledby={`${id}-chart-title`}
                  aria-describedby={`${id}-chart-description`}
                >
                  <title id={`${id}-chart-title`}>
                    {selected.label} {period === 'history' ? 'past model' : 'forecast'} chart
                  </title>
                  <desc id={`${id}-chart-description`}>
                    {plot.available} available hourly values out of {hours.length}; gaps indicate
                    missing model data. Values are in {selected.unit}. Exact local timestamps and
                    values are in the expandable table below.
                  </desc>
                  {[0, 0.5, 1].map((fraction) => (
                    <g key={fraction}>
                      <line x1="40" x2="620" y1={170 - fraction * 140} y2={170 - fraction * 140} />
                    </g>
                  ))}
                  {plot.paths.map((path, index) => (
                    <path key={index} d={path} />
                  ))}
                  {plot.points
                    .filter((point) => point.y !== null)
                    .map((point) => (
                      <circle key={point.time} cx={point.x} cy={point.y!} r="3">
                        <title>
                          {formatTime(point.time)}: {formatValue(point.value)} {selected.unit}
                        </title>
                      </circle>
                    ))}
                </svg>
              </div>
              <div className="aqi-time-axis">
                {hours[0] ? (
                  <time dateTime={hours[0].time}>{formatTime(hours[0].time)}</time>
                ) : null}
                {hours.length > 1 ? (
                  <time dateTime={hours.at(-1)!.time}>{formatTime(hours.at(-1)!.time)}</time>
                ) : null}
              </div>
              <p className="aqi-timeline-summary">
                {selected.label}: low {formatValue(plot.minimum)}, high {formatValue(plot.peak)}{' '}
                {selected.unit}. {plot.available}/{hours.length} hourly values available.
              </p>
            </>
          ) : (
            <p role="status">
              No usable {selected.label} model values in this range. Try another measurement or
              range.
            </p>
          )}
          <p>
            Coverage can be shorter than requested and varies by model and location. All times use{' '}
            {location.timezone}. Missing values are not zero and are not interpolated.
          </p>
          {hours.length ? (
            <details className="aqi-values">
              <summary>Exact hourly values</summary>
              <div
                className="aqi-values-scroll"
                tabIndex={0}
                role="region"
                aria-label="Scrollable hourly model values"
              >
                <table>
                  <caption>
                    {selected.label} {period === 'history' ? 'past model data' : 'forecast'} ·{' '}
                    {location.timezone}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Local model time</th>
                      <th scope="col">
                        {selected.label} ({selected.unit})
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {hours.map((hour) => (
                      <tr key={hour.time}>
                        <th scope="row">
                          <time dateTime={hour.time}>{formatTime(hour.time)}</time>
                        </th>
                        <td>{formatValue(airQualityMetricValue(hour, metric))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
