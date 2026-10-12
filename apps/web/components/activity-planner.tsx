'use client';

import type { Dashboard } from '@atmos/contracts';
import {
  planActivity,
  supportedPlannerActivities,
  type SupportedPlannerActivity,
} from '@atmos/domain';
import { useState } from 'react';

type ActivityPlannerProps = Pick<Dashboard, 'hourly' | 'location'>;

export function ActivityPlanner({ hourly, location }: ActivityPlannerProps) {
  const [activity, setActivity] = useState<SupportedPlannerActivity>('running');
  const plan = planActivity(activity, hourly);
  const time = new Intl.DateTimeFormat('en', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: location.timezone,
  });
  const date = new Intl.DateTimeFormat('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: location.timezone,
  });

  return (
    <article className="planner-card panel">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Weather intelligence</p>
          <h2>Plan an activity</h2>
        </div>
        <div className="metric-tabs" role="group" aria-label="Activity">
          {supportedPlannerActivities.map((item) => (
            <button
              key={item}
              type="button"
              className={activity === item ? 'active' : ''}
              onClick={() => setActivity(item)}
              aria-pressed={activity === item}
            >
              {item[0]?.toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <p className="planner-summary">
        Best upcoming {activity} window: <strong>{plan.score}/100</strong>
      </p>
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
