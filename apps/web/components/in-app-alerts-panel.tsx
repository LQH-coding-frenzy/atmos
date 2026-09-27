'use client';

import {
  alertRuleResponseSchema,
  alertRulesResponseSchema,
  createAlertRuleRequestSchema,
  updateAlertRuleRequestSchema,
  type AlertRuleRecord,
  type CurrentWeather,
  type HourlyForecast,
  type Location,
} from '@atmos/contracts';
import type { AlertCondition, AlertRule } from '@atmos/domain';
import { evaluateInAppAlertStatus } from '@atmos/domain';
import type { Session } from '@supabase/supabase-js';
import { BellRing, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase-browser';

type InAppAlertMetric = 'temperature' | 'rain-probability' | 'wind' | 'thunderstorm';
type Comparison = 'above' | 'below';

type InAppAlertsPanelProps = {
  gatewayOrigin: string;
  location: Location;
  current: CurrentWeather;
  hourly: readonly HourlyForecast[];
  stale: boolean;
};

const alertMetrics: InAppAlertMetric[] = [
  'temperature',
  'rain-probability',
  'wind',
  'thunderstorm',
];

const metricLabels: Record<InAppAlertMetric, string> = {
  temperature: 'Temperature (°C)',
  'rain-probability': 'Rain chance (%)',
  wind: 'Wind speed (km/h)',
  thunderstorm: 'Thunderstorm forecast',
};

function toDomainAlertRule(record: AlertRuleRecord): AlertRule {
  return {
    id: record.id,
    locationId: record.location_id,
    conditions: record.conditions as AlertCondition[],
    schedule: {
      weekdays: record.schedule.weekdays,
      cooldownMinutes: record.schedule.cooldownMinutes,
      ...(record.schedule.startsAt ? { startsAt: record.schedule.startsAt } : {}),
      ...(record.schedule.endsAt ? { endsAt: record.schedule.endsAt } : {}),
    },
    notificationChannels: record.notification_channels,
    enabled: record.enabled,
  };
}

function conditionLabel(condition: AlertCondition): string {
  if ('expected' in condition) {
    return condition.metric === 'thunderstorm'
      ? 'Thunderstorm forecast'
      : `${condition.metric.replaceAll('-', ' ')} occurrence`;
  }
  const labels: Record<string, string> = {
    temperature: 'Temperature',
    'feels-like': 'Feels-like temperature',
    'rain-probability': 'Rain chance',
    rainfall: 'Rainfall',
    snowfall: 'Snowfall',
    wind: 'Wind speed',
    gust: 'Wind gust',
    uv: 'UV index',
    aqi: 'AQI',
    'pm2.5': 'PM2.5',
    visibility: 'Visibility',
  };
  const metric = labels[condition.metric] ?? condition.metric;
  const value = (() => {
    switch (condition.metric) {
      case 'temperature':
      case 'feels-like':
        return `${condition.value}°C`;
      case 'wind':
      case 'gust':
        return `${condition.value} km/h`;
      case 'rain-probability':
        return `${condition.value}%`;
      case 'rainfall':
      case 'snowfall':
        return `${condition.value} mm`;
      case 'uv':
        return String(condition.value);
      case 'aqi':
        return `${condition.value} AQI`;
      case 'pm2.5':
        return `${condition.value} µg/m³`;
      case 'visibility':
        return `${condition.value} km`;
    }
  })();
  return `${metric} ${condition.comparison} ${value}`;
}

function statusLabel(status: ReturnType<typeof evaluateInAppAlertStatus>): string {
  if (status === 'disabled') return 'Paused';
  if (status === 'outside-schedule') return 'Not scheduled today';
  if (status === 'unsupported') return 'Unsupported condition';
  if (status === 'triggered') return 'Matches current forecast';
  return 'Monitoring current forecast';
}

async function fetchAlertRules(
  gatewayOrigin: string,
  accessToken: string,
  location: Location,
): Promise<AlertRuleRecord[]> {
  const url = new URL('/api/v1/alerts', gatewayOrigin);
  url.search = new URLSearchParams({
    lat: String(location.latitude),
    lon: String(location.longitude),
  }).toString();
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const parsed = alertRulesResponseSchema.safeParse(await response.json().catch(() => undefined));
  if (!response.ok || !parsed.success) throw new Error('Alert rules are unavailable');
  return parsed.data.rules;
}

export function InAppAlertsPanel({
  gatewayOrigin,
  location,
  current,
  hourly,
  stale,
}: InAppAlertsPanelProps) {
  const client = useMemo(() => getSupabaseBrowserClient(), []);
  const requestGeneration = useRef(0);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [metric, setMetric] = useState<InAppAlertMetric>('temperature');
  const [comparison, setComparison] = useState<Comparison>('above');
  const [threshold, setThreshold] = useState('30');
  const [rules, setRules] = useState<AlertRuleRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyRuleId, setBusyRuleId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
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
  const refreshRules = useCallback(async () => {
    if (!accessToken) return false;
    const generation = ++requestGeneration.current;
    setLoading(true);
    try {
      const nextRules = await fetchAlertRules(gatewayOrigin, accessToken, location);
      if (generation !== requestGeneration.current) return false;
      setRules(nextRules);
      setMessage('');
      return true;
    } catch {
      if (generation !== requestGeneration.current) return false;
      setRules([]);
      setMessage('Alert rules are unavailable right now. Please try again.');
      return false;
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [accessToken, gatewayOrigin, location]);

  useEffect(() => {
    requestGeneration.current += 1;
    if (expanded && accessToken) {
      void refreshRules();
    } else if (!accessToken) {
      setRules([]);
      setLoading(false);
    }
    return () => {
      requestGeneration.current += 1;
    };
  }, [accessToken, expanded, refreshRules]);

  function createCondition(): AlertCondition | undefined {
    if (metric === 'thunderstorm') return { metric, expected: true };
    const value = Number(threshold);
    if (!Number.isFinite(value)) return undefined;
    return { metric, comparison, value };
  }

  async function createRule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    const condition = createCondition();
    const request = createAlertRuleRequestSchema.safeParse({
      location_id: location.id,
      latitude: location.latitude,
      longitude: location.longitude,
      condition,
    });
    if (!request.success) {
      setMessage('Choose a valid threshold for this alert.');
      return;
    }
    setCreating(true);
    setMessage('');
    try {
      const response = await fetch(new URL('/api/v1/alerts', gatewayOrigin), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request.data),
      });
      const parsed = alertRuleResponseSchema.safeParse(
        await response.json().catch(() => undefined),
      );
      if (!response.ok || !parsed.success) throw new Error('Alert rule rejected');
      const loaded = await refreshRules();
      setMessage(
        loaded ? 'In-app alert rule created.' : 'Rule created, but the list could not refresh.',
      );
    } catch {
      setMessage('This alert rule could not be created. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  async function updateRule(rule: AlertRuleRecord, enabled: boolean) {
    if (!accessToken) return;
    setBusyRuleId(rule.id);
    setMessage('');
    try {
      const body = updateAlertRuleRequestSchema.parse({ enabled });
      const response = await fetch(new URL(`/api/v1/alerts/${rule.id}`, gatewayOrigin), {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const parsed = alertRuleResponseSchema.safeParse(
        await response.json().catch(() => undefined),
      );
      if (!response.ok || !parsed.success) throw new Error('Alert rule update failed');
      await refreshRules();
      setMessage(enabled ? 'Alert rule enabled.' : 'Alert rule paused.');
    } catch {
      setMessage('This alert rule could not be updated. Please try again.');
    } finally {
      setBusyRuleId(null);
    }
  }

  async function deleteRule(rule: AlertRuleRecord) {
    if (!accessToken) return;
    setBusyRuleId(rule.id);
    setMessage('');
    try {
      const response = await fetch(new URL(`/api/v1/alerts/${rule.id}`, gatewayOrigin), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error('Alert rule delete failed');
      await refreshRules();
      setMessage('Alert rule deleted.');
    } catch {
      setMessage('This alert rule could not be deleted. Please try again.');
    } finally {
      setBusyRuleId(null);
    }
  }

  const maximumThreshold =
    metric === 'rain-probability'
      ? 100
      : metric === 'wind'
        ? 500
        : metric === 'temperature'
          ? 100
          : 0;
  const minimumThreshold = metric === 'temperature' ? -150 : 0;

  return (
    <details
      className="in-app-alerts-panel"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>
        <BellRing size={17} aria-hidden="true" />
        <span>Alerts</span>
      </summary>
      <section className="in-app-alerts-popover" aria-label="In-app weather alerts">
        <h2>In-app alerts</h2>
        <p className="in-app-alerts-location">{location.name}</p>
        {!authReady ? <p role="status">Checking account…</p> : null}
        {authReady && !client ? (
          <p role="status">Account access is unavailable. Public weather still works.</p>
        ) : null}
        {authReady && client && !session ? (
          <p>Sign in from Saved places to create and view your alert rules.</p>
        ) : null}
        {session ? (
          <>
            <p className="in-app-alerts-note">
              Rules use thresholds in °C, km/h, or percent; status compares the current dashboard
              snapshot and forecast when loaded or changed. No scheduled, email, push, or background
              delivery occurs.
            </p>
            {stale ? (
              <p className="in-app-alerts-stale" role="status">
                Weather data is cached; alert status may be out of date.
              </p>
            ) : null}
            <form className="in-app-alert-form" onSubmit={createRule}>
              <label htmlFor="alert-metric">Condition</label>
              <select
                id="alert-metric"
                value={metric}
                onChange={(event) => setMetric(event.target.value as InAppAlertMetric)}
              >
                {alertMetrics.map((option) => (
                  <option key={option} value={option}>
                    {metricLabels[option]}
                  </option>
                ))}
              </select>
              {metric !== 'thunderstorm' ? (
                <div className="in-app-alert-threshold">
                  <label htmlFor="alert-comparison">Comparison</label>
                  <select
                    id="alert-comparison"
                    value={comparison}
                    onChange={(event) => setComparison(event.target.value as Comparison)}
                  >
                    <option value="above">Above</option>
                    <option value="below">Below</option>
                  </select>
                  <label htmlFor="alert-threshold">Threshold</label>
                  <input
                    id="alert-threshold"
                    type="number"
                    min={minimumThreshold}
                    max={maximumThreshold}
                    step="any"
                    value={threshold}
                    onChange={(event) => setThreshold(event.target.value)}
                    required
                  />
                </div>
              ) : null}
              <button type="submit" disabled={creating}>
                {creating ? 'Creating…' : 'Add in-app rule'}
              </button>
            </form>
            {loading ? <p role="status">Loading alert rules…</p> : null}
            {rules.length > 0 ? (
              <ul className="in-app-alert-rules" aria-label="Your alert rules">
                {rules.map((record) => {
                  const rule = toDomainAlertRule(record);
                  const status = evaluateInAppAlertStatus(rule, {
                    current,
                    hourly,
                    timezone: location.timezone,
                  });
                  const displayStatus = stale && record.enabled ? 'stale' : status;
                  return (
                    <li key={record.id}>
                      <strong>{conditionLabel(record.conditions[0]!)}</strong>
                      <span className={`in-app-alert-status alert-${displayStatus}`}>
                        {displayStatus === 'stale' ? 'Weather data stale' : statusLabel(status)}
                      </span>
                      <div className="in-app-alert-actions">
                        <button
                          type="button"
                          disabled={busyRuleId !== null}
                          onClick={() => void updateRule(record, !record.enabled)}
                        >
                          {record.enabled ? 'Pause' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          className="delete-alert-rule"
                          aria-label={`Delete alert ${conditionLabel(record.conditions[0]!)}`}
                          disabled={busyRuleId !== null}
                          onClick={() => void deleteRule(record)}
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {!loading && rules.length === 0 ? (
              <p className="in-app-alerts-empty">No in-app alert rules for this location.</p>
            ) : null}
          </>
        ) : null}
        {message ? (
          <p className="in-app-alerts-status" role="status" aria-live="polite">
            {message}
          </p>
        ) : null}
      </section>
    </details>
  );
}
