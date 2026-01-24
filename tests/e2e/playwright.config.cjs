/**
 * Playwright configuration for E2E tests.
 * Uses Firefox with WebGPU enabled (headed mode required).
 * @type {import('@playwright/test').PlaywrightTestConfig}
 */
const { devices } = require('@playwright/test');

module.exports = {
  testDir: '.',
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false, // WebGPU tests need sequential execution
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'firefox-webgpu',
      use: {
        ...devices['Desktop Firefox'],
        headless: false, // WebGPU requires headed mode
        launchOptions: {
          firefoxUserPrefs: {
            'dom.webgpu.enabled': true,
            'gfx.webgpu.ignore-blocklist': true,
          },
        },
      },
    },
  ],

  // Auto-start dev server for tests
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
  },
};
