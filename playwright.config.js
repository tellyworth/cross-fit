import { defineConfig } from '@playwright/test';

/**
 * Playwright configuration for WordPress E2E tests
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // Run tests serially to avoid conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker to avoid WordPress instance conflicts
  reporter: 'list',
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

