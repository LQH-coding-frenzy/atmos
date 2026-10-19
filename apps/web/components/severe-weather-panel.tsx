'use client';

import {
  severeWeatherResponseSchema,
  type Location,
  type SevereWeatherResponse,
} from '@atmos/contracts';
import { ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';

type SevereWeatherPanelProps = {
  location: Location;
};

function sourceName(response: SevereWeatherResponse) {
  if (response.source === 'nws') return 'U.S. National Weather Service';
  if (response.source === 'eccc') return 'Environment and Climate Change Canada';
  return null;
}

function formatAlertTime(value: string | null, timezone: string) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat('en', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export function SevereWeatherPanel({ location }: SevereWeatherPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [warnings, setWarnings] = useState<SevereWeatherResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    setWarnings(null);

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
        if (!controller.signal.aborted) setWarnings(parsed.data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [expanded, location.country, location.latitude, location.longitude, retry]);

  const provider = warnings ? sourceName(warnings) : null;

  return (
    <details
      className="severe-weather-panel"
      name="dashboard-tools"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>
        <ShieldAlert size={17} aria-hidden="true" />
        <span>Official alerts</span>
      </summary>
      <section className="severe-weather-popover" aria-label="Official weather alerts">
        <header className="severe-weather-heading">
          <div>
            <p className="eyebrow">Source-backed coverage</p>
            <h2>Official weather alerts</h2>
          </div>
          <button
            className="severe-weather-refresh"
            type="button"
            onClick={() => setRetry((value) => value + 1)}
            disabled={loading}
          >
            {loading ? 'Checking…' : 'Check again'}
          </button>
        </header>
        <p className="severe-weather-location">
          {location.name}, {location.country}
        </p>
        {loading ? <p role="status">Checking the official feed for this location…</p> : null}
        {failed ? (
          <p className="severe-weather-error" role="status">
            The official feed could not be reached. This does not mean there are no active alerts.
          </p>
        ) : null}
        {warnings?.coverage === 'unsupported' ? (
          <p className="severe-weather-unsupported" role="status">
            Official feed coverage is not available for this location. Supported coverage is limited
            to U.S. National Weather Service service areas and Canada. This is not a “no alerts”
            result.
          </p>
        ) : null}
        {warnings?.meta.stale ? (
          <p className="severe-weather-stale" role="status">
            Showing cached warning coverage because the source could not be refreshed. Check the
            official source before acting.
          </p>
        ) : null}
        {warnings?.coverage === 'supported' && !loading ? (
          <>
            <p className="severe-weather-checked">
              Checked {formatAlertTime(warnings.meta.checkedAt, location.timezone)} in{' '}
              {location.timezone}
            </p>
            {warnings.meta.truncated ? (
              <p className="severe-weather-truncated" role="status">
                Showing the first 20 matching alerts. Open the official source for the complete
                list.
              </p>
            ) : null}
            {warnings.alerts.length === 0 ? (
              <p className="severe-weather-empty" role="status">
                No active alerts are currently reported by {provider} for this point. This is not a
                guarantee of hazard-free conditions.
              </p>
            ) : (
              <ol className="severe-weather-list" aria-label="Active official alerts">
                {warnings.alerts.map((alert) => (
                  <li key={alert.id}>
                    <article className="severe-weather-alert">
                      <div className="severe-weather-alert-heading">
                        <h3>{alert.headline || alert.event}</h3>
                        {alert.severity ? <span>{alert.severity}</span> : null}
                      </div>
                      {alert.headline && alert.headline !== alert.event ? (
                        <p className="severe-weather-event">{alert.event}</p>
                      ) : null}
                      {alert.urgency || alert.certainty ? (
                        <p className="severe-weather-alert-context">
                          {[
                            alert.urgency ? `Urgency: ${alert.urgency}` : null,
                            alert.certainty ? `Certainty: ${alert.certainty}` : null,
                          ]
                            .filter((value): value is string => value !== null)
                            .join(' · ')}
                        </p>
                      ) : null}
                      {alert.area ? <p className="severe-weather-area">{alert.area}</p> : null}
                      {alert.description ? (
                        <p className="severe-weather-description">{alert.description}</p>
                      ) : null}
                      {alert.instruction ? (
                        <p className="severe-weather-instruction">{alert.instruction}</p>
                      ) : null}
                      <dl className="severe-weather-times">
                        {alert.publishedAt ? (
                          <div>
                            <dt>Published</dt>
                            <dd>{formatAlertTime(alert.publishedAt, location.timezone)}</dd>
                          </div>
                        ) : null}
                        {alert.effectiveAt ? (
                          <div>
                            <dt>Effective</dt>
                            <dd>{formatAlertTime(alert.effectiveAt, location.timezone)}</dd>
                          </div>
                        ) : null}
                        {alert.onsetAt ? (
                          <div>
                            <dt>Onset</dt>
                            <dd>{formatAlertTime(alert.onsetAt, location.timezone)}</dd>
                          </div>
                        ) : null}
                        {alert.expiresAt ? (
                          <div>
                            <dt>Expires</dt>
                            <dd>{formatAlertTime(alert.expiresAt, location.timezone)}</dd>
                          </div>
                        ) : null}
                        {alert.endsAt ? (
                          <div>
                            <dt>Ends</dt>
                            <dd>{formatAlertTime(alert.endsAt, location.timezone)}</dd>
                          </div>
                        ) : null}
                      </dl>
                      <a href={alert.sourceUrl} target="_blank" rel="noreferrer">
                        View original alert
                      </a>
                    </article>
                  </li>
                ))}
              </ol>
            )}
          </>
        ) : null}
        <p className="severe-weather-attribution">
          Sources:{' '}
          <a
            href="https://www.weather.gov/documentation/services-web-alerts"
            target="_blank"
            rel="noreferrer"
          >
            U.S. National Weather Service
          </a>{' '}
          and{' '}
          <a
            href="https://eccc-msc.github.io/open-data/msc-data/alerts/readme_alerts-geomet_en/"
            target="_blank"
            rel="noreferrer"
          >
            Environment and Climate Change Canada
          </a>{' '}
          (ECCC data attribution; see the{' '}
          <a
            href="https://eccc-msc.github.io/open-data/licence/readme_en/"
            target="_blank"
            rel="noreferrer"
          >
            end-use licence
          </a>
          ; alert text and intent are reproduced without modification). Some marine products may be
          incomplete, and NWS alert endpoints omit SPC SEL tornado-watch wording. This feed is
          informational, not an emergency-alert service; follow local authorities and official
          source notices.
        </p>
      </section>
    </details>
  );
}
