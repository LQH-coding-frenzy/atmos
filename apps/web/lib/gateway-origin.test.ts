import { describe, expect, it } from 'vitest';
import { browserGatewayOrigin, serverGatewayOrigin } from './gateway-origin';

describe('production gateway origins', () => {
  it('keeps the first server-rendered request on the stable unkeyed Worker hostname', () => {
    expect(serverGatewayOrigin('production')).toBe('https://atmos-gateway.rainify.workers.dev');
  });

  it('sends production browser requests through the zone-routed affinity hostname', () => {
    expect(browserGatewayOrigin('production')).toBe('https://api.rainify.dpdns.org');
  });

  it('honors the configured gateway override outside Production', () => {
    const override = 'https://atmos-gateway-staging.rainify.workers.dev';
    expect(serverGatewayOrigin('preview', override)).toBe(override);
    expect(browserGatewayOrigin('preview', override)).toBe(override);
  });

  it('uses the stable Worker hostname when no non-production override is set', () => {
    expect(serverGatewayOrigin('development')).toBe('https://atmos-gateway.rainify.workers.dev');
    expect(browserGatewayOrigin('development')).toBe('https://atmos-gateway.rainify.workers.dev');
  });
});
