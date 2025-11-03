import { defineConfig } from '@playwright/test';

/**
 * Playwright configuration for WordPress E2E tests
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true, // Run tests in parallel with multiple workers
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Use multiple workers - WordPress instance is shared via global setup
  workers: process.env.CI ? 2 : 3, // 3 workers locally, 2 in CI
  reporter: 'list',
  // Global setup/teardown for shared WordPress instance
  globalSetup: './tests/global-setup.js',
  globalTeardown: './tests/global-teardown.js',
  use: {
    headless: process.env.HEADLESS !== 'false',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  // Timeout settings
  timeout: 30000, // 30 seconds per test
  expect: {
    timeout: 5000, // 5 seconds for assertions
  },
});

