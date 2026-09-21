import { Hono, type Context } from 'npm:hono@4.13.5';
import { cors } from 'npm:hono@4.13.5/cors';
import { secureHeaders } from 'npm:hono@4.13.5/secure-headers';
import { createClient } from 'npm:@supabase/supabase-js@2.114.0';
import { createCorrelation } from '../_shared/correlation.ts';
import { databaseDependencyIsHealthy } from '../_shared/dependency-health.ts';

type Bindings = {
  CORS_ORIGIN?: string;
  RELEASE_ID?: string;
};

type Variables = {
  requestId: string;
  traceparent: string;
};

export const app = new Hono<{ Bindings: Bindings; Variables: Variables }>().basePath('/api-v1');

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
  const correlation = createCorrelation(
    context.req.header('x-request-id'),
    context.req.header('traceparent'),
  );
  context.set('requestId', correlation.requestId);
  context.set('traceparent', correlation.traceparent);
  context.header('x-request-id', correlation.requestId);
  context.header('traceparent', correlation.traceparent);
  await next();
});

app.use(
  '*',
  cors({
    origin: (origin, context) => {
      const allowedOrigin = context.env.CORS_ORIGIN ?? 'http://127.0.0.1:3000';
      return origin === allowedOrigin ? origin : allowedOrigin;
    },
    allowHeaders: ['Authorization', 'Content-Type', 'Traceparent', 'X-Request-Id'],
    allowMethods: ['GET', 'OPTIONS', 'POST'],
    maxAge: 86400,
  }),
);
app.use('*', secureHeaders());

app.get('/health', (context) => context.json({ status: 'ok' }));
app.get('/health/dependencies', async (context) => {
  const healthy = await databaseDependencyIsHealthy(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'),
  );
  const response = healthy
    ? context.json({ status: 'ok', database: 'ok' })
    : context.json({ status: 'degraded', database: 'degraded' }, 503);
  response.headers.set('cache-control', 'no-store');
  return response;
});
app.get('/version', (context) =>
  context.json({ release: context.env.RELEASE_ID ?? Deno.env.get('RELEASE_ID') ?? 'local' }),
);

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

async function authenticatedClient(context: Context) {
  const authorization = context.req.header('authorization');
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_ANON_KEY');
  if (!authorization || !url || !key) return undefined;
  const client = createClient(url, key, { global: { headers: { Authorization: authorization } } });
  const { data } = await client.auth.getUser();
  return data.user ? { client, user: data.user } : undefined;
}

app.get('/api/v1/locations', async (context) => {
  const authenticated = await authenticatedClient(context);
  if (!authenticated) return error(context, 'UNAUTHORIZED', 'Authentication is required.', 401);
  const { data, error: queryError } = await authenticated.client
    .from('saved_locations')
    .select('id, name, latitude, longitude, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (queryError)
    return error(context, 'LOCATIONS_UNAVAILABLE', 'Saved locations are unavailable.', 503);
  return context.json({ locations: data });
});

app.post('/api/v1/locations', async (context) => {
  const authenticated = await authenticatedClient(context);
  if (!authenticated) return error(context, 'UNAUTHORIZED', 'Authentication is required.', 401);
  const body = (await context.req.json().catch(() => undefined)) as
    { name?: string; latitude?: number; longitude?: number } | undefined;
  if (
    !body ||
    typeof body.name !== 'string' ||
    body.name.length < 1 ||
    body.name.length > 120 ||
    !Number.isFinite(body.latitude) ||
    !Number.isFinite(body.longitude) ||
    body.latitude < -90 ||
    body.latitude > 90 ||
    body.longitude < -180 ||
    body.longitude > 180
  ) {
    return error(context, 'INVALID_LOCATION', 'A valid saved location is required.', 400);
  }
  const { data, error: insertError } = await authenticated.client
    .from('saved_locations')
    .insert({
      user_id: authenticated.user.id,
      name: body.name.trim(),
      latitude: body.latitude,
      longitude: body.longitude,
    })
    .select('id, name, latitude, longitude, created_at, updated_at')
    .single();
  if (insertError)
    return error(context, 'LOCATIONS_UNAVAILABLE', 'Saved locations are unavailable.', 503);
  return context.json({ location: data }, 201);
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

if (import.meta.main) {
  Deno.serve((request) =>
    app.fetch(request, {
      CORS_ORIGIN: Deno.env.get('CORS_ORIGIN'),
      RELEASE_ID: Deno.env.get('RELEASE_ID'),
    }),
  );
}
