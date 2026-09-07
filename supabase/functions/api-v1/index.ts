import { Hono, type Context } from 'npm:hono@4.13.5';
import { cors } from 'npm:hono@4.13.5/cors';
import { secureHeaders } from 'npm:hono@4.13.5/secure-headers';
import { createClient } from 'npm:@supabase/supabase-js@2.114.0';
import {
  recommendActivity,
  type PlannerActivity,
  type PlannerConditions,
  type PlannerWindow,
} from '../_shared/planner.ts';
import {
  evaluateAlertConditions,
  type AlertCondition,
  type AlertWeatherFacts,
} from '../_shared/alert-evaluator.ts';

type Bindings = {
  CORS_ORIGIN?: string;
  RELEASE_ID?: string;
};

const app = new Hono<{ Bindings: Bindings }>().basePath('/api-v1');

function error(context: Context, code: string, message: string, status: 400 | 401 | 503) {
  return context.json(
    {
      error: {
        code,
        message,
        request_id:
          context.res.headers.get('x-request-id') ??
          context.req.header('x-request-id') ??
          crypto.randomUUID(),
      },
    },
    status,
  );
}

app.use('*', async (context, next) => {
  const requestId = context.req.header('x-request-id') ?? crypto.randomUUID();
  context.header('x-request-id', requestId);
  await next();
});

app.use(
  '*',
  cors({
    origin: (origin, context) => {
      const allowedOrigin = context.env.CORS_ORIGIN ?? 'http://127.0.0.1:3000';
      return origin === allowedOrigin ? origin : allowedOrigin;
    },
    allowHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
    allowMethods: ['GET', 'OPTIONS', 'POST'],
    maxAge: 86400,
  }),
);
app.use('*', secureHeaders());

app.get('/health', (context) => context.json({ status: 'ok' }));
app.get('/health/dependencies', (context) => context.json({ database: 'not_configured' }, 501));
app.get('/version', (context) => context.json({ release: context.env.RELEASE_ID ?? 'local' }));

app.post('/internal/notifications/deliver', async (context) => {
  if (context.req.header('x-internal-queue-secret') !== Deno.env.get('INTERNAL_QUEUE_SECRET')) {
    return error(context, 'UNAUTHORIZED', 'Internal authorization is required.', 401);
  }
  const body = (await context.req.json().catch(() => undefined)) as
    { version?: number; event_id?: string; delivery_id?: string; kind?: string } | undefined;
  if (body?.version !== 1 || body.kind !== 'weather-alert' || !body.event_id || !body.delivery_id) {
    return error(context, 'INVALID_MESSAGE', 'Notification message is invalid.', 400);
  }
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return error(context, 'DELIVERY_UNAVAILABLE', 'Delivery is unavailable.', 503);
  const client = createClient(url, key);
  const { data, error: updateError } = await client
    .from('notification_deliveries')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', body.delivery_id)
    .eq('event_id', body.event_id)
    .in('status', ['pending', 'retry'])
    .select('id')
    .maybeSingle();
  if (updateError) return error(context, 'DELIVERY_UNAVAILABLE', 'Delivery is unavailable.', 503);
  return context.json({ claimed: Boolean(data) });
});

app.post('/internal/notifications/reconcile', async (context) => {
  if (context.req.header('x-alert-cron-secret') !== Deno.env.get('ALERT_CRON_SECRET')) {
    return error(context, 'UNAUTHORIZED', 'Internal authorization is required.', 401);
  }
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return error(context, 'DELIVERY_UNAVAILABLE', 'Delivery is unavailable.', 503);
  const client = createClient(url, key);
  const now = new Date().toISOString();
  const { data, error: reconciliationError } = await client
    .from('notification_deliveries')
    .select('id, event_id, kind, attempt_count')
    .or(`status.eq.pending,and(status.eq.retry,next_attempt_at.lte.${now})`)
    .order('created_at', { ascending: true })
    .limit(100);
  if (reconciliationError) {
    return error(context, 'DELIVERY_UNAVAILABLE', 'Delivery is unavailable.', 503);
  }
  const gatewayUrl = Deno.env.get('GATEWAY_URL');
  const queueSecret = Deno.env.get('INTERNAL_QUEUE_SECRET');
  if (!gatewayUrl || !queueSecret)
    return error(context, 'DELIVERY_UNAVAILABLE', 'Delivery is unavailable.', 503);
  const deliveries = data ?? [];
  const published = await fetch(`${gatewayUrl}/internal/notifications/publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-queue-secret': queueSecret },
    body: JSON.stringify(
      deliveries.map((delivery) => ({
        version: 1,
        event_id: delivery.event_id,
        delivery_id: delivery.id,
        kind: delivery.kind,
        attempt_hint: delivery.attempt_count,
      })),
    ),
  });
  if (!published.ok) return error(context, 'DELIVERY_UNAVAILABLE', 'Delivery is unavailable.', 503);
  return context.json({ reconciled: deliveries.length });
});

app.get('/api/v1/me', async (context) => {
  const authorization = context.req.header('authorization');
  if (!authorization) {
    return error(context, 'UNAUTHORIZED', 'Authentication is required.', 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    return error(context, 'PROFILE_UNAVAILABLE', 'Profile is unavailable.', 503);
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) {
    return error(context, 'UNAUTHORIZED', 'Authentication is required.', 401);
  }

  const [{ data: profile, error: profileError }, { data: preferences, error: preferencesError }] =
    await Promise.all([
      client.from('profiles').select('id, display_name, created_at, updated_at').single(),
      client.from('user_preferences').select('units, timezone, theme, updated_at').single(),
    ]);
  if (profileError || preferencesError) {
    return error(context, 'PROFILE_UNAVAILABLE', 'Profile is unavailable.', 503);
  }

  return context.json({ profile, preferences });
});

const plannerActivities = new Set<PlannerActivity>([
  'running',
  'cycling',
  'hiking',
  'football',
  'photography',
  'beach',
  'commuting',
  'sightseeing',
  'picnic',
  'custom',
]);

type PlannerRequestActivity =
  { kind: Exclude<PlannerActivity, 'custom'>; name?: never } | { kind: 'custom'; name: string };

function parsePlannerActivity(value: unknown): PlannerRequestActivity | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;

  const { kind, name } = value as Record<string, unknown>;
  if (typeof kind !== 'string' || !plannerActivities.has(kind as PlannerActivity)) return undefined;
  if (kind === 'custom') {
    if (typeof name !== 'string' || name.trim().length === 0 || name.length > 100) return undefined;
    return { kind, name: name.trim() };
  }

  if (name !== undefined) return undefined;
  return { kind: kind as Exclude<PlannerActivity, 'custom'> };
}

// Temporary adapter for FEAT-PLAN-001. Values trace to MockWeatherProvider's Berlin
// dashboard fixture; UV and AQI are explicit deterministic stand-ins until live data arrives.
const mockDashboardPlannerConditions: PlannerConditions = {
  temperatureC: 20,
  apparentTemperatureC: 19,
  humidityPercent: 64,
  precipitationProbability: 5,
  condition: 'partly-cloudy',
  windSpeedKph: 13,
  uvIndex: 3,
  aqi: 42,
};

const mockDashboardPlannerWindows: PlannerWindow[] = [
  {
    ...mockDashboardPlannerConditions,
    startsAt: '2026-09-01T10:00:00.000Z',
    endsAt: '2026-09-01T11:00:00.000Z',
    temperatureC: 19,
  },
  {
    ...mockDashboardPlannerConditions,
    startsAt: '2026-09-01T12:00:00.000Z',
    endsAt: '2026-09-01T13:00:00.000Z',
    temperatureC: 23,
    apparentTemperatureC: 23,
  },
  {
    ...mockDashboardPlannerConditions,
    startsAt: '2026-09-01T15:00:00.000Z',
    endsAt: '2026-09-01T16:00:00.000Z',
    temperatureC: 24,
    apparentTemperatureC: 23,
    precipitationProbability: 40,
    condition: 'rain',
  },
];

app.post('/api/v1/planner/recommend', async (context) => {
  let body: { activity?: unknown };
  try {
    body = await context.req.json();
  } catch {
    return error(context, 'INVALID_REQUEST', 'A JSON request body is required.', 400);
  }

  const activity = parsePlannerActivity(body.activity);
  if (!activity) {
    return error(context, 'INVALID_ACTIVITY', 'A supported activity is required.', 400);
  }

  return context.json({
    activity,
    source: 'mock-dashboard',
    ...recommendActivity(
      activity.kind,
      mockDashboardPlannerConditions,
      mockDashboardPlannerWindows,
    ),
  });
});

const scheduledAlertMetrics = new Set<AlertCondition['metric']>([
  'temperature',
  'feels-like',
  'rain-probability',
  'wind',
  'thunderstorm',
  'freeze-risk',
  'extreme-heat',
]);

async function scheduledAlertFacts(
  latitude: number,
  longitude: number,
): Promise<AlertWeatherFacts> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set(
    'current',
    'temperature_2m,apparent_temperature,wind_speed_10m,weather_code',
  );
  url.searchParams.set('hourly', 'precipitation_probability');
  const response = await fetch(url);
  if (!response.ok) throw new Error('weather request failed');
  const data = (await response.json()) as {
    current: {
      temperature_2m: number;
      apparent_temperature: number;
      wind_speed_10m: number;
      weather_code: number;
    };
    hourly: { precipitation_probability: number[] };
  };
  const temperature = data.current.temperature_2m;
  return {
    temperature,
    'feels-like': data.current.apparent_temperature,
    'rain-probability': data.hourly.precipitation_probability[0] ?? 0,
    rainfall: 0,
    snowfall: 0,
    wind: data.current.wind_speed_10m,
    gust: 0,
    uv: 0,
    aqi: 0,
    'pm2.5': 0,
    visibility: 0,
    thunderstorm: [95, 96, 99].includes(data.current.weather_code),
    'freeze-risk': temperature <= 0,
    'extreme-heat': temperature >= 35,
    'provider-severe-weather-alert': false,
  };
}

app.post('/internal/alerts/evaluate', async (context) => {
  const schedulerSecret = Deno.env.get('ALERT_CRON_SECRET');
  if (!schedulerSecret || context.req.header('authorization') !== `Bearer ${schedulerSecret}`) {
    return error(context, 'UNAUTHORIZED', 'Authentication is required.', 401);
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey)
    return error(context, 'ALERTS_UNAVAILABLE', 'Alerts are unavailable.', 503);

  const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: rules, error: rulesError } = await client
    .from('alert_rules')
    .select('id, conditions, latitude, longitude')
    .eq('enabled', true)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);
  if (rulesError) return error(context, 'ALERTS_UNAVAILABLE', 'Alerts are unavailable.', 503);

  let triggered = 0;
  let skipped = 0;
  for (const rule of rules ?? []) {
    const conditions = rule.conditions as AlertCondition[];
    if (!conditions.every((condition) => scheduledAlertMetrics.has(condition.metric))) {
      skipped += 1;
      continue;
    }
    const facts = await scheduledAlertFacts(rule.latitude as number, rule.longitude as number);
    if (evaluateAlertConditions(conditions, facts).triggered) triggered += 1;
  }
  return context.json({ evaluated: (rules?.length ?? 0) - skipped, triggered, skipped });
});

app.notFound((context) =>
  context.json(
    {
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found.',
        request_id:
          context.res.headers.get('x-request-id') ??
          context.req.header('x-request-id') ??
          crypto.randomUUID(),
      },
    },
    404,
  ),
);

Deno.serve(app.fetch);
