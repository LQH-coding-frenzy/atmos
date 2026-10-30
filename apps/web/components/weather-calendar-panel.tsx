'use client';

import {
  airQualitySchema,
  alertRulesResponseSchema,
  type AlertCondition,
  type AlertRuleRecord,
  type AirQuality,
  type AirQualityHour,
  type Dashboard,
  type DailyForecast,
  type ExtendedDailyForecast,
  type HourlyForecast,
  type UnitSystem,
} from '@atmos/contracts';
import {
  formatTemperature,
  plannerActivityKinds,
  plannerActivityLabels,
  planActivity,
  type PlannerActivityKind,
} from '@atmos/domain';
import type { Session } from '@supabase/supabase-js';
import { CalendarDays } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase-browser';
import { versionAffinityHeaders } from '../lib/version-affinity';
import { fetchPublicAirQuality } from '../lib/public-weather-api';
import {
  alertRuleScheduledForDate,
  calendarDateInTimezone,
  hourlyForecastForDate,
} from '../lib/weather-calendar';
import {
  DailyMeasurements,
  DaylightMeasurements,
  HourlyMeasurements,
} from './weather-measurements';

type WeatherCalendarPanelProps = {
  gatewayOrigin: string;
  dashboard: Dashboard;
  units: UnitSystem;
};

type RuleLoadState = 'loading' | 'ready' | 'unavailable' | 'signed-out';
type AqiLoadState = 'idle' | 'loading' | 'ready' | 'unavailable';

function calendarDateLabel(value: string) {
  const timestamp = Date.parse(`${value}T12:00:00.000Z`);
  if (!Number.isFinite(timestamp)) return value;
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(timestamp));
}

function formatHour(value: string, timezone: string) {
  return new Intl.DateTimeFormat('en', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(value));
}

function conditionName(condition: string) {
  return condition.replaceAll('-', ' ');
}

function alertConditionSummary(condition: AlertCondition) {
  if ('expected' in condition) {
    const labels: Record<string, string> = {
      thunderstorm: 'Thunderstorm forecast',
      'freeze-risk': 'Freeze risk',
      'extreme-heat': 'Extreme heat',
      'provider-severe-weather-alert': 'Official severe-weather alert',
    };
    return labels[condition.metric] ?? condition.metric;
  }
  const units: Record<string, string> = {
    temperature: '°C',
    'feels-like': '°C',
    'rain-probability': '%',
    rainfall: 'mm',
    snowfall: 'mm',
    wind: 'km/h',
    gust: 'km/h',
    uv: '',
    aqi: ' AQI',
    'pm2.5': ' µg/m³',
    visibility: ' km',
  };
  return `${condition.metric.replaceAll('-', ' ')} ${condition.comparison} ${condition.value}${units[condition.metric] ?? ''}`;
}

function maximum(values: readonly (number | null | undefined)[]) {
  const available = values.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );
  return available.length ? Math.max(...available) : undefined;
}

function WeatherDayDetails({
  dashboard,
  day,
  extendedDay,
  date,
  hours,
  aqiHours,
  aqiStatus,
  airQuality,
  units,
  activity,
  onActivityChange,
  rulesStatus,
  rules,
}: {
  dashboard: Dashboard;
  day: DailyForecast | ExtendedDailyForecast;
  extendedDay?: ExtendedDailyForecast;
  date: string;
  hours: readonly HourlyForecast[];
  aqiHours: readonly AirQualityHour[];
  aqiStatus: AqiLoadState;
  airQuality: AirQuality | null;
  units: UnitSystem;
  activity: PlannerActivityKind;
  onActivityChange: (activity: PlannerActivityKind) => void;
  rulesStatus: RuleLoadState;
  rules: AlertRuleRecord[];
}) {
  const timezone = dashboard.location.timezone;
  const plan = hours.length ? planActivity({ kind: activity }, hours, { aqiHours }) : undefined;
  const dayAqi = aqiHours.filter((hour) => calendarDateInTimezone(hour.time, timezone) === date);
  const maxAqi = maximum(dayAqi.map((hour) => hour.usAqi));
  const maxPm25 = maximum(dayAqi.map((hour) => hour.pollutants.pm25));
  const scheduledRules = rules.filter(
    (rule) => rule.enabled && alertRuleScheduledForDate(rule, date, timezone, hours),
  );

  return (
    <section className="weather-calendar-day" aria-labelledby="weather-calendar-selected-day">
      <header className="weather-calendar-day-heading">
        <div>
          <p className="eyebrow">Selected forecast day</p>
          <h3 id="weather-calendar-selected-day">{calendarDateLabel(date)}</h3>
        </div>
        <span>{dashboard.location.timezone}</span>
      </header>
      <p className="weather-calendar-day-summary">
        {conditionName(day.condition)} · High{' '}
        {formatTemperature(day.highC, units).replace(' deg', '')}° · Low{' '}
        {formatTemperature(day.lowC, units).replace(' deg', '')}° · Rain chance{' '}
        {day.precipitationProbability === null ? 'Unavailable' : `${day.precipitationProbability}%`}
      </p>
      {extendedDay ? (
        <DailyMeasurements day={extendedDay} units={units} timezone={timezone} />
      ) : (
        <DaylightMeasurements day={day} timezone={timezone} />
      )}

      <section className="weather-calendar-section" aria-labelledby="weather-calendar-hourly-title">
        <h4 id="weather-calendar-hourly-title">Hourly details</h4>
        {hours.length ? (
          <ol className="weather-calendar-hours">
            {hours.map((hour) => (
              <li key={hour.time}>
                <details>
                  <summary>
                    <time dateTime={hour.time}>{formatHour(hour.time, timezone)}</time>
                    <span>{conditionName(hour.condition)}</span>
                    <strong>
                      {formatTemperature(hour.temperatureC, units).replace(' deg', '')}°
                      {units === 'metric' ? 'C' : 'F'}
                    </strong>
                  </summary>
                  <HourlyMeasurements hour={hour} units={units} />
                </details>
              </li>
            ))}
          </ol>
        ) : (
          <p role="status">Hourly forecast is unavailable for this date.</p>
        )}
      </section>

      <section className="weather-calendar-section" aria-labelledby="weather-calendar-aqi-title">
        <h4 id="weather-calendar-aqi-title">Air quality</h4>
        {aqiStatus === 'loading' ? <p role="status">Loading the on-demand AQI timeline…</p> : null}
        {aqiStatus === 'unavailable' ? (
          <p role="status">AQI data is unavailable; it is not treated as zero.</p>
        ) : null}
        {aqiStatus === 'ready' && !airQuality?.timeline ? (
          <p role="status">This response does not include an AQI timeline.</p>
        ) : null}
        {aqiStatus === 'ready' && airQuality?.meta.stale ? (
          <p className="weather-calendar-stale" role="status">
            The AQI timeline is cached and may be stale.
          </p>
        ) : null}
        {aqiStatus === 'ready' && airQuality?.timeline ? (
          dayAqi.length ? (
            <p>
              Maximum U.S. AQI: {maxAqi ?? 'Unavailable'} · Maximum PM2.5:{' '}
              {maxPm25 === undefined ? 'Unavailable' : `${maxPm25} µg/m³`}
            </p>
          ) : (
            <p role="status">
              The AQI model has no values for this date; missing values are not zero.
            </p>
          )
        ) : null}
      </section>

      <section
        className="weather-calendar-section"
        aria-labelledby="weather-calendar-planner-title"
      >
        <div className="weather-calendar-section-heading">
          <h4 id="weather-calendar-planner-title">Activity outlook</h4>
          <label htmlFor="weather-calendar-activity">Activity</label>
          <select
            id="weather-calendar-activity"
            value={activity}
            onChange={(event) => onActivityChange(event.currentTarget.value as PlannerActivityKind)}
          >
            {plannerActivityKinds.map((kind) => (
              <option key={kind} value={kind}>
                {plannerActivityLabels[kind]}
              </option>
            ))}
          </select>
        </div>
        {plan ? (
          <>
            <p>
              {plannerActivityLabels[activity]}: {plan.score}/100 · {plan.coveragePercent}% coverage
            </p>
            {plan.rankedWindows[0] ? (
              <p>
                Best available window: {formatHour(plan.rankedWindows[0].startsAt, timezone)}–
                {formatHour(plan.rankedWindows[0].endsAt, timezone)}
              </p>
            ) : null}
            {plan.missingDimensions.length ? (
              <p role="status">Missing inputs: {plan.missingDimensions.join(', ')}.</p>
            ) : null}
          </>
        ) : (
          <p role="status">No hourly data is available to score this date.</p>
        )}
      </section>

      <section className="weather-calendar-section" aria-labelledby="weather-calendar-rules-title">
        <h4 id="weather-calendar-rules-title">Scheduled in-app rules</h4>
        {rulesStatus === 'loading' ? <p role="status">Loading your alert rules…</p> : null}
        {rulesStatus === 'signed-out' ? (
          <p>Sign in from Saved places to view your scheduled rules.</p>
        ) : null}
        {rulesStatus === 'unavailable' ? (
          <p role="status">Your alert rules are unavailable right now.</p>
        ) : null}
        {rulesStatus === 'ready' && scheduledRules.length ? (
          <ul className="weather-calendar-rules">
            {scheduledRules.map((rule) => (
              <li key={rule.id}>{rule.conditions.map(alertConditionSummary).join(' and ')}</li>
            ))}
          </ul>
        ) : null}
        {rulesStatus === 'ready' && scheduledRules.length === 0 ? (
          <p>No enabled in-app rules are scheduled for this date.</p>
        ) : null}
        <p className="measurement-note">
          This is schedule context only. Rule status still evaluates against the open dashboard; no
          delivery or date backfill runs here.
        </p>
      </section>
    </section>
  );
}

export function WeatherCalendarPanel({
  gatewayOrigin,
  dashboard,
  units,
}: WeatherCalendarPanelProps) {
  const client = useMemo(() => getSupabaseBrowserClient(), []);
  const days = dashboard.extendedDaily ?? dashboard.daily;
  const firstDate = days[0]?.date ?? null;
  const [expanded, setExpanded] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(firstDate);
  const [activity, setActivity] = useState<PlannerActivityKind>('running');
  const [airQuality, setAirQuality] = useState<AirQuality | null>(null);
  const [aqiStatus, setAqiStatus] = useState<AqiLoadState>('idle');
  const [aqiRetry, setAqiRetry] = useState(0);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [rules, setRules] = useState<AlertRuleRecord[]>([]);
  const [rulesStatus, setRulesStatus] = useState<RuleLoadState>('loading');

  useEffect(() => {
    setSelectedDate(firstDate);
    setAirQuality(null);
    setAqiStatus('idle');
  }, [dashboard.location.id, firstDate]);

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

  const selectedDay = days.find((day) => day.date === selectedDate);
  const selectedExtendedDay = dashboard.extendedDaily?.find((day) => day.date === selectedDate);
  const dayHours = selectedDate
    ? hourlyForecastForDate(dashboard.hourly, selectedDate, dashboard.location.timezone)
    : [];

  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    setAqiStatus('loading');
    setAirQuality(null);
    void fetchPublicAirQuality(
      {
        latitude: dashboard.location.latitude,
        longitude: dashboard.location.longitude,
        includeTimeline: true,
      },
      { signal: controller.signal },
    )
      .then(async (response) => {
        const parsed = airQualitySchema.safeParse(await response.json().catch(() => undefined));
        if (!response.ok || !parsed.success) throw new Error('AQI timeline unavailable');
        if (controller.signal.aborted) return;
        setAirQuality(parsed.data);
        setAqiStatus(parsed.data.timeline ? 'ready' : 'unavailable');
      })
      .catch(() => {
        if (!controller.signal.aborted) setAqiStatus('unavailable');
      });
    return () => controller.abort();
  }, [aqiRetry, dashboard.location.latitude, dashboard.location.longitude, expanded]);

  const accessToken = session?.access_token;
  useEffect(() => {
    if (!expanded || !authReady) return;
    if (!client || !accessToken) {
      setRules([]);
      setRulesStatus('signed-out');
      return;
    }
    let active = true;
    setRulesStatus('loading');
    const url = new URL('/api/v1/alerts', gatewayOrigin);
    url.search = new URLSearchParams({
      lat: String(dashboard.location.latitude),
      lon: String(dashboard.location.longitude),
    }).toString();
    void fetch(url, {
      cache: 'no-store',
      headers: {
        ...versionAffinityHeaders(),
        Authorization: `Bearer ${accessToken}`,
      },
    })
      .then(async (response) => {
        const parsed = alertRulesResponseSchema.safeParse(
          await response.json().catch(() => undefined),
        );
        if (!response.ok || !parsed.success) throw new Error('Alert rules unavailable');
        if (active) {
          setRules(parsed.data.rules);
          setRulesStatus('ready');
        }
      })
      .catch(() => {
        if (active) {
          setRules([]);
          setRulesStatus('unavailable');
        }
      });
    return () => {
      active = false;
    };
  }, [
    accessToken,
    authReady,
    client,
    dashboard.location.latitude,
    dashboard.location.longitude,
    expanded,
    gatewayOrigin,
  ]);

  const selectedAqiHours = selectedDate
    ? (airQuality?.timeline?.hours ?? []).filter(
        (hour) => calendarDateInTimezone(hour.time, dashboard.location.timezone) === selectedDate,
      )
    : [];
  const scheduledRules = selectedDate
    ? rules.filter(
        (rule) =>
          rule.enabled &&
          alertRuleScheduledForDate(rule, selectedDate, dashboard.location.timezone, dayHours),
      )
    : [];

  return (
    <details
      className="weather-calendar-panel"
      name="dashboard-tools"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>
        <CalendarDays size={17} aria-hidden="true" />
        <span>Calendar</span>
      </summary>
      <section className="weather-calendar-popover" aria-label="Weather forecast calendar">
        <h2>Weather calendar</h2>
        <p className="weather-calendar-location">{dashboard.location.name}</p>
        <p className="measurement-note">
          Select a forecast date. Calendar days and hours follow {dashboard.location.timezone}.
        </p>
        <div className="weather-calendar-days" role="group" aria-label="Forecast dates">
          {days.map((day) => (
            <button
              className={selectedDate === day.date ? 'active' : ''}
              key={day.date}
              type="button"
              aria-pressed={selectedDate === day.date}
              aria-label={`Select ${calendarDateLabel(day.date)} forecast`}
              onClick={() => setSelectedDate(day.date)}
            >
              <time dateTime={day.date}>{calendarDateLabel(day.date)}</time>
              <strong>
                {formatTemperature(day.highC, units).replace(' deg', '')}° /{' '}
                {formatTemperature(day.lowC, units).replace(' deg', '')}°
              </strong>
              <span>{conditionName(day.condition)}</span>
            </button>
          ))}
        </div>
        {!selectedDay || !selectedDate ? (
          <p role="status">Calendar forecast is unavailable for this place.</p>
        ) : (
          <WeatherDayDetails
            dashboard={dashboard}
            day={selectedDay}
            extendedDay={selectedExtendedDay}
            date={selectedDate}
            hours={dayHours}
            aqiHours={selectedAqiHours}
            aqiStatus={aqiStatus}
            airQuality={airQuality}
            units={units}
            activity={activity}
            onActivityChange={setActivity}
            rulesStatus={rulesStatus}
            rules={scheduledRules}
          />
        )}
        {expanded && aqiStatus === 'unavailable' ? (
          <button type="button" onClick={() => setAqiRetry((attempt) => attempt + 1)}>
            Retry AQI timeline
          </button>
        ) : null}
      </section>
    </details>
  );
}
