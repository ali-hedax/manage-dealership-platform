import { defineConfig, devices } from '@playwright/test';
import { E2E_PASSWORD } from './playwright.config';

// The daily parts report flow needs an owner (confirming what the stock report
// covers). An owner changes the staff rules other suites rely on, so this suite
// has its own API with the synthetic seed's manager as owner.
const API_PORT = 4410;
const WEB_PORT = 3410;
const channel = process.env.PW_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined);

export default defineConfig({
  testDir: './e2e',
  testMatch: /daily-reports\.spec\.ts/,
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-daily' }]],
  outputDir: 'test-results-daily',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: 'fa-IR',
    timezoneId: 'Asia/Tehran',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], channel, viewport: { width: 1366, height: 860 } } }],
  webServer: [
    {
      command: 'node ../api/dist/main.js',
      url: `http://localhost:${API_PORT}/api/v1/health`,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 60_000,
      env: { APP_ENV: 'development', DB_DRIVER: 'pglite', PGLITE_DATA_DIR: 'memory://', SEED_DEMO_PASSWORD: E2E_PASSWORD, DEMO_OWNER_USERNAME: 'manager', API_PORT: String(API_PORT), NODE_ID: 'e2e-daily', LOGIN_RATE_LIMIT: '200', DAILY_SCHEDULER: 'false' },
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
