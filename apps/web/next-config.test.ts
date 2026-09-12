import { describe, expect, it } from 'vitest';
import nextConfig, { securityHeaders } from './next.config';

describe('web response security headers', () => {
  it('applies the hardened policy to every route', async () => {
    const rules = await nextConfig.headers?.();

    expect(rules).toEqual([{ source: '/(.*)', headers: securityHeaders }]);
    expect(Object.fromEntries(securityHeaders.map(({ key, value }) => [key, value]))).toMatchObject(
      {
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
      },
    );
  });

  it('restricts executable and embedding sources', () => {
    const policy = securityHeaders.find(({ key }) => key === 'Content-Security-Policy')?.value;

    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("connect-src 'self' https://*.supabase.co https://*.workers.dev");
  });
});
