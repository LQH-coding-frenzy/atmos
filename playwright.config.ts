import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'node tests/e2e/mock-weather-gateway.mjs',
      url: 'http://127.0.0.1:8790/health',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'corepack pnpm --filter @atmos/web dev',
      url: 'http://127.0.0.1:3000',
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://auth-e2e.supabase.co',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'e2e-test',
        VERCEL_ENV: 'development',
        ATMOS_SERVER_GATEWAY_URL: 'http://127.0.0.1:8790',
        ATMOS_GATEWAY_URL: 'http://127.0.0.1:3000',
        ATMOS_E2E_GATEWAY_URL: 'http://127.0.0.1:8790',
      },
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
