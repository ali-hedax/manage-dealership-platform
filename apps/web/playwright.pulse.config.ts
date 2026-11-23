import { defineConfig, devices } from '@playwright/test';
import { E2E_PASSWORD } from './playwright.config';

// Manage Pulse and «پذیرش و ترخیص» (spec section 26): an API with PULSE_ENABLED, an owner and the
// synthetic receptions of the demo seed. No worker runs and nothing connects to کسب‌وکار.
const API_PORT = 4420;
const WEB_PORT = 3420;
const channel = process.env.PW_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined);

export default defineConfig({
  testDir: './e2e',
  testMatch: /pulse\.spec\.ts/,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-pulse' }]],
  outputDir: 'test-results-pulse',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: 'fa-IR',
    timezoneId: 'Asia/Tehran',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], channel, viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: 'node ../api/dist/main.js',
      url: `http://localhost:${API_PORT}/api/v1/health`,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 60_000,
      env: {
        APP_ENV: 'development', DB_DRIVER: 'pglite', PGLITE_DATA_DIR: 'memory://', SEED_DEMO_PASSWORD: E2E_PASSWORD, DEMO_OWNER_USERNAME: 'manager',
        API_PORT: String(API_PORT), NODE_ID: 'e2e-pulse', LOGIN_RATE_LIMIT: '200', DAILY_SCHEDULER: 'false', DEMO_FLEET: 'false',
        PULSE_ENABLED: 'true', PULSE_SECRET_KEY: `e2e-synthetic-only-${'k'.repeat(24)}`,
      },
    },
    {
      command: `pnpm exec next start --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}/login`,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 60_000,
      env: { API_INTERNAL_URL: `http://localhost:${API_PORT}` },
    },
  ],
});
