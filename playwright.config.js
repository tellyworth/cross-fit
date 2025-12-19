import { defineConfig } from '@playwright/test';
import os from 'os';

/**
 * Playwright configuration for WordPress E2E tests
 */
// Perf-tunable defaults (can override via env):
const TRACE = process.env.PW_TRACE || 'off'; // 'off' | 'on' | 'on-first-retry' | 'retain-on-failure'
const SCREENSHOT = process.env.PW_SCREENSHOT || 'off'; // 'off' | 'only-on-failure' | 'on'
const VIDEO = process.env.PW_VIDEO || 'off'; // 'off' | 'on' | 'on-first-retry' | 'retain-on-failure'
const LOCAL_WORKERS = process.env.PW_WORKERS
  ? parseInt(process.env.PW_WORKERS, 10)
  : Math.max(2, Math.min(4, Math.max(1, (os.cpus()?.length || 4) - 1)));

export default defineConfig({
  testDir: './tests',
  // Store all screenshots in a central test-snapshots directory
  snapshotPathTemplate: 'test-snapshots/{arg}{ext}',
  fullyParallel: true, // Run tests in parallel with multiple workers
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // By default, exclude internal self-tests unless explicitly included
  // Set INCLUDE_INTERNAL=1 to run @internal tests
  grep: (process.env.INCLUDE_INTERNAL === '1' || process.env.INCLUDE_INTERNAL === 'true')
    ? /@internal/
    : undefined,
  grepInvert: (process.env.INCLUDE_INTERNAL === '1' || process.env.INCLUDE_INTERNAL === 'true')
    ? undefined
    : /@internal/,
  // Use multiple workers - WordPress instance is shared via global setup
  workers: process.env.CI ? 2 : LOCAL_WORKERS,
  reporter: 'list',
  // Global setup/teardown for shared WordPress instance
  globalSetup: './tests/global-setup.js',
  globalTeardown: './tests/global-teardown.js',
  use: {
    headless: process.env.HEADLESS !== 'false',
    trace: TRACE,
    screenshot: SCREENSHOT,
    video: VIDEO,
    // Tighter timeouts reduce long hangs but keep reasonable defaults
    actionTimeout: process.env.PW_ACTION_TIMEOUT ? parseInt(process.env.PW_ACTION_TIMEOUT, 10) : undefined,
    navigationTimeout: process.env.PW_NAV_TIMEOUT ? parseInt(process.env.PW_NAV_TIMEOUT, 10) : undefined,
  },
  // Timeout settings
  timeout: 20000, // 20 seconds per test (reduced from 30s for faster feedback)
  expect: {
    timeout: 3000, // 3 seconds for assertions (reduced from 5s)
    // Screenshot comparison settings (default threshold - can be overridden per call)
    toHaveScreenshot: {
      // Default threshold - individual calls can override this
      threshold: 0.05, // 5% default (matches what we use in test helpers)
    },
  },
});

