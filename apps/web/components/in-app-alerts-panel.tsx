'use client';

import {
  airQualitySchema,
  alertRuleResponseSchema,
  alertRulesResponseSchema,
  createAlertRuleRequestSchema,
  severeWeatherResponseSchema,
  updateAlertRuleRequestSchema,
  type AirQuality,
  type AlertRuleRecord,
  type CurrentWeather,
  type HourlyForecast,
  type Location,
  type SevereWeatherResponse,
} from '@atmos/contracts';
import type {
  AlertCondition,
  AlertOccurrenceMetric,
  AlertRule,
  AlertThresholdMetric,
} from '@atmos/domain';
import {
  alertOccurrenceMetrics,
  alertThresholdMetrics,
  evaluateInAppAlertStatus,
} from '@atmos/domain';
import type { Session } from '@supabase/supabase-js';
import { BellRing, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase-browser';
import { versionAffinityHeaders } from '../lib/version-affinity';

type InAppAlertMetric = AlertThresholdMetric | AlertOccurrenceMetric;
type Comparison = 'above' | 'below';
type ScheduleWeekday =
  'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

type InAppAlertsPanelProps = {
  gatewayOrigin: string;
  location: Location;
  current: CurrentWeather;
  hourly: readonly HourlyForecast[];
  stale: boolean;
};

const alertMetrics: InAppAlertMetric[] = [...alertThresholdMetrics, ...alertOccurrenceMetrics];

const metricLabels: Record<InAppAlertMetric, string> = {
  temperature: 'Temperature (°C)',
  'feels-like': 'Feels-like temperature (°C)',
  'rain-probability': 'Rain chance (%)',
  rainfall: 'Rainfall (mm)',
  snowfall: 'Snowfall (mm)',
  wind: 'Wind speed (km/h)',
  gust: 'Wind gust (km/h)',
  uv: 'UV index',
  aqi: 'U.S. AQI',
  'pm2.5': 'PM2.5 (µg/m³)',
  visibility: 'Visibility (km)',
  thunderstorm: 'Thunderstorm forecast',
  'freeze-risk': 'Freeze risk',
  'extreme-heat': 'Extreme heat',
  'provider-severe-weather-alert': 'Official severe-weather alert',
};

const thresholdBounds: Record<AlertThresholdMetric, { minimum: number; maximum: number }> = {
  temperature: { minimum: -150, maximum: 100 },
  'feels-like': { minimum: -150, maximum: 100 },
  'rain-probability': { minimum: 0, maximum: 100 },
  rainfall: { minimum: 0, maximum: 1000 },
  snowfall: { minimum: 0, maximum: 1000 },
  wind: { minimum: 0, maximum: 500 },
  gust: { minimum: 0, maximum: 500 },
  uv: { minimum: 0, maximum: 30 },
  aqi: { minimum: 0, maximum: 1000 },
  'pm2.5': { minimum: 0, maximum: 10000 },
  visibility: { minimum: 0, maximum: 1000 },
};

const scheduleWeekdays: ScheduleWeekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

const weekdayLabels: Record<ScheduleWeekday, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

function localDateTimeToIso(value: string): string | null | undefined {
  if (!value) return undefined;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function scheduleSummary(schedule: AlertRuleRecord['schedule'], timezone: string) {
  const days =
    schedule.weekdays.length === scheduleWeekdays.length
      ? 'Every day'
      : schedule.weekdays.map((day) => weekdayLabels[day as ScheduleWeekday]).join(', ');
  const formatInstant = (value: string) =>
    new Intl.DateTimeFormat('en', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
    }).format(new Date(value));
  const window = [
    schedule.startsAt ? `from ${formatInstant(schedule.startsAt)}` : '',
    schedule.endsAt ? `until ${formatInstant(schedule.endsAt)}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return `${days}${window ? ` · ${window}` : ''} · cooldown ${schedule.cooldownMinutes} min`;
}

function isOccurrenceMetric(metric: InAppAlertMetric): metric is AlertOccurrenceMetric {
  return alertOccurrenceMetrics.includes(metric as AlertOccurrenceMetric);
}

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
    return metricLabels[condition.metric];
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
  if (status === 'outside-schedule') return 'Outside schedule';
  if (status === 'unsupported') return 'Required source unavailable or unsupported';
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
    headers: {
      ...versionAffinityHeaders(),
      Authorization: `Bearer ${accessToken}`,
    },
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
  const [weekdays, setWeekdays] = useState<ScheduleWeekday[]>([...scheduleWeekdays]);
  const [cooldownMinutes, setCooldownMinutes] = useState('60');
  const [startsAtLocal, setStartsAtLocal] = useState('');
  const [endsAtLocal, setEndsAtLocal] = useState('');
  const [rules, setRules] = useState<AlertRuleRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyRuleId, setBusyRuleId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');
  const [airQualityContext, setAirQualityContext] = useState<{
    key: string;
    status: 'loading' | 'ready' | 'failed';
    data?: AirQuality;
  } | null>(null);
  const [warningContext, setWarningContext] = useState<{
    key: string;
    status: 'loading' | 'ready' | 'failed';
    data?: SevereWeatherResponse;
  } | null>(null);
  const [auxiliaryRetry, setAuxiliaryRetry] = useState(0);
  const airQualityRequestKey = useRef<string | null>(null);
  const warningRequestKey = useRef<string | null>(null);
  const airQualityRequestGeneration = useRef(0);
  const warningRequestGeneration = useRef(0);
  const airQualityController = useRef<AbortController | null>(null);
  const warningController = useRef<AbortController | null>(null);

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
  const locationKey = `${location.latitude}:${location.longitude}:${location.country}`;
  const needsAirQuality =
    metric === 'aqi' ||
    metric === 'pm2.5' ||
    rules.some(
      (rule) =>
        rule.enabled &&
        rule.conditions.some(
          (condition) => condition.metric === 'aqi' || condition.metric === 'pm2.5',
        ),
    );
  const needsWarnings =
    metric === 'provider-severe-weather-alert' ||
    rules.some(
      (rule) =>
        rule.enabled &&
        rule.conditions.some((condition) => condition.metric === 'provider-severe-weather-alert'),
    );

  useEffect(() => {
    if (!expanded || !needsAirQuality || airQualityRequestKey.current === locationKey) return;
    airQualityController.current?.abort();
    const controller = new AbortController();
    airQualityController.current = controller;
    const generation = ++airQualityRequestGeneration.current;
    airQualityRequestKey.current = locationKey;
    setAirQualityContext({ key: locationKey, status: 'loading' });

    const url = new URL('/api/v1/weather/air-quality', gatewayOrigin);
    url.search = new URLSearchParams({
      lat: String(location.latitude),
      lon: String(location.longitude),
      view: 'timeline',
    }).toString();
    void fetch(url, {
      cache: 'no-store',
      headers: versionAffinityHeaders(),
      signal: controller.signal,
    })
      .then(async (response) => {
        const parsed = airQualitySchema.safeParse(await response.json().catch(() => undefined));
        if (!response.ok || !parsed.success) throw new Error('Air quality is unavailable');
        if (generation === airQualityRequestGeneration.current) {
          setAirQualityContext({ key: locationKey, status: 'ready', data: parsed.data });
        }
      })
      .catch(() => {
        if (generation === airQualityRequestGeneration.current) {
          setAirQualityContext({ key: locationKey, status: 'failed' });
        }
      });
  }, [
    auxiliaryRetry,
    expanded,
    gatewayOrigin,
    location.latitude,
    location.longitude,
    locationKey,
    needsAirQuality,
  ]);

  useEffect(() => {
    if (!expanded || !needsWarnings || warningRequestKey.current === locationKey) return;
    warningController.current?.abort();
    const controller = new AbortController();
    warningController.current = controller;
    const generation = ++warningRequestGeneration.current;
    warningRequestKey.current = locationKey;
    setWarningContext({ key: locationKey, status: 'loading' });

    void fetch('/api/v1/weather/warnings', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        latitude: Number(location.latitude.toFixed(3)),
        longitude: Number(location.longitude.toFixed(3)),
        country: location.country,
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const parsed = severeWeatherResponseSchema.safeParse(
          await response.json().catch(() => undefined),
        );
        if (!response.ok || !parsed.success) throw new Error('Official warnings are unavailable');
        if (generation === warningRequestGeneration.current) {
          setWarningContext({ key: locationKey, status: 'ready', data: parsed.data });
        }
      })
      .catch(() => {
        if (generation === warningRequestGeneration.current) {
          setWarningContext({ key: locationKey, status: 'failed' });
        }
      });
  }, [
    auxiliaryRetry,
    expanded,
    location.country,
    location.latitude,
    location.longitude,
    locationKey,
    needsWarnings,
  ]);

  useEffect(
    () => () => {
      airQualityController.current?.abort();
      warningController.current?.abort();
      airQualityRequestGeneration.current += 1;
      warningRequestGeneration.current += 1;
    },
    [],
  );

  function retryAuxiliaryData() {
    airQualityRequestKey.current = null;
    warningRequestKey.current = null;
    setAuxiliaryRetry((current) => current + 1);
  }

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
    if (isOccurrenceMetric(metric)) return { metric, expected: true };
    const value = Number(threshold);
    if (!Number.isFinite(value)) return undefined;
    return { metric, comparison, value };
  }

  async function createRule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    const condition = createCondition();
    const startsAt = localDateTimeToIso(startsAtLocal);
    const endsAt = localDateTimeToIso(endsAtLocal);
    if (startsAt === null || endsAt === null) {
      setMessage('Enter valid start and end times for this alert schedule.');
      return;
    }
    const request = createAlertRuleRequestSchema.safeParse({
      location_id: location.id,
      latitude: location.latitude,
      longitude: location.longitude,
      condition,
      schedule: {
        weekdays,
        cooldownMinutes: Number(cooldownMinutes),
        ...(startsAt ? { startsAt } : {}),
        ...(endsAt ? { endsAt } : {}),
      },
    });
    if (!request.success) {
      setMessage('Choose a valid threshold and schedule for this alert.');
      return;
    }
    setCreating(true);
    setMessage('');
    try {
      const response = await fetch(new URL('/api/v1/alerts', gatewayOrigin), {
        method: 'POST',
        headers: {
          ...versionAffinityHeaders(),
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
          ...versionAffinityHeaders(),
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
        headers: {
          ...versionAffinityHeaders(),
          Authorization: `Bearer ${accessToken}`,
        },
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

  const thresholdRange = isOccurrenceMetric(metric) ? undefined : thresholdBounds[metric];
  const currentAirQuality =
    airQualityContext?.key === locationKey && airQualityContext.status === 'ready'
      ? airQualityContext.data
      : undefined;
  const currentWarnings =
    warningContext?.key === locationKey && warningContext.status === 'ready'
      ? warningContext.data
      : undefined;
  const auxiliaryDataFailed =
    (needsAirQuality &&
      airQualityContext?.key === locationKey &&
      airQualityContext.status === 'failed') ||
    (needsWarnings && warningContext?.key === locationKey && warningContext.status === 'failed');

  return (
    <details
      className="in-app-alerts-panel"
      name="dashboard-tools"
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
              Status compares the current dashboard snapshot and forecast when loaded or changed.
              Weekdays use the location's local time; date-window inputs use your device time.
              Cooldown is saved for future delivery only. No email, push, or background delivery
              occurs.
            </p>
            {stale ? (
              <p className="in-app-alerts-stale" role="status">
                Weather data is cached; alert status may be out of date.
              </p>
            ) : null}
            {needsAirQuality &&
            airQualityContext?.key === locationKey &&
            airQualityContext.status === 'loading' ? (
              <p role="status">Loading AQI data for matching rules…</p>
            ) : null}
            {needsWarnings &&
            warningContext?.key === locationKey &&
            warningContext.status === 'loading' ? (
              <p role="status">Checking the official warning feed for matching rules…</p>
            ) : null}
            {needsAirQuality &&
            airQualityContext?.key === locationKey &&
            airQualityContext.status === 'failed' ? (
              <p role="status">AQI data is unavailable; related rules are not matched.</p>
            ) : null}
            {needsWarnings &&
            warningContext?.key === locationKey &&
            warningContext.status === 'failed' ? (
              <p role="status">Official warnings are unavailable; related rules are not matched.</p>
            ) : null}
            {needsWarnings && currentWarnings?.coverage === 'unsupported' ? (
              <p role="status">Official warning coverage is unsupported for this location.</p>
            ) : null}
            {auxiliaryDataFailed ? (
              <button type="button" onClick={retryAuxiliaryData}>
                Retry rule data
              </button>
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
              {!isOccurrenceMetric(metric) ? (
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
                    min={thresholdRange?.minimum}
                    max={thresholdRange?.maximum}
                    step="any"
                    value={threshold}
                    onChange={(event) => setThreshold(event.target.value)}
                    required
                  />
                </div>
              ) : null}
              <fieldset className="in-app-alert-weekdays">
                <legend>Active weekdays (location time)</legend>
                <div className="in-app-alert-weekday-list">
                  {scheduleWeekdays.map((weekday) => {
                    const selected = weekdays.includes(weekday);
                    return (
                      <label className="in-app-alert-weekday-option" key={weekday}>
                        <input
                          type="checkbox"
                          aria-label={weekdayLabels[weekday]}
                          checked={selected}
                          disabled={selected && weekdays.length === 1}
                          onChange={(event) => {
                            const next = new Set(weekdays);
                            if (event.currentTarget.checked) next.add(weekday);
                            else next.delete(weekday);
                            setWeekdays(scheduleWeekdays.filter((day) => next.has(day)));
                          }}
                        />
                        <span>{weekdayLabels[weekday].slice(0, 3)}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <div className="in-app-alert-schedule-fields">
                <div>
                  <label htmlFor="alert-starts-at">Starts at (optional, device time)</label>
                  <input
                    id="alert-starts-at"
                    type="datetime-local"
                    value={startsAtLocal}
                    onChange={(event) => setStartsAtLocal(event.currentTarget.value)}
                  />
                </div>
                <div>
                  <label htmlFor="alert-ends-at">Ends at (optional, device time)</label>
                  <input
                    id="alert-ends-at"
                    type="datetime-local"
                    value={endsAtLocal}
                    onChange={(event) => setEndsAtLocal(event.currentTarget.value)}
                  />
                </div>
                <div>
                  <label htmlFor="alert-cooldown">Cooldown (minutes)</label>
                  <input
                    id="alert-cooldown"
                    type="number"
                    min={1}
                    max={10080}
                    step={1}
                    value={cooldownMinutes}
                    onChange={(event) => setCooldownMinutes(event.currentTarget.value)}
                    required
                  />
                </div>
              </div>
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
                    ...(currentAirQuality ? { airQuality: currentAirQuality } : {}),
                    ...(currentWarnings
                      ? {
                          officialWarnings: {
                            coverage: currentWarnings.coverage,
                            alerts: currentWarnings.alerts,
                          },
                        }
                      : {}),
                  });
                  const contextIsStale =
                    currentAirQuality?.meta.stale === true || currentWarnings?.meta.stale === true;
                  const displayStatus =
                    (stale || contextIsStale) && record.enabled ? 'stale' : status;
                  return (
                    <li key={record.id}>
                      <strong>{conditionLabel(record.conditions[0]!)}</strong>
                      <span className={`in-app-alert-status alert-${displayStatus}`}>
                        {displayStatus === 'stale' ? 'Weather data stale' : statusLabel(status)}
                      </span>
                      <small className="in-app-alert-schedule">
                        {scheduleSummary(record.schedule, location.timezone)}
                      </small>
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
