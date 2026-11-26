const { defineConfig, devices } = require('@playwright/test');

const externalBaseURL = process.env.TEST_BASE_URL;
// Single source of truth for the local preview server and its health-check URL.
const PORT = 8765;
const baseURL = `http://127.0.0.1:${PORT}`;

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'list',
  // Two CI workers keeps the map/WebGL cases from starving each other on the
  // shared runners without making the suite needlessly slow.
  workers: process.env.CI ? 2 : undefined,
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
