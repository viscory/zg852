const { defineConfig, devices } = require('@playwright/test');

const externalBaseURL = process.env.TEST_BASE_URL;
// Single source of truth for the local preview server and its health-check URL.
const PORT = 8765;
const baseURL = `http://127.0.0.1:${PORT}`;

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'list',
  // Two workers everywhere keeps the map/WebGL cases from starving each other
  // and makes a plain local `npm test` behave like CI instead of oversubscribing
  // the dev server on high-core machines.
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: externalBaseURL || baseURL,
    ...devices['Desktop Chrome'],
  },
  // Tests must run against the built public/ output, never the source tree, so
  // the webServer always rebuilds before serving.
  webServer: externalBaseURL ? undefined : {
    command: `npm run build && node scripts/serve-headers.mjs`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30000,
  },
});
