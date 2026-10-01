const stableGatewayOrigin = 'https://atmos-gateway.rainify.workers.dev';
const productionApiOrigin = 'https://api.rainify.dpdns.org';

export function serverGatewayOrigin(vercelEnv?: string, override?: string) {
  if (vercelEnv === 'production') return stableGatewayOrigin;
  return override ?? stableGatewayOrigin;
}

export function browserGatewayOrigin(vercelEnv?: string, override?: string) {
  if (vercelEnv === 'production') return productionApiOrigin;
  return override ?? stableGatewayOrigin;
}
