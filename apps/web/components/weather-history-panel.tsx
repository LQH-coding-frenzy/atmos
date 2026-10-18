'use client';

import {
  createWeatherSnapshotRequestSchema,
  weatherSnapshotResponseSchema,
  weatherSnapshotsResponseSchema,
  type CurrentWeather,
  type Location,
  type UnitSystem,
  type WeatherSnapshot,
} from '@atmos/contracts';
import { formatTemperature } from '@atmos/domain';
import type { Session } from '@supabase/supabase-js';
import { Download, History, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase-browser';
import { versionAffinityHeaders } from '../lib/version-affinity';
import { weatherHistoryToCsv } from '../lib/weather-history-export';
import {
  analyzeRecordedWeatherAnomalies,
  aggregateWeatherHistory,
  convertHistoryMetricValue,
  createWeatherHistoryChartPoints,
  customHistoryRangeIsValid,
  dateInTimeZone,
  formatWeatherHistoryMetric,
  formatWeatherHistoryDifference,
  historyApiDays,
  recordedConditionCounts,
  selectRecordedHistory,
  shiftIsoDate,
  weatherHistoryMetricValue,
  weatherHistoryMetrics,
  type CustomHistoryRange,
  type WeatherHistoryMetric,
  type WeatherHistoryRange,
} from '../lib/weather-history-analytics';

type HistoryDays = 7 | 30 | 90;

type WeatherHistoryPanelProps = {
  gatewayOrigin: string;
  location: Location;
  current: CurrentWeather;
  provider: string;
  stale: boolean;
  units: UnitSystem;
};

const historyWindows: Array<{ value: WeatherHistoryRange; label: string }> = [
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'custom', label: 'Custom dates' },
];

function formatObservedTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(value));
}

function temperature(value: number, units: UnitSystem): string {
  return formatTemperature(value, units).replace(' deg', '');
}

async function fetchHistory(
  gatewayOrigin: string,
  accessToken: string,
  location: Location,
  days: HistoryDays,
): Promise<WeatherSnapshot[]> {
  const url = new URL('/api/v1/weather/history', gatewayOrigin);
  url.search = new URLSearchParams({
    lat: String(location.latitude),
    lon: String(location.longitude),
    days: String(days),
  }).toString();
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      ...versionAffinityHeaders(),
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const parsed = weatherSnapshotsResponseSchema.safeParse(
    await response.json().catch(() => undefined),
  );
  if (!response.ok || !parsed.success) throw new Error('Weather history is unavailable');
  return parsed.data.snapshots;
}

export function WeatherHistoryPanel({
  gatewayOrigin,
  location,
  current,
  provider,
  stale,
  units,
}: WeatherHistoryPanelProps) {
  const client = useMemo(() => getSupabaseBrowserClient(), []);
  const requestGeneration = useRef(0);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [range, setRange] = useState<WeatherHistoryRange>('30d');
  const [customDateDraft, setCustomDateDraft] = useState<CustomHistoryRange>(() => {
    const today = dateInTimeZone(new Date(), location.timezone);
    return { start: shiftIsoDate(today, -6), end: today };
  });
  const [appliedCustomRange, setAppliedCustomRange] = useState<CustomHistoryRange>(customDateDraft);
  const [metric, setMetric] = useState<WeatherHistoryMetric>('temperature');
  const [snapshots, setSnapshots] = useState<WeatherSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const id = useId();
  const today = dateInTimeZone(new Date(), location.timezone);
  const firstAllowedDate = shiftIsoDate(today, -89);
  const apiDays = historyApiDays(range, appliedCustomRange, today);
  const customDateDraftIsValid = customHistoryRangeIsValid(customDateDraft, today);

  useEffect(() => {
    if (!client) {
      setAuthReady(true);
      return;
    }
    let active = true;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession);
        setAuthReady(true);
      }
    });
    void client.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
        setAuthReady(true);
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [client]);

  const accessToken = session?.access_token;
  const refreshHistory = useCallback(async () => {
    if (!accessToken) return false;
    const generation = ++requestGeneration.current;
    setLoading(true);
    try {
      const nextSnapshots = await fetchHistory(gatewayOrigin, accessToken, location, apiDays);
      if (generation !== requestGeneration.current) return false;
      setSnapshots(nextSnapshots);
      setMessage('');
      return true;
    } catch {
      if (generation !== requestGeneration.current) return false;
      setSnapshots([]);
      setMessage('Weather history is unavailable right now. Please try again.');
      return false;
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [accessToken, apiDays, gatewayOrigin, location]);

  useEffect(() => {
    requestGeneration.current += 1;
    if (accessToken) {
      void refreshHistory();
    } else {
      setSnapshots([]);
      setLoading(false);
    }
    return () => {
      requestGeneration.current += 1;
    };
  }, [accessToken, refreshHistory]);

  const visibleSnapshots = selectRecordedHistory(
    snapshots,
    range,
    Date.now(),
    location.timezone,
    appliedCustomRange,
  );
  const chart = createWeatherHistoryChartPoints(visibleSnapshots, metric, units);
  const statistics = aggregateWeatherHistory(visibleSnapshots, metric, units);
  const conditionCounts = recordedConditionCounts(visibleSnapshots);
  const chartDescription = visibleSnapshots
    .slice()
    .sort((left, right) => left.observed_at.localeCompare(right.observed_at))
    .map(
      (snapshot) =>
        `${formatObservedTime(snapshot.observed_at, location.timezone)} ${formatWeatherHistoryMetric(
          weatherHistoryMetricValue(snapshot, metric, units),
          metric,
          units,
        )}`,
    )
    .join(', ');

  function applyCustomRange() {
    if (!customDateDraftIsValid) {
      setMessage('Choose a valid date range within the most recent 90 days.');
      return;
    }
    setAppliedCustomRange(customDateDraft);
    setRange('custom');
    setMessage('');
  }

  async function recordObservation() {
    if (!client || !accessToken || provider !== 'open-meteo' || stale) return;
    const request = createWeatherSnapshotRequestSchema.safeParse({
      latitude: location.latitude,
      longitude: location.longitude,
      observed_at: current.observedAt,
      location_name: location.name,
      temperatureC: current.temperatureC,
      apparentTemperatureC: current.apparentTemperatureC,
      humidityPercent: current.humidityPercent,
      windSpeedKph: current.windSpeedKph,
      pressureHpa: current.pressureHpa,
      condition: current.condition,
    });
    if (!request.success) {
      setMessage('This observation could not be recorded.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(new URL('/api/v1/weather/history', gatewayOrigin), {
        method: 'POST',
        headers: {
          ...versionAffinityHeaders(),
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request.data),
      });
      if (response.status === 409) {
        await refreshHistory();
        setMessage('This observation is already in your history.');
        return;
      }
      const parsed = weatherSnapshotResponseSchema.safeParse(
        await response.json().catch(() => undefined),
      );
      if (!response.ok || !parsed.success) throw new Error('Snapshot rejected');
      const loaded = await refreshHistory();
      const visibleAfterRecording =
        selectRecordedHistory(
          [parsed.data.snapshot],
          range,
          Date.now(),
          location.timezone,
          appliedCustomRange,
        ).length > 0;
      setMessage(
        loaded
          ? visibleAfterRecording
            ? `${formatObservedTime(parsed.data.snapshot.observed_at, location.timezone)} recorded.`
            : `${formatObservedTime(parsed.data.snapshot.observed_at, location.timezone)} recorded outside the selected range.`
          : 'Observation recorded, but the history list could not be refreshed.',
      );
    } catch {
      setMessage('This observation could not be recorded. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteObservation(snapshotId: string) {
    if (!accessToken) return;
    setDeletingId(snapshotId);
    setMessage('');
    try {
      const response = await fetch(
        new URL(`/api/v1/weather/history/${snapshotId}`, gatewayOrigin),
        {
          method: 'DELETE',
          headers: {
            ...versionAffinityHeaders(),
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      if (response.status === 404) {
        await refreshHistory();
        setMessage('This observation is already gone.');
        return;
      }
      if (!response.ok) throw new Error('Delete failed');
      const loaded = await refreshHistory();
      setMessage(
        loaded ? 'Observation deleted.' : 'Observation deleted; history could not be refreshed.',
      );
    } catch {
      setMessage('This observation could not be deleted. Please try again.');
    } finally {
      setDeletingId(null);
    }
  }

  function exportHistory() {
    if (visibleSnapshots.length === 0) return;
    const safeLocationName = location.name
      .toLocaleLowerCase('en-US')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const blob = new Blob(['\uFEFF', weatherHistoryToCsv(visibleSnapshots)], {
      type: 'text/csv;charset=utf-8',
    });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    const rangeName =
      range === 'custom' ? `${appliedCustomRange.start}-to-${appliedCustomRange.end}` : range;
    link.download = `atmos-history-${safeLocationName || 'location'}-${rangeName}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1_000);
    setMessage(`Downloaded ${visibleSnapshots.length} recorded observations as CSV.`);
  }

  const alreadyRecorded = snapshots.some((snapshot) => snapshot.observed_at === current.observedAt);

  return (
    <details className="weather-history-panel" name="dashboard-tools">
      <summary>
        <History size={17} aria-hidden="true" />
        <span>History</span>
      </summary>
      <section className="weather-history-popover" aria-label="Weather history">
        <h2>Weather history</h2>
        {!authReady ? <p role="status">Checking account…</p> : null}
        {authReady && !client ? (
          <p role="status">Account access is unavailable. Public weather still works.</p>
        ) : null}
        {authReady && client && !session ? (
          <p>Sign in from Saved places to record and view your personal weather history.</p>
        ) : null}
        {session ? (
          <>
            <p className="weather-history-location">{location.name}</p>
            <div className="history-window-tabs" role="group" aria-label="History range">
              {historyWindows.map((window) => (
                <button
                  key={window.value}
                  type="button"
                  aria-pressed={range === window.value}
                  onClick={() => setRange(window.value)}
                >
                  {window.label}
                </button>
              ))}
            </div>
            {range === 'custom' ? (
              <fieldset className="history-custom-range">
                <legend>Dates in {location.timezone}</legend>
                <div>
                  <label htmlFor={`${id}-history-start`}>From date</label>
                  <input
                    id={`${id}-history-start`}
                    type="date"
                    min={firstAllowedDate}
                    max={today}
                    value={customDateDraft.start}
                    onChange={(event) =>
                      setCustomDateDraft((draft) => ({ ...draft, start: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <label htmlFor={`${id}-history-end`}>To date</label>
                  <input
                    id={`${id}-history-end`}
                    type="date"
                    min={firstAllowedDate}
                    max={today}
                    value={customDateDraft.end}
                    onChange={(event) =>
                      setCustomDateDraft((draft) => ({ ...draft, end: event.target.value }))
                    }
                  />
                </div>
                <button
                  type="button"
                  className="history-apply-range"
                  disabled={!customDateDraftIsValid || loading}
                  onClick={applyCustomRange}
                >
                  Apply dates
                </button>
                <p>Custom ranges are limited to the latest 90 days of recorded snapshots.</p>
                {!customDateDraftIsValid ? (
                  <p role="status">
                    Choose a valid range of up to 90 days, ending today or earlier.
                  </p>
                ) : null}
              </fieldset>
            ) : null}
            <button
              className="record-observation-button"
              type="button"
              disabled={saving || loading || stale || provider !== 'open-meteo' || alreadyRecorded}
              onClick={() => void recordObservation()}
            >
              {saving
                ? 'Recording…'
                : alreadyRecorded
                  ? 'Observation recorded'
                  : stale
                    ? 'Live data unavailable'
                    : 'Record this observation'}
            </button>
            <p className="weather-history-hint">
              History contains observations you choose to record; earlier weather is not backfilled.
            </p>
            {loading ? <p role="status">Loading your observations…</p> : null}
            {snapshots.length >= 100 ? (
              <p className="weather-history-cap" role="status">
                The history endpoint returned its 100 most recent matching snapshots; older records
                may not be included.
              </p>
            ) : null}
            {!loading && visibleSnapshots.length > 0 ? (
              <>
                <label className="history-metric-picker" htmlFor={`${id}-history-metric`}>
                  <span>Chart metric</span>
                  <select
                    id={`${id}-history-metric`}
                    aria-label="History metric"
                    value={metric}
                    onChange={(event) => setMetric(event.target.value as WeatherHistoryMetric)}
                  >
                    {weatherHistoryMetrics.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                {statistics ? (
                  <dl className="weather-history-summary" aria-label="Recorded value aggregates">
                    <div>
                      <dt>Samples</dt>
                      <dd>{statistics.count}</dd>
                    </div>
                    <div>
                      <dt>Minimum</dt>
                      <dd>{formatWeatherHistoryMetric(statistics.minimum, metric, units)}</dd>
                    </div>
                    <div>
                      <dt>Average</dt>
                      <dd>{formatWeatherHistoryMetric(statistics.average, metric, units)}</dd>
                    </div>
                    <div>
                      <dt>Maximum</dt>
                      <dd>{formatWeatherHistoryMetric(statistics.maximum, metric, units)}</dd>
                    </div>
                  </dl>
                ) : null}
                <svg
                  className="weather-history-chart"
                  viewBox="0 0 300 100"
                  role="img"
                  aria-describedby="weather-history-chart-description"
                  aria-label={`${weatherHistoryMetrics.find((item) => item.value === metric)?.label} across ${visibleSnapshots.length} recorded observations`}
                >
                  <desc>
                    Each dot is one recorded observation. No values are interpolated between
                    snapshots. {chart.points.length} values are shown in {chart.unit}.
                  </desc>
                  {[20, 50, 80].map((y) => (
                    <line
                      className="weather-history-gridline"
                      key={y}
                      x1="10"
                      x2="290"
                      y1={y}
                      y2={y}
                    />
                  ))}
                  {chart.points.map(({ snapshot, x, y, value }) => (
                    <circle
                      key={snapshot.id}
                      cx={x}
                      cy={y}
                      r="4"
                      fill="var(--accent)"
                      stroke="var(--raised)"
                      strokeWidth="2"
                    >
                      <title>
                        {formatObservedTime(snapshot.observed_at, location.timezone)} ·{' '}
                        {formatWeatherHistoryMetric(value, metric, units)}
                      </title>
                    </circle>
                  ))}
                </svg>
                <p className="weather-history-chart-note">
                  Discrete user-recorded points; gaps are unknown, not filled in.
                </p>
                <p className="sr-only" id="weather-history-chart-description">
                  {chartDescription}
                </p>
                <section
                  className="weather-history-condition-counts"
                  aria-label="Recorded condition counts"
                >
                  <div>
                    <h3>Recorded conditions</h3>
                    <p>Snapshot counts, not event durations.</p>
                  </div>
                  <ul>
                    {conditionCounts.map(({ condition, count }) => (
                      <li key={condition}>
                        <span>{condition.replace('-', ' ')}</span>
                        <strong>{count}</strong>
                      </li>
                    ))}
                  </ul>
                </section>
                <button
                  className="export-weather-history"
                  type="button"
                  onClick={exportHistory}
                  disabled={loading}
                >
                  <Download size={15} aria-hidden="true" /> Export CSV
                </button>
                <ol className="weather-history-observations" aria-label="Recorded observations">
                  {visibleSnapshots.map((snapshot) => {
                    const observedTime = formatObservedTime(
                      snapshot.observed_at,
                      location.timezone,
                    );
                    return (
                      <li key={snapshot.id}>
                        <time dateTime={snapshot.observed_at}>{observedTime}</time>
                        <strong>{temperature(snapshot.payload.temperature_c, units)}°</strong>
                        <span>{snapshot.payload.condition.replace('-', ' ')}</span>
                        <small>
                          {weatherHistoryMetrics.find((item) => item.value === metric)?.label}:{' '}
                          {formatWeatherHistoryMetric(
                            weatherHistoryMetricValue(snapshot, metric, units),
                            metric,
                            units,
                          )}
                        </small>
                        <button
                          type="button"
                          className="delete-weather-observation"
                          aria-label={`Delete observation from ${observedTime}`}
                          disabled={loading || saving || deletingId !== null}
                          onClick={() => void deleteObservation(snapshot.id)}
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </>
            ) : null}
            {!loading && visibleSnapshots.length === 0 ? (
              <p className="weather-history-empty">
                No user-recorded observations in this range. Earlier weather is not backfilled.
              </p>
            ) : null}
            {!loading ? (
              <WeatherHistoryAnomalyInsights
                snapshots={visibleSnapshots}
                current={current}
                location={location}
                stale={stale}
                units={units}
              />
            ) : null}
          </>
        ) : null}
        {message ? (
          <p className="weather-history-status" role="status" aria-live="polite">
            {message}
          </p>
        ) : null}
      </section>
    </details>
  );
}

function WeatherHistoryAnomalyInsights({
  snapshots,
  current,
  location,
  stale,
  units,
}: {
  snapshots: WeatherSnapshot[];
  current: CurrentWeather;
  location: Location;
  stale: boolean;
  units: UnitSystem;
}) {
  const analysis = analyzeRecordedWeatherAnomalies(snapshots, current, location.timezone);
  return (
    <section className="weather-history-anomalies" aria-label="Recorded baseline anomaly insights">
      <h3>Current weather vs your recorded baseline</h3>
      <p>
        Deterministic deviations from your own recorded observations; not a forecast alert or safety
        advice.
      </p>
      {stale ? (
        <p role="status">Current weather is stale. Anomaly comparisons are paused.</p>
      ) : !analysis.eligible ? (
        <p role="status">
          Need at least {analysis.requiredSamples} recorded observations across{' '}
          {analysis.requiredDates} location-local dates. Current coverage: {analysis.sampleCount}{' '}
          observations across {analysis.distinctDates} dates.
        </p>
      ) : (
        <>
          <p className="weather-history-anomaly-baseline">
            Baseline: mean of {analysis.sampleCount} recorded observations across{' '}
            {analysis.distinctDates} local dates. Numeric anomalies require a deviation of at least
            two standard deviations and the metric's minimum threshold.
          </p>
          {analysis.anomalies.length === 0 && analysis.unusualConditions.length === 0 ? (
            <p role="status">
              No supported reading exceeds its threshold. Unrecorded times and unsupported metrics
              remain unknown.
            </p>
          ) : null}
          {analysis.anomalies.length > 0 ? (
            <ul className="weather-history-anomaly-list" aria-label="Recorded baseline anomalies">
              {analysis.anomalies.map((anomaly) => {
                const currentValue = convertHistoryMetricValue(
                  anomaly.currentValue,
                  anomaly.metric,
                  units,
                );
                const baselineValue = convertHistoryMetricValue(
                  anomaly.baselineAverage,
                  anomaly.metric,
                  units,
                );
                return (
                  <li key={anomaly.metric}>
                    <strong>
                      {
                        weatherHistoryMetrics.find((metric) => metric.value === anomaly.metric)
                          ?.label
                      }
                    </strong>
                    <span>
                      Current {formatWeatherHistoryMetric(currentValue, anomaly.metric, units)};
                      recorded average{' '}
                      {formatWeatherHistoryMetric(baselineValue, anomaly.metric, units)}.
                    </span>
                    <small>
                      {anomaly.direction === 'above' ? 'Above' : 'Below'} baseline by{' '}
                      {formatWeatherHistoryDifference(
                        Math.abs(anomaly.deviation),
                        anomaly.metric,
                        units,
                      )}{' '}
                      (threshold{' '}
                      {formatWeatherHistoryDifference(anomaly.threshold, anomaly.metric, units)}; n=
                      {anomaly.sampleCount}).
                    </small>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {analysis.unusualConditions.length > 0 ? (
            <ul className="weather-history-anomaly-list" aria-label="Unusual recorded conditions">
              {analysis.unusualConditions.map((item) => (
                <li key={item.condition}>
                  <strong>Unusual {item.condition.replace('-', ' ')} condition</strong>
                  <span>
                    Current condition appeared in {item.observedCount} of {item.sampleCount}{' '}
                    recorded condition snapshots. This is not a rainfall amount or event duration.
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
      <p className="weather-history-anomaly-unsupported">
        Rainfall amount, AQI and UV baselines are unavailable because those values are not stored in
        recorded snapshots; no provider history is substituted.
      </p>
    </section>
  );
}
