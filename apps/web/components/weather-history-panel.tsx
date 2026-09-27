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
import { History, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase-browser';

type HistoryDays = 7 | 30 | 90;

type WeatherHistoryPanelProps = {
  gatewayOrigin: string;
  location: Location;
  current: CurrentWeather;
  provider: string;
  stale: boolean;
  units: UnitSystem;
};

const historyWindows: HistoryDays[] = [7, 30, 90];

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

function historyChartPoints(snapshots: WeatherSnapshot[], units: UnitSystem) {
  const ordered = [...snapshots].reverse();
  const values = ordered.map(({ payload }) =>
    units === 'imperial' ? (payload.temperature_c * 9) / 5 + 32 : payload.temperature_c,
  );
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = Math.max(1, maximum - minimum);
  return ordered.map((snapshot, index) => ({
    snapshot,
    x: ordered.length === 1 ? 150 : 10 + (index / (ordered.length - 1)) * 280,
    y: 100 - 10 - ((values[index]! - minimum) / span) * 80,
  }));
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
    headers: { Authorization: `Bearer ${accessToken}` },
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
  const [days, setDays] = useState<HistoryDays>(30);
  const [snapshots, setSnapshots] = useState<WeatherSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

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
      const nextSnapshots = await fetchHistory(gatewayOrigin, accessToken, location, days);
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
  }, [accessToken, days, gatewayOrigin, location]);

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
      setMessage(
        loaded
          ? `${formatObservedTime(parsed.data.snapshot.observed_at, location.timezone)} recorded.`
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
        { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
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

  const alreadyRecorded = snapshots.some((snapshot) => snapshot.observed_at === current.observedAt);
  const points = historyChartPoints(snapshots, units);
  const chartDescription = snapshots
    .slice()
    .reverse()
    .map(
      (snapshot) =>
        `${formatObservedTime(snapshot.observed_at, location.timezone)} ${temperature(snapshot.payload.temperature_c, units)} degrees`,
    )
    .join(', ');

  return (
    <details className="weather-history-panel">
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
              {historyWindows.map((windowDays) => (
                <button
                  key={windowDays}
                  type="button"
                  aria-pressed={days === windowDays}
                  onClick={() => setDays(windowDays)}
                >
                  {windowDays}d
                </button>
              ))}
            </div>
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
            {!loading && snapshots.length > 0 ? (
              <>
                <svg
                  className="weather-history-chart"
                  viewBox="0 0 300 100"
                  role="img"
                  aria-describedby="weather-history-chart-description"
                  aria-label={`Temperature across ${snapshots.length} recorded observations`}
                >
                  <polyline
                    points={points.map(({ x, y }) => `${x},${y}`).join(' ')}
                    fill="none"
                    stroke="#cde8ed"
                    strokeWidth="3"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {points.map(({ snapshot, x, y }) => (
                    <circle
                      key={snapshot.id}
                      cx={x}
                      cy={y}
                      r="4"
                      fill="#cde8ed"
                      stroke="#282c33"
                      strokeWidth="2"
                    />
                  ))}
                </svg>
                <p className="sr-only" id="weather-history-chart-description">
                  {chartDescription}
                </p>
                <ol className="weather-history-observations" aria-label="Recorded observations">
                  {snapshots.map((snapshot) => {
                    const observedTime = formatObservedTime(
                      snapshot.observed_at,
                      location.timezone,
                    );
                    return (
                      <li key={snapshot.id}>
                        <time dateTime={snapshot.observed_at}>{observedTime}</time>
                        <strong>{temperature(snapshot.payload.temperature_c, units)} deg</strong>
                        <span>{snapshot.payload.condition.replace('-', ' ')}</span>
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
            {!loading && snapshots.length === 0 ? (
              <p className="weather-history-empty">No observations recorded in this range yet.</p>
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
