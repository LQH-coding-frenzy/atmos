import { describe, expect, it } from 'vitest';
import { app } from './index';

describe('gateway', () => {
  it('returns cheap health and version responses with a request ID', async () => {
    const health = await app.request('http://localhost/health');
    const version = await app.request('http://localhost/version', undefined, {
      RELEASE_ID: 'abc123',
    });

    expect(health.status).toBe(200);
    expect(health.headers.get('x-request-id')).toBeTruthy();
    await expect(health.json()).resolves.toEqual({ status: 'ok' });
    await expect(version.json()).resolves.toEqual({ release: 'abc123' });
  });

  it('returns stable sanitized errors for unknown routes', async () => {
    const response = await app.request('http://localhost/nope');
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'NOT_FOUND', message: 'Route not found.' },
    });
  });
});
