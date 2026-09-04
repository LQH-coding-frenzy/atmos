import { Hono, type Context } from 'npm:hono@4.13.5';
import { cors } from 'npm:hono@4.13.5/cors';
import { secureHeaders } from 'npm:hono@4.13.5/secure-headers';
import { createClient } from 'npm:@supabase/supabase-js@2.114.0';

type Bindings = {
  CORS_ORIGIN?: string;
  RELEASE_ID?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

function error(context: Context, code: string, message: string, status: 401 | 503) {
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
    allowHeaders: ['Content-Type', 'X-Request-Id'],
    allowMethods: ['GET', 'OPTIONS'],
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

  const client = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: { headers: { Authorization: authorization } },
    },
  );
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
