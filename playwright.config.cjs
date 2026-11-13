/**
 * GEOVENTRA — Playwright E2E configuration.
 *
 * The suite runs against a deterministic, isolated stack:
 *   - API on http://localhost:4100 against the `geoventra_test` database
 *   - Web on http://localhost:3100 (production build, started from apps/web)
 *
 * `global-setup.ts` migrates + seeds the test database and installs the deterministic
 * fixture (live positions for the three seeded vehicles, a completed trip with GPS points,
 * a second empty organisation for the authorisation test).
 */

const { defineConfig, devices } = require('@playwright/test');
const path = require('node:path');

const REPO_ROOT = __dirname;

module.exports = defineConfig({
  testDir: path.join(REPO_ROOT, 'tests/e2e'),
  testMatch: /\.spec\.(cjs|js|ts)$/,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  globalSetup: './tests/e2e/global-setup.ts',

  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
    video: 'off',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      command: 'node apps/api/dist/main.js',
      cwd: REPO_ROOT,
      port: 4100,
      reuseExistingServer: true,
      timeout: 60_000,
      env: {
        DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://geoventra@localhost:5432/geoventra_test',
        DATABASE_SCHEMA: 'geoventra',
        INGEST_SHARED_SECRET: 'integration-ingest-key',
        JWT_ACCESS_SECRET: 'integration-access-secret',
        JWT_ACCESS_TTL_SECONDS: '900',
        CORS_ORIGIN: 'http://localhost:3100,http://localhost:3000',
        PORT: '4100',
      },
    },
    {
      command: './node_modules/.bin/next start -p 3100',
      cwd: path.join(REPO_ROOT, 'apps/web'),
      port: 3100,
      reuseExistingServer: true,
      timeout: 60_000,
      env: {
        GEOVENTRA_API_URL: 'http://localhost:4100/api/v1',
        GEOVENTRA_WS_URL: 'http://localhost:4100',
      },
    },
  ],
});
