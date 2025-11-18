import { test as base } from '@playwright/test';

/**
 * WordPress Playground fixture for Playwright Test
 * Provides access to the shared WordPress instance launched in global setup
 *
 * Uses environment variable (WP_PLAYGROUND_URL) set by global setup
 * This is Playwright's recommended way to share setup data across workers
 */
export const test = base.extend({
  wpInstance: async ({}, use) => {
    // Read the WordPress URL from environment variable set by global setup
    const wpUrl = process.env.WP_PLAYGROUND_URL;

    if (!wpUrl) {
      throw new Error(
        'WordPress URL not found in environment. ' +
        'Ensure global setup has run and set WP_PLAYGROUND_URL.'
      );
    }

    // Get the full instance from global scope (includes server for playground access)
    const fullInstance = global.wpInstance;

    // Create a wpInstance object that provides the URL and server
    // The actual server is managed by global setup/teardown
    // Use environment variable for debug log path (accessible in worker processes)
    const debugLogPath = process.env.WP_PLAYGROUND_DEBUG_LOG || fullInstance?.debugLogPath || null;

    const wpInstance = {
      url: wpUrl,
      server: fullInstance?.server || null,
      debugLogPath: debugLogPath,
      discoveredData: global.wpDiscoveredData || {
        postTypes: null,
        listPageTypes: null,
        adminMenuItems: null,
      },
      stop: async () => {
        // No-op - cleanup is handled in global teardown
      },
    };

    // Provide to test
    await use(wpInstance);
  },
});

export { expect } from '@playwright/test';

