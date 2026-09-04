import { Hono } from 'npm:hono@4.13.5';
import { cors } from 'npm:hono@4.13.5/cors';
import { secureHeaders } from 'npm:hono@4.13.5/secure-headers';

type Bindings = {
  CORS_ORIGIN?: string;
  RELEASE_ID?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

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
app.get('/health/dependencies', (context) => context.json({ database: 'degraded' }, 503));
app.get('/version', (context) => context.json({ release: context.env.RELEASE_ID ?? 'local' }));

app.notFound((context) =>
  context.json(
    {
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found.',
        request_id: context.res.headers.get('x-request-id'),
      },
    },
    404,
  ),
);

Deno.serve(app.fetch);
