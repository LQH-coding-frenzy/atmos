import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';

type Bindings = {
  CORS_ORIGIN?: string;
  RELEASE_ID?: string;
};

export const app = new Hono<{ Bindings: Bindings }>();

app.use('*', async (context, next) => {
  const requestId = context.req.header('x-request-id') ?? crypto.randomUUID();
  context.header('x-request-id', requestId);
  await next();
});

app.use(
  '*',
  cors({
    origin: (origin, context) => {
      const allowedOrigin = context.env?.CORS_ORIGIN ?? 'http://127.0.0.1:3000';
      return origin === allowedOrigin ? origin : allowedOrigin;
    },
    allowMethods: ['GET', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Request-Id'],
    maxAge: 86400,
  }),
);
app.use('*', secureHeaders());

app.get('/health', (context) => context.json({ status: 'ok' }));
app.get('/version', (context) => context.json({ release: context.env.RELEASE_ID ?? 'local' }));

app.notFound((context) =>
  context.json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } }, 404),
);

export default app;
