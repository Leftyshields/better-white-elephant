import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for E2E tests
 * Leverages simulation mode for automated game testing
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  
  use: {
    baseURL: 'http://localhost:5173',
    // Disable traces to prevent capturing sensitive data (API keys, tokens, etc.)
    // Traces can be enabled manually for debugging: trace: 'on-first-retry'
    trace: 'off',
    screenshot: 'only-on-failure',
    // Run in headless mode even for UI tests (the UI web server runs separately)
    headless: true,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
