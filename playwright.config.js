const { defineConfig, devices } = require('@playwright/test');

const externalBaseURL = process.env.TEST_BASE_URL;

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: externalBaseURL || 'http://127.0.0.1:8765',
    ...devices['Desktop Chrome'],
  },
  webServer: externalBaseURL ? undefined : {
    command: 'npm run build && python3 -m http.server 8765 --bind 127.0.0.1 --directory public',
    url: 'http://127.0.0.1:8765',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
