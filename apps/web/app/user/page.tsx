import type { Metadata } from 'next';
import { UserManagementPage } from '../../components/user-management-page';
import { browserGatewayOrigin } from '../../lib/gateway-origin';

export const metadata: Metadata = {
  title: 'User management | Atmos',
  description: 'Manage your Atmos account, saved places, and personal weather data.',
};

export default function UserPage() {
  return (
    <UserManagementPage
      gatewayOrigin={browserGatewayOrigin(process.env.VERCEL_ENV, process.env.ATMOS_GATEWAY_URL)}
    />
  );
}
