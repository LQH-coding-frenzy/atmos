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
  const time = new Intl.DateTimeFormat('en', { hour: 'numeric', timeZone: location.timezone });

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
              className={activity === item ? 'active' : ''}
              onClick={() => setActivity(item)}
              aria-pressed={activity === item}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <p className="planner-summary">
        Best upcoming {activity} window: <strong>{plan.score}/100</strong>
      </p>
      <ol className="planner-windows">
        {plan.rankedWindows.map((window) => (
          <li key={window.startsAt}>
            <strong>{time.format(new Date(window.startsAt))}</strong>
            <span>{window.score}/100</span>
            <p>{window.factors.map((factor) => factor.explanation).join(' ')}</p>
          </li>
        ))}
      </ol>
    </article>
  );
}
