'use client';

import {
  airQualitySchema,
  type AirQuality,
  type Dashboard,
  type UnitSystem,
} from '@atmos/contracts';
import {
  defaultCustomPlannerThresholds,
  planActivity,
  plannerActivityKinds,
  plannerActivityLabels,
  type PlannerActivity,
  type PlannerActivityKind,
  type PlannerDimension,
  type PlannerThresholds,
} from '@atmos/domain';
import { useEffect, useId, useRef, useState } from 'react';
import { fetchPublicAirQuality } from '../lib/public-weather-api';

type ActivityPlannerProps = Pick<Dashboard, 'hourly' | 'location'> & {
  units: UnitSystem;
  displayTimezone: string;
};

const plannerDimensionLabels: Record<PlannerDimension, string> = {
  temperature: 'temperature',
  'feels-like': 'feels-like temperature',
  humidity: 'humidity',
  rain: 'rain',
  precipitation: 'hourly precipitation',
  wind: 'wind',
  uv: 'UV',
  aqi: 'U.S. AQI',
  conditions: 'conditions',
};

function toDisplayTemperature(valueC: number, units: UnitSystem) {
  return Math.round(units === 'imperial' ? (valueC * 9) / 5 + 32 : valueC);
}

function fromDisplayTemperature(value: number, units: UnitSystem) {
  return units === 'imperial' ? ((value - 32) * 5) / 9 : value;
}

function toDisplayWind(valueKph: number, units: UnitSystem) {
  return Math.round(units === 'imperial' ? valueKph / 1.60934 : valueKph);
}

function fromDisplayWind(value: number, units: UnitSystem) {
  return units === 'imperial' ? value * 1.60934 : value;
}

function toDisplayPrecipitation(valueMm: number, units: UnitSystem) {
  return units === 'imperial' ? Number((valueMm / 25.4).toFixed(2)) : valueMm;
}

function fromDisplayPrecipitation(value: number, units: UnitSystem) {
  return units === 'imperial' ? value * 25.4 : value;
}

export function ActivityPlanner({
  hourly,
  location,
  units,
  displayTimezone,
}: ActivityPlannerProps) {
  const [activity, setActivity] = useState<PlannerActivityKind | 'custom'>('running');
  const [customName, setCustomName] = useState('My outdoor activity');
  const [customThresholds, setCustomThresholds] = useState<PlannerThresholds>({
    ...defaultCustomPlannerThresholds,
  });
  const [airQuality, setAirQuality] = useState<AirQuality | null>(null);
  const [airQualityStatus, setAirQualityStatus] = useState<
    'idle' | 'loading' | 'ready' | 'failed' | 'unsupported'
  >('idle');
  const [includeAqi, setIncludeAqi] = useState(false);
  const airQualityController = useRef<AbortController | null>(null);
  const id = useId();
  useEffect(() => () => airQualityController.current?.abort(), []);

  const activityInput: PlannerActivity =
    activity === 'custom'
      ? { kind: 'custom', name: customName.trim() || 'Custom activity' }
      : { kind: activity };
  const aqiHours =
    includeAqi && airQualityStatus === 'ready' ? (airQuality?.timeline?.hours ?? []) : [];
  const plan = planActivity(activityInput, hourly, {
    customThresholds,
    aqiHours,
  });
  const activityName = activity === 'custom' ? activityInput.name : plannerActivityLabels[activity];
  const time = new Intl.DateTimeFormat('en', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: displayTimezone,
  });
  const date = new Intl.DateTimeFormat('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: displayTimezone,
  });

  async function loadAirQualityTimeline() {
    airQualityController.current?.abort();
    const controller = new AbortController();
    airQualityController.current = controller;
    setAirQualityStatus('loading');
    setIncludeAqi(false);
    try {
      const response = await fetchPublicAirQuality(
        { latitude: location.latitude, longitude: location.longitude, includeTimeline: true },
        { signal: controller.signal },
      );
      const parsed = airQualitySchema.safeParse(await response.json().catch(() => undefined));
      if (!response.ok || !parsed.success) throw new Error('AQI timeline unavailable');
      if (controller.signal.aborted) return;
      setAirQuality(parsed.data);
      if (!parsed.data.timeline) {
        setAirQualityStatus('unsupported');
        return;
      }
      setAirQualityStatus('ready');
      setIncludeAqi(true);
    } catch {
      if (!controller.signal.aborted) setAirQualityStatus('failed');
    } finally {
      if (airQualityController.current === controller) airQualityController.current = null;
    }
  }

  function updateCustomThreshold(key: keyof PlannerThresholds, value: number) {
    if (!Number.isFinite(value)) return;
    setCustomThresholds((current) => {
      const next = { ...current, [key]: value };
      if (key === 'temperatureMinC') next.feelsLikeMinC = value;
      if (key === 'temperatureMaxC') next.feelsLikeMaxC = value;
      if (key === 'windSpeedKphMax') next.windGustKphMax = Math.max(value, value * 1.5);
      return next;
    });
  }

  function updateCustomInput(
    key: keyof PlannerThresholds,
    inputValue: number,
    convert: (value: number) => number = (value) => value,
  ) {
    if (Number.isFinite(inputValue)) updateCustomThreshold(key, convert(inputValue));
  }

  return (
    <article className="planner-card panel" id="activities" aria-labelledby="activity-title">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Make time for outside</p>
          <h2 id="activity-title">Find your window.</h2>
        </div>
        <label className="planner-profile-picker" htmlFor={`${id}-activity`}>
          <span>Activity profile</span>
          <select
            id={`${id}-activity`}
            value={activity}
            onChange={(event) => setActivity(event.target.value as PlannerActivityKind | 'custom')}
          >
            {plannerActivityKinds.map((kind) => (
              <option key={kind} value={kind}>
                {plannerActivityLabels[kind]}
              </option>
            ))}
            <option value="custom">Custom activity</option>
          </select>
        </label>
      </div>
      {activity === 'custom' ? (
        <fieldset className="planner-custom-profile">
          <legend>Custom profile · session only</legend>
          <label className="planner-custom-name" htmlFor={`${id}-custom-name`}>
            Profile name
            <input
              id={`${id}-custom-name`}
              type="text"
              value={customName}
              maxLength={60}
              onChange={(event) => setCustomName(event.target.value)}
            />
          </label>
          <div className="planner-threshold-grid">
            <label htmlFor={`${id}-temp-min`}>
              Minimum temperature ({units === 'imperial' ? '°F' : '°C'})
              <input
                id={`${id}-temp-min`}
                type="number"
                min={units === 'imperial' ? -58 : -50}
                max={toDisplayTemperature(customThresholds.temperatureMaxC, units)}
                step={1}
                value={toDisplayTemperature(customThresholds.temperatureMinC, units)}
                onChange={(event) =>
                  updateCustomInput('temperatureMinC', event.currentTarget.valueAsNumber, (value) =>
                    Math.min(
                      fromDisplayTemperature(value, units),
                      customThresholds.temperatureMaxC,
                    ),
                  )
                }
              />
            </label>
            <label htmlFor={`${id}-temp-max`}>
              Maximum temperature ({units === 'imperial' ? '°F' : '°C'})
              <input
                id={`${id}-temp-max`}
                type="number"
                min={toDisplayTemperature(customThresholds.temperatureMinC, units)}
                max={units === 'imperial' ? 140 : 60}
                step={1}
                value={toDisplayTemperature(customThresholds.temperatureMaxC, units)}
                onChange={(event) =>
                  updateCustomInput('temperatureMaxC', event.currentTarget.valueAsNumber, (value) =>
                    Math.max(
                      fromDisplayTemperature(value, units),
                      customThresholds.temperatureMinC,
                    ),
                  )
                }
              />
            </label>
            <label htmlFor={`${id}-humidity`}>
              Maximum humidity (%)
              <input
                id={`${id}-humidity`}
                type="number"
                min={0}
                max={100}
                step={1}
                value={customThresholds.humidityMaxPercent}
                onChange={(event) =>
                  updateCustomInput('humidityMaxPercent', event.currentTarget.valueAsNumber)
                }
              />
            </label>
            <label htmlFor={`${id}-rain-chance`}>
              Maximum rain chance (%)
              <input
                id={`${id}-rain-chance`}
                type="number"
                min={0}
                max={100}
                step={1}
                value={customThresholds.rainProbabilityMax}
                onChange={(event) =>
                  updateCustomInput('rainProbabilityMax', event.currentTarget.valueAsNumber)
                }
              />
            </label>
            <label htmlFor={`${id}-precipitation`}>
              Hourly precipitation (max {units === 'imperial' ? 'in' : 'mm'})
              <input
                id={`${id}-precipitation`}
                type="number"
                min={0}
                max={units === 'imperial' ? 10 : 250}
                step={0.1}
                value={toDisplayPrecipitation(customThresholds.precipitationMmMax, units)}
                onChange={(event) =>
                  updateCustomInput(
                    'precipitationMmMax',
                    event.currentTarget.valueAsNumber,
                    (value) => fromDisplayPrecipitation(value, units),
                  )
                }
              />
            </label>
            <label htmlFor={`${id}-wind`}>
              Maximum wind ({units === 'imperial' ? 'mph' : 'km/h'})
              <input
                id={`${id}-wind`}
                type="number"
                min={0}
                max={units === 'imperial' ? 310 : 500}
                step={1}
                value={toDisplayWind(customThresholds.windSpeedKphMax, units)}
                onChange={(event) =>
                  updateCustomInput('windSpeedKphMax', event.currentTarget.valueAsNumber, (value) =>
                    fromDisplayWind(value, units),
                  )
                }
              />
            </label>
            <label htmlFor={`${id}-uv`}>
              Maximum UV index
              <input
                id={`${id}-uv`}
                type="number"
                min={0}
                max={30}
                step={0.5}
                value={customThresholds.uvIndexMax}
                onChange={(event) =>
                  updateCustomInput('uvIndexMax', event.currentTarget.valueAsNumber)
                }
              />
            </label>
            <label htmlFor={`${id}-aqi`}>
              Maximum U.S. AQI
              <input
                id={`${id}-aqi`}
                type="number"
                min={0}
                max={500}
                step={1}
                value={customThresholds.usAqiMax}
                onChange={(event) =>
                  updateCustomInput('usAqiMax', event.currentTarget.valueAsNumber)
                }
              />
            </label>
          </div>
          <p className="planner-custom-note">
            Feels-like uses the same temperature range. Changes are not saved to an account.
          </p>
        </fieldset>
      ) : null}
      <div className="planner-aqi-control">
        <button
          className="planner-aqi-button"
          type="button"
          disabled={airQualityStatus === 'loading'}
          aria-pressed={airQualityStatus === 'ready' ? includeAqi : undefined}
          onClick={() => {
            if (airQualityStatus === 'ready') setIncludeAqi((enabled) => !enabled);
            else void loadAirQualityTimeline();
          }}
        >
          {airQualityStatus === 'loading'
            ? 'Loading model AQI…'
            : airQualityStatus === 'ready'
              ? includeAqi
                ? 'Exclude AQI from score'
                : 'Include AQI in score'
              : airQualityStatus === 'idle'
                ? 'Load AQI forecast (optional)'
                : 'Retry AQI forecast'}
        </button>
        {airQualityStatus === 'idle' ? (
          <p>Air quality is not requested or scored until you choose to include it.</p>
        ) : null}
        {airQualityStatus === 'loading' ? (
          <p role="status">Loading the on-demand air-quality model timeline…</p>
        ) : null}
        {airQualityStatus === 'failed' ? (
          <p role="status">AQI is unavailable. It is not scored; planner coverage remains lower.</p>
        ) : null}
        {airQualityStatus === 'unsupported' ? (
          <p role="status">
            This response has no AQI timeline. AQI remains unscored and unavailable.
          </p>
        ) : null}
        {airQualityStatus === 'ready' ? (
          <p role="status">
            {airQuality?.meta.stale ? 'Using cached model data. ' : ''}
            {includeAqi
              ? 'Modeled U.S. AQI is included where hourly values are available.'
              : 'AQI is excluded; the loaded model data is not used.'}{' '}
            Not station readings.{' '}
            <a
              href="https://open-meteo.com/en/docs/air-quality-api"
              target="_blank"
              rel="noreferrer"
            >
              Open-Meteo/CAMS model · CC BY 4.0
            </a>
          </p>
        ) : null}
      </div>
      {plan.rankedWindows.length > 0 ? (
        <p className="planner-summary">
          Best upcoming {activityName} window: <strong>{plan.score}/100</strong>
          <span> · {plan.coveragePercent}% input coverage</span>
        </p>
      ) : (
        <p className="planner-summary">Suitability is unavailable without hourly forecast data.</p>
      )}
      <p className="planner-coverage-note">
        Suitability is a deterministic estimate, not safety advice. Missing inputs lower coverage
        and keep the score closer to neutral.
      </p>
      {plan.missingDimensions.length > 0 ? (
        <p className="planner-missing-inputs" role="status">
          Not assessed in the best window:{' '}
          {plan.missingDimensions.map((dimension) => plannerDimensionLabels[dimension]).join(', ')}.
        </p>
      ) : null}
      {plan.rankedWindows.length === 0 ? (
        <p role="status">Hourly forecast windows are unavailable for this place.</p>
      ) : null}
      <ol className="planner-windows" aria-label={`Ranked ${activity} weather windows`}>
        {plan.rankedWindows.map((window, index) => (
          <li key={window.startsAt}>
            <div className="planner-window-heading">
              <div>
                <strong>{date.format(new Date(window.startsAt))}</strong>
                <span className="planner-window-time">
                  {time.format(new Date(window.startsAt))}–{time.format(new Date(window.endsAt))}
                </span>
              </div>
              <div className="planner-window-score">
                {index === 0 ? <span className="planner-best-label">Best</span> : null}
                <strong>{window.score}/100</strong>
              </div>
            </div>
            <p className="planner-window-coverage">Coverage {window.coveragePercent}%</p>
            {window.missingDimensions.length > 0 ? (
              <p className="planner-window-missing">
                Not assessed:{' '}
                {window.missingDimensions
                  .map((dimension) => plannerDimensionLabels[dimension])
                  .join(', ')}
                .
              </p>
            ) : null}
            <details className="planner-window-details">
              <summary>Why this window?</summary>
              <ul>
                {window.factors.map((factor, factorIndex) => (
                  <li
                    className={`planner-factor planner-factor-${factor.impact}`}
                    key={`${factor.dimension}-${factorIndex}`}
                  >
                    <span>{factor.dimension.replace('-', ' ')}</span>
                    <p>{factor.explanation}</p>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ol>
    </article>
  );
}
