import { launchWordPress } from '../src/launcher.js';
import {
  discoverPostTypesFetch,
  discoverListPageTypesFetch,
  discoverAdminMenuItems,
} from './test-helpers.js';

/**
 * Global setup for Playwright tests
 * Launches WordPress Playground once to be shared across all workers
 *
 * Playwright's recommended pattern:
 * - Store simple data in environment variables (accessible to all workers)
 * - Store complex objects in global scope for teardown
 */
async function globalSetup() {
  console.log('Global setup: Launching WordPress Playground...');

  const wpInstance = await launchWordPress();

  // Store the URL in an environment variable for workers to access
  // This is Playwright's recommended way to share setup data
  process.env.WP_PLAYGROUND_URL = wpInstance.url;

  // Store the debug log path for workers to access
  if (wpInstance.debugLogPath) {
    process.env.WP_PLAYGROUND_DEBUG_LOG = wpInstance.debugLogPath;
  }

  // Store the instance on the global object so teardown can access it
  // The global object persists in this process between setup and teardown
  global.wpInstance = wpInstance;

  console.log(`Global setup: WordPress ready at ${wpInstance.url}`);

  // Initialize discovered data structure - will be populated lazily in tests
  // Discovery happens in tests using page.request which works correctly
  // (Node.js fetch has issues with redirects in Playground environment)
  global.wpDiscoveredData = {
    postTypes: null, // Will be discovered lazily in first test that needs it
    listPageTypes: null, // Will be discovered lazily in first test that needs it
    adminMenuItems: null, // Will be discovered lazily in first test that needs it
  };

  console.log('Global setup: WordPress data will be discovered lazily in tests (using Playwright page.request)');

  // Return the instance for teardown
  return wpInstance;
}

export default globalSetup;

