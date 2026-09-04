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

type Bindings = {
  CORS_ORIGIN?: string;
  RELEASE_ID?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

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
