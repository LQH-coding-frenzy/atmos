import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'corepack pnpm --filter @atmos/web dev',
    url: 'http://127.0.0.1:3000',
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://auth-e2e.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'e2e-test',
    },
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
