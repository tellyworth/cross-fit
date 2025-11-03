import { launchWordPress } from '../src/launcher.js';

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

  // Store the instance on the global object so teardown can access it
  // The global object persists in this process between setup and teardown
  global.wpInstance = wpInstance;

  console.log(`Global setup: WordPress ready at ${wpInstance.url}`);

  // Return the instance for teardown
  return wpInstance;
}

export default globalSetup;

