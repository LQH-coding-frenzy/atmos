import { Hono, type Context } from 'npm:hono@4.13.5';
import { cors } from 'npm:hono@4.13.5/cors';
import { secureHeaders } from 'npm:hono@4.13.5/secure-headers';
import { createClient } from 'npm:@supabase/supabase-js@2.114.0';
import { createCorrelation } from '../_shared/correlation.ts';
import { validateAccountDeletionRequest } from '../_shared/account-deletion.mjs';
import {
  databaseDependencyIsHealthy,
  defaultSupabasePublishableKey,
} from '../_shared/dependency-health.ts';
import { exportOtlpTrace } from '../_shared/otel.ts';
import {
  parseAlertRuleEnabledUpdate,
  parseAlertRuleInsert,
  parseAlertRuleLocation,
} from '../_shared/alert-rules.ts';
import {
  parseWeatherHistoryQuery,
  parseWeatherSnapshotInsert,
} from '../_shared/weather-snapshot.ts';
import { parseReplaceSavedLocationPreferences } from '../_shared/saved-location-preferences.ts';
import { parseProfilePreferencesUpdate } from '../_shared/profile-preferences.ts';
import { appRoleFromMetadata } from '../_shared/app-role.ts';

type Bindings = {
  CORS_ORIGIN?: string;
  RELEASE_ID?: string;
};

type Variables = {
  requestId: string;
  traceparent: string;
};

declare const EdgeRuntime:
  | {
      waitUntil(promise: Promise<unknown>): void;
    }
  | undefined;

export const app = new Hono<{ Bindings: Bindings; Variables: Variables }>().basePath('/api-v1');

function error(
  context: Context,
  code: string,
  message: string,
  status: 400 | 401 | 404 | 409 | 503,
) {
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
    allowMethods: ['DELETE', 'GET', 'OPTIONS', 'PATCH', 'POST'],
    maxAge: 86400,
  }),
);
app.use('*', secureHeaders());
app.use('*', async (context, next) => {
  const startTimeUnixNano = (BigInt(Date.now()) * 1_000_000n).toString();
  try {
    await next();
  } finally {
    const endTimeUnixNano = (BigInt(Date.now()) * 1_000_000n).toString();
    const endpoint = Deno.env.get('OTEL_EXPORTER_OTLP_ENDPOINT');
    const headers = Deno.env.get('OTEL_EXPORTER_OTLP_HEADERS');
    const telemetryTask = exportOtlpTrace(
      {
        traceparent: context.get('traceparent'),
        method: context.req.method,
        route: context.req.routePath ?? 'unmatched',
        statusCode: context.res.status,
        startTimeUnixNano,
        endTimeUnixNano,
        releaseId: context.env.RELEASE_ID ?? Deno.env.get('RELEASE_ID'),
      },
      {
        endpoint,
        headers,
      },
    );
    try {
      if (endpoint && headers && typeof EdgeRuntime !== 'undefined') {
        EdgeRuntime.waitUntil(telemetryTask);
      } else {
        void telemetryTask;
      }
    } catch {
      void telemetryTask;
    }
  }
});

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

async function readBoundedJson(request: Request, maximumBytes: number): Promise<unknown> {
  const contentLength = request.headers.get('content-length');
  if (contentLength && Number(contentLength) > maximumBytes) return undefined;
  const reader = request.body?.getReader();
  if (!reader) return undefined;

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(value);
    }
  } catch {
    return undefined;
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return undefined;
  }
}

app.get('/api/v1/me', async (context) => {
  context.header('cache-control', 'private, no-store');
  const authorization = context.req.header('authorization');
  if (!authorization) {
    return error(context, 'UNAUTHORIZED', 'Authentication is required.', 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const publishableKey = defaultSupabasePublishableKey(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'));
  if (!supabaseUrl || !publishableKey) {
    return error(context, 'PROFILE_UNAVAILABLE', 'Profile is unavailable.', 503);
  }

  const client = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) {
    return error(context, 'UNAUTHORIZED', 'Authentication is required.', 401);
  }

  const [{ data: profile, error: profileError }, { data: preferences, error: preferencesError }] =
    await Promise.all([
      client
        .from('profiles')
        .select('id, display_name, created_at, updated_at')
        .eq('id', userData.user.id)
        .single(),
      client
        .from('user_preferences')
        .select('units, timezone, theme, updated_at')
        .eq('user_id', userData.user.id)
        .single(),
    ]);
  if (profileError || preferencesError) {
    return error(context, 'PROFILE_UNAVAILABLE', 'Profile is unavailable.', 503);
  }

  return context.json({
    role: appRoleFromMetadata(userData.user.app_metadata),
    profile,
    preferences,
  });
});

app.patch('/api/v1/me', async (context) => {
  context.header('cache-control', 'private, no-store');
  if (!context.req.header('authorization')) {
    return error(context, 'UNAUTHORIZED', 'Authentication is required.', 401);
  }
  if (
    !Deno.env.get('SUPABASE_URL') ||
    !defaultSupabasePublishableKey(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'))
  ) {
    return error(context, 'PROFILE_UNAVAILABLE', 'Profile is unavailable.', 503);
  }

  const authenticated = await authenticatedClient(context);
  if (!authenticated) return error(context, 'UNAUTHORIZED', 'Authentication is required.', 401);

  const update = parseProfilePreferencesUpdate(await readBoundedJson(context.req.raw, 4096));
  if (!update) {
    return error(
      context,
      'INVALID_PROFILE_UPDATE',
      'Valid profile and preference fields are required.',
      400,
    );
  }

  const updatedAt = new Date().toISOString();
  if (update.display_name !== undefined) {
    const { data, error: updateError } = await authenticated.client
      .from('profiles')
      .update({ display_name: update.display_name, updated_at: updatedAt })
      .eq('id', authenticated.user.id)
      .select('id')
      .maybeSingle();
    if (updateError || !data) {
      return error(context, 'PROFILE_UNAVAILABLE', 'Profile is unavailable.', 503);
    }
  }

  const hasPreferenceUpdates =
    update.units !== undefined || update.timezone !== undefined || update.theme !== undefined;
  if (hasPreferenceUpdates) {
    const { data, error: updateError } = await authenticated.client
      .from('user_preferences')
      .update({
        ...(update.units === undefined ? {} : { units: update.units }),
        ...(update.timezone === undefined ? {} : { timezone: update.timezone }),
        ...(update.theme === undefined ? {} : { theme: update.theme }),
        updated_at: updatedAt,
      })
      .eq('user_id', authenticated.user.id)
      .select('user_id')
      .maybeSingle();
    if (updateError || !data) {
      return error(context, 'PROFILE_UNAVAILABLE', 'Profile is unavailable.', 503);
    }
  }

  const [{ data: profile, error: profileError }, { data: preferences, error: preferencesError }] =
    await Promise.all([
      authenticated.client
        .from('profiles')
        .select('id, display_name, created_at, updated_at')
        .eq('id', authenticated.user.id)
        .single(),
      authenticated.client
        .from('user_preferences')
        .select('units, timezone, theme, updated_at')
        .eq('user_id', authenticated.user.id)
        .single(),
    ]);
  if (profileError || preferencesError) {
    return error(context, 'PROFILE_UNAVAILABLE', 'Profile is unavailable.', 503);
  }
  return context.json({
    role: appRoleFromMetadata(authenticated.user.app_metadata),
    profile,
    preferences,
  });
});

app.delete('/api/v1/account', async (context) => {
  const authenticated = await authenticatedClient(context);
  if (!authenticated) return error(context, 'UNAUTHORIZED', 'Authentication is required.', 401);
  const body = (await context.req.json().catch(() => undefined)) as
    { confirmationEmail?: unknown; confirmationPhrase?: unknown } | undefined;
  const confirmationStatus = validateAccountDeletionRequest({
    accountEmail: authenticated.user.email,
    confirmationEmail: body?.confirmationEmail,
    confirmationPhrase: body?.confirmationPhrase,
    lastSignInAt: authenticated.user.last_sign_in_at,
  });
  if (confirmationStatus === 'confirmation-required') {
    return error(
      context,
      'ACCOUNT_CONFIRMATION_REQUIRED',
      'Confirm the account email and type DELETE to continue.',
      400,
    );
  }
  if (confirmationStatus === 'reauthentication-required') {
    return error(
      context,
      'ACCOUNT_REAUTH_REQUIRED',
      'Sign in again before deleting your account.',
      401,
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const projectSecretKey = Deno.env.get('PROJECT_SECRET_KEY');
  if (!supabaseUrl || !projectSecretKey) {
    return error(context, 'ACCOUNT_DELETION_UNAVAILABLE', 'Account deletion is unavailable.', 503);
  }
  const adminClient = createClient(supabaseUrl, projectSecretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const { error: deletionError } = await adminClient.auth.admin.deleteUser(authenticated.user.id);
  if (deletionError) {
    return error(context, 'ACCOUNT_DELETION_UNAVAILABLE', 'Account deletion is unavailable.', 503);
  }
  return context.body(null, 204);
});

async function authenticatedClient(context: Context) {
  const authorization = context.req.header('authorization');
  const url = Deno.env.get('SUPABASE_URL');
  const key = defaultSupabasePublishableKey(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'));
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
    .select(
      'id, name, latitude, longitude, created_at, updated_at, is_favorite, category, sort_order, is_default',
    )
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (queryError)
    return error(context, 'LOCATIONS_UNAVAILABLE', 'Saved locations are unavailable.', 503);
  const { data: preferences, error: preferencesError } = await authenticated.client
    .from('user_preferences')
    .select('saved_place_preferences_initialized')
    .eq('user_id', authenticated.user.id)
    .maybeSingle();
  if (preferencesError)
    return error(context, 'LOCATIONS_UNAVAILABLE', 'Saved locations are unavailable.', 503);
  return context.json({
    locations: data,
    preferencesInitialized: preferences?.saved_place_preferences_initialized ?? false,
  });
});

app.patch('/api/v1/locations/preferences', async (context) => {
  const authenticated = await authenticatedClient(context);
  if (!authenticated) return error(context, 'UNAUTHORIZED', 'Authentication is required.', 401);
  const preferences = parseReplaceSavedLocationPreferences(
    await context.req.json().catch(() => undefined),
  );
  if (!preferences)
    return error(
      context,
      'INVALID_LOCATION_PREFERENCES',
      'Valid saved-place preferences are required.',
      400,
    );
  const { data: owned, error: queryError } = await authenticated.client
    .from('saved_locations')
    .select('id')
    .eq('user_id', authenticated.user.id);
  if (queryError)
    return error(context, 'LOCATIONS_UNAVAILABLE', 'Saved locations are unavailable.', 503);
  const ownedIds = new Set((owned ?? []).map((location) => location.id));
  if (
    ownedIds.size !== preferences.locations.length ||
    preferences.locations.some((location) => !ownedIds.has(location.id))
  ) {
    return error(
      context,
      'LOCATION_PREFERENCES_STALE',
      'Saved places changed. Refresh them and try again.',
      409,
    );
  }
  const { error: updateError } = await authenticated.client.rpc(
    'replace_saved_location_preferences',
    {
      p_preferences: preferences.locations,
      p_default_location_id: preferences.defaultLocationId,
    },
  );
  if (updateError)
    return error(context, 'LOCATIONS_UNAVAILABLE', 'Saved-place preferences are unavailable.', 503);
  return context.body(null, 204);
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
    typeof body.latitude !== 'number' ||
    !Number.isFinite(body.latitude) ||
    typeof body.longitude !== 'number' ||
    !Number.isFinite(body.longitude) ||
    body.latitude < -90 ||
    body.latitude > 90 ||
    body.longitude < -180 ||
    body.longitude > 180
  ) {
    return error(context, 'INVALID_LOCATION', 'A valid saved location is required.', 400);
  }
  const { data: lastLocation, error: orderError } = await authenticated.client
    .from('saved_locations')
    .select('sort_order')
    .eq('user_id', authenticated.user.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (orderError)
    return error(context, 'LOCATIONS_UNAVAILABLE', 'Saved locations are unavailable.', 503);
  if ((lastLocation?.sort_order ?? -1) >= 99)
    return error(context, 'SAVED_LOCATION_LIMIT', 'An account can save up to 100 places.', 409);
  const { data, error: insertError } = await authenticated.client
    .from('saved_locations')
    .insert({
      user_id: authenticated.user.id,
      name: body.name.trim(),
      latitude: body.latitude,
      longitude: body.longitude,
      sort_order: (lastLocation?.sort_order ?? -1) + 1,
    })
    .select(
      'id, name, latitude, longitude, created_at, updated_at, is_favorite, category, sort_order, is_default',
    )
    .single();
  if (insertError)
    return error(context, 'LOCATIONS_UNAVAILABLE', 'Saved locations are unavailable.', 503);
  return context.json({ location: data }, 201);
});

app.patch('/api/v1/locations/:id', async (context) => {
  const authenticated = await authenticatedClient(context);
  if (!authenticated) return error(context, 'UNAUTHORIZED', 'Authentication is required.', 401);
  const id = context.req.param('id');
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)) {
    return error(context, 'INVALID_LOCATION_ID', 'A valid saved location ID is required.', 400);
  }
  const body = (await context.req.json().catch(() => undefined)) as { name?: string } | undefined;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (name.length < 1 || name.length > 120) {
    return error(
      context,
      'INVALID_LOCATION',
      'A saved location name between 1 and 120 characters is required.',
      400,
    );
  }
  const { data, error: updateError } = await authenticated.client
    .from('saved_locations')
    .update({ name })
    .eq('id', id)
    .eq('user_id', authenticated.user.id)
    .select(
      'id, name, latitude, longitude, created_at, updated_at, is_favorite, category, sort_order, is_default',
    )
    .maybeSingle();
  if (updateError) {
    return error(context, 'LOCATIONS_UNAVAILABLE', 'Saved locations are unavailable.', 503);
  }
  if (!data) return error(context, 'LOCATION_NOT_FOUND', 'Saved location was not found.', 404);
  return context.json({ location: data });
});

app.delete('/api/v1/locations/:id', async (context) => {
  const authenticated = await authenticatedClient(context);
  if (!authenticated) return error(context, 'UNAUTHORIZED', 'Authentication is required.', 401);
  const id = context.req.param('id');
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)) {
    return error(context, 'INVALID_LOCATION_ID', 'A valid saved location ID is required.', 400);
  }
  const { error: deleteError } = await authenticated.client
    .from('saved_locations')
    .delete()
    .eq('id', id)
    .eq('user_id', authenticated.user.id);
  if (deleteError) {
    return error(context, 'LOCATIONS_UNAVAILABLE', 'Saved locations are unavailable.', 503);
  }
  // RLS and the explicit owner filter make absent and other-user IDs indistinguishable.
  return context.body(null, 204);
});

app.get('/api/v1/weather/history', async (context) => {
  context.header('cache-control', 'private, no-store');
  const range = parseWeatherHistoryQuery(
    context.req.query('lat'),
    context.req.query('lon'),
    context.req.query('days'),
  );
  if (!range) {
    return error(
      context,
      'INVALID_HISTORY_RANGE',
      'Valid coordinates and a 7, 30, or 90 day range are required.',
      400,
    );
  }
  const authenticated = await authenticatedClient(context);
  if (!authenticated) return error(context, 'UNAUTHORIZED', 'Authentication is required.', 401);

  const since = new Date(Date.now() - range.days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error: queryError } = await authenticated.client
    .from('weather_snapshots')
    .select('id, latitude, longitude, observed_at, provider, payload, created_at')
    .eq('latitude', range.latitude)
    .eq('longitude', range.longitude)
    .gte('observed_at', since)
    .order('observed_at', { ascending: false })
    .limit(100);
  if (queryError) {
    return error(context, 'HISTORY_UNAVAILABLE', 'Weather history is unavailable.', 503);
  }
  return context.json({ snapshots: data });
});

app.post('/api/v1/weather/history', async (context) => {
  context.header('cache-control', 'private, no-store');
  const authenticated = await authenticatedClient(context);
  if (!authenticated) return error(context, 'UNAUTHORIZED', 'Authentication is required.', 401);

  const snapshot = parseWeatherSnapshotInsert(
    await context.req.json().catch(() => undefined),
    authenticated.user.id,
  );
  if (!snapshot) {
    return error(
      context,
      'INVALID_WEATHER_SNAPSHOT',
      'A valid current weather observation is required.',
      400,
    );
  }

  const { data, error: insertError } = await authenticated.client
    .from('weather_snapshots')
    .insert(snapshot)
    .select('id, latitude, longitude, observed_at, provider, payload, created_at')
    .single();
  if (insertError?.code === '23505') {
    return error(
      context,
      'SNAPSHOT_ALREADY_RECORDED',
      'This observation is already in your history.',
      409,
    );
  }
  if (insertError || !data) {
    return error(context, 'HISTORY_UNAVAILABLE', 'Weather history is unavailable.', 503);
  }
  return context.json({ snapshot: data }, 201);
});

app.delete('/api/v1/weather/history/:id', async (context) => {
  context.header('cache-control', 'private, no-store');
  const snapshotId = context.req.param('id');
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(snapshotId)
  ) {
    return error(context, 'INVALID_SNAPSHOT_ID', 'A valid snapshot ID is required.', 400);
  }
  const authenticated = await authenticatedClient(context);
  if (!authenticated) return error(context, 'UNAUTHORIZED', 'Authentication is required.', 401);

  const { data, error: deleteError } = await authenticated.client
    .from('weather_snapshots')
    .delete()
    .eq('id', snapshotId)
    .select('id')
    .maybeSingle();
  if (deleteError) {
    return error(context, 'HISTORY_UNAVAILABLE', 'Weather history is unavailable.', 503);
  }
  if (!data) return error(context, 'SNAPSHOT_NOT_FOUND', 'The observation was not found.', 404);
  return context.body(null, 204);
});

const alertRuleSelect =
  'id, location_id, latitude, longitude, conditions, schedule, notification_channels, enabled, created_at, updated_at';

app.get('/api/v1/alerts', async (context) => {
  context.header('cache-control', 'private, no-store');
  const location = parseAlertRuleLocation(context.req.query('lat'), context.req.query('lon'));
  if (!location) {
    return error(context, 'INVALID_LOCATION', 'Valid coordinates are required.', 400);
  }
  const authenticated = await authenticatedClient(context);
  if (!authenticated) return error(context, 'UNAUTHORIZED', 'Authentication is required.', 401);

  const { data, error: queryError } = await authenticated.client
    .from('alert_rules')
    .select(alertRuleSelect)
    .eq('latitude', location.latitude)
    .eq('longitude', location.longitude)
    .order('created_at', { ascending: false })
    .limit(50);
  if (queryError) return error(context, 'ALERTS_UNAVAILABLE', 'Alert rules are unavailable.', 503);
  return context.json({ rules: data });
});

app.post('/api/v1/alerts', async (context) => {
  context.header('cache-control', 'private, no-store');
  const authenticated = await authenticatedClient(context);
  if (!authenticated) return error(context, 'UNAUTHORIZED', 'Authentication is required.', 401);
  const rule = parseAlertRuleInsert(
    await context.req.json().catch(() => undefined),
    authenticated.user.id,
  );
  if (!rule) {
    return error(context, 'INVALID_ALERT_RULE', 'A supported in-app alert rule is required.', 400);
  }

  const { data, error: insertError } = await authenticated.client
    .from('alert_rules')
    .insert(rule)
    .select(alertRuleSelect)
    .single();
  if (insertError || !data) {
    return error(context, 'ALERTS_UNAVAILABLE', 'Alert rules are unavailable.', 503);
  }
  return context.json({ rule: data }, 201);
});

app.patch('/api/v1/alerts/:id', async (context) => {
  context.header('cache-control', 'private, no-store');
  const ruleId = context.req.param('id');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ruleId)) {
    return error(context, 'INVALID_ALERT_ID', 'A valid alert rule ID is required.', 400);
  }
  const authenticated = await authenticatedClient(context);
  if (!authenticated) return error(context, 'UNAUTHORIZED', 'Authentication is required.', 401);
  const update = parseAlertRuleEnabledUpdate(await context.req.json().catch(() => undefined));
  if (!update) return error(context, 'INVALID_ALERT_RULE', 'An enabled state is required.', 400);

  const { data, error: updateError } = await authenticated.client
    .from('alert_rules')
    .update(update)
    .eq('id', ruleId)
    .select(alertRuleSelect)
    .maybeSingle();
  if (updateError) {
    return error(context, 'ALERTS_UNAVAILABLE', 'Alert rules are unavailable.', 503);
  }
  if (!data) return error(context, 'ALERT_NOT_FOUND', 'The alert rule was not found.', 404);
  return context.json({ rule: data });
});

app.delete('/api/v1/alerts/:id', async (context) => {
  context.header('cache-control', 'private, no-store');
  const ruleId = context.req.param('id');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ruleId)) {
    return error(context, 'INVALID_ALERT_ID', 'A valid alert rule ID is required.', 400);
  }
  const authenticated = await authenticatedClient(context);
  if (!authenticated) return error(context, 'UNAUTHORIZED', 'Authentication is required.', 401);

  const { data, error: deleteError } = await authenticated.client
    .from('alert_rules')
    .delete()
    .eq('id', ruleId)
    .select('id')
    .maybeSingle();
  if (deleteError) {
    return error(context, 'ALERTS_UNAVAILABLE', 'Alert rules are unavailable.', 503);
  }
  if (!data) return error(context, 'ALERT_NOT_FOUND', 'The alert rule was not found.', 404);
  return context.body(null, 204);
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
