import { test as base } from '@playwright/test';
import { launchWordPress } from '../src/launcher.js';

/**
 * WordPress Playground fixture for Playwright Test
 * Provides a shared WordPress instance for all tests (worker-scoped)
 */
export const test = base.extend({
  wpInstance: [
    async ({}, use) => {
      // Launch WordPress instance once for all tests
      const wpInstance = await launchWordPress();

      // Provide to all tests
      await use(wpInstance);

      // Cleanup after all tests complete
      await wpInstance.stop();
    },
    { scope: 'worker' }, // Share across all tests in the worker
  ],
});

export { expect } from '@playwright/test';

