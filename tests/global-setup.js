import { launchWordPress } from '../src/launcher.js';
import { chromium } from '@playwright/test';
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

  // Trigger discovery file creation by visiting an admin page
  // This ensures the discovery file exists before parallel tests run
  console.log('Global setup: Creating discovery file...');
  try {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Navigate to admin dashboard - this triggers the discovery file creation
    const adminUrl = `${wpInstance.url}/wp-admin/`;
    await page.goto(adminUrl, { waitUntil: 'commit', timeout: 30000 });

    // Wait for the discovery file to be written
    await page.waitForTimeout(2000);

    // Verify the discovery file exists
    const discoveryUrl = `${wpInstance.url}/wp-content/big-mistake-discovery.json`;
    const discoveryResponse = await page.request.get(discoveryUrl);

    if (discoveryResponse.status() === 200) {
      const data = await discoveryResponse.json();
      const menuCount = data?.adminMenuItems?.length || 0;
      const submenuCount = data?.adminSubmenuItems?.length || 0;
      console.log(`✓ Discovery file created successfully (${menuCount} menu items, ${submenuCount} submenu items)`);
    } else {
      console.warn(`Warning: Discovery file returned status ${discoveryResponse.status()}`);
      console.warn('Discovery file will be created on first admin page access in tests');
    }

    await browser.close();
  } catch (error) {
    console.warn('Warning: Failed to create discovery file in global setup:', error.message);
    console.warn('Discovery file will be created on first admin page access in tests');
  }

  console.log('Global setup: WordPress data will be discovered lazily in tests (using Playwright page.request)');

  // Return the instance for teardown
  return wpInstance;
}

export default globalSetup;

