import { test, expect } from './wp-fixtures.js';
import {
  testWordPressAdminPage,
} from './test-helpers.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';

/**
 * @fileoverview Tests for authenticated WordPress admin pages
 */

// Read discovery file synchronously at file load time
// This allows us to use Playwright's forEach pattern to generate individual test() calls
// Reference: https://playwright.dev/docs/test-parameterize
function loadDiscoveryDataSync() {
  // Derive discovery file path from debug log path (both are in wp-content)
  const debugLogPath = process.env.WP_PLAYGROUND_DEBUG_LOG;
  if (!debugLogPath) {
    console.warn('Warning: WP_PLAYGROUND_DEBUG_LOG not set, discovery file cannot be loaded synchronously');
    return null;
  }

  // Discovery file is in the same directory as debug.log
  const discoveryFilePath = join(dirname(debugLogPath), 'big-mistake-discovery.json');

  if (!existsSync(discoveryFilePath)) {
    console.warn(`Warning: Discovery file not found at ${discoveryFilePath}`);
    return null;
  }

  try {
    const fileContent = readFileSync(discoveryFilePath, 'utf8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.warn(`Warning: Failed to read or parse discovery file: ${error.message}`);
    return null;
  }
}

// Load discovery data at file load time (synchronous)
const discoveryData = loadDiscoveryDataSync();

// Combine menu and submenu items into a single list for unified testing
// Submenu items are only included in FULL_MODE
function prepareAdminPagesToTest(discoveryData) {
  const allPages = [];

  // Add menu items
  if (discoveryData?.adminMenuItems) {
    for (const menuItem of discoveryData.adminMenuItems) {
      const url = new URL(menuItem.url);
      const path = url.pathname + url.search;
      allPages.push({
        path,
        title: menuItem.title,
        slug: menuItem.slug,
        description: `Admin menu: ${menuItem.title} (${menuItem.slug})`,
      });
    }
  }

  // Add submenu items (only in full mode)
  if (process.env.FULL_MODE === '1' && discoveryData?.adminSubmenuItems) {
    for (const submenuItem of discoveryData.adminSubmenuItems) {
      const submenuUrl = new URL(submenuItem.url);
      const submenuPath = submenuUrl.pathname + submenuUrl.search;
      allPages.push({
        path: submenuPath,
        title: submenuItem.title,
        slug: submenuItem.slug,
        description: `Admin submenu: ${submenuItem.title} (${submenuItem.slug})`,
      });
    }
  }

  // Filter out excluded pages
  return allPages.filter((item) => {
    // Exclude pages that trigger expected WordPress.org API connection errors
    const apiErrorPaths = [
      '/wp-admin/plugin-install.php',
      '/wp-admin/update-core.php',
    ];
    if (apiErrorPaths.includes(item.path)) {
      return false;
    }

    // Exclude pages that have explicit tests with additional coverage
    // These pages are tested separately with more specific assertions
    const explicitTestPaths = [
      '/wp-admin/', // Tested by "should access authenticated admin dashboard"
      '/wp-admin/options-general.php', // Tested by "should successfully submit POST request to change site options"
    ];
    if (explicitTestPaths.includes(item.path)) {
      return false;
    }

    return true;
  });
}

const adminPagesToTest = prepareAdminPagesToTest(discoveryData);

test.describe('WordPress Admin Pages', { tag: '@admin' }, () => {

  // Explicit test for dashboard with smoke tag for quick validation
  // This page is excluded from the discovery loop since it has explicit coverage
  test('should access authenticated admin dashboard', { tag: '@smoke' }, async ({ page, wpInstance }) => {
    await testWordPressAdminPage(page, wpInstance, '/wp-admin/');
  });

  test('should successfully submit POST request to change site options', async ({ page, wpInstance }) => {
    // Navigate to General Settings page
    const baseUrl = wpInstance.url.replace(/\/$/, '');
    const optionsPath = '/wp-admin/options-general.php';
    const optionsUrl = `${baseUrl}${optionsPath}`;

    test.setTimeout(30000);

    // Navigate and wait for the form field to be ready
    const optionsResponse = await page.goto(optionsUrl, { waitUntil: 'commit' });

    expect(optionsResponse.status()).toBe(200);

    // Wait for the form to be ready - check for any visible input field
    // Using start_of_week dropdown instead of blogdescription to avoid affecting frontend screenshots
    // start_of_week is a backend-only setting that doesn't appear on public pages
    await expect(page.locator('#start_of_week')).toBeVisible({ timeout: 15000 });

    // Get current week start value
    const currentStartOfWeek = await page.locator('#start_of_week').inputValue();

    // Generate a new test value (cycle through days: 0=Sunday, 1=Monday, etc.)
    // Use a different day to ensure the change is saved
    const days = ['0', '1', '2', '3', '4', '5', '6'];
    const currentIndex = days.indexOf(currentStartOfWeek);
    const newStartOfWeek = days[(currentIndex + 1) % days.length];

    // Select the new value
    await page.selectOption('#start_of_week', newStartOfWeek);

    // Submit the form
    await page.click('#submit');

    // Wait for form submission - wait for navigation and then for the field to be visible again
    // The field being visible indicates the page has reloaded after form submission
    await expect(page.locator('#start_of_week')).toBeVisible({ timeout: 15000 });

    // Check if the change was saved by reading the value again
    const savedStartOfWeek = await page.locator('#start_of_week').inputValue();

    expect(savedStartOfWeek).toBe(newStartOfWeek);
  });

  // Data provider pattern: Generate individual test() calls for all admin pages (menu + submenu)
  // Using Playwright's parameterized tests pattern: https://playwright.dev/docs/test-parameterize
  // Discovery file is read synchronously at file load time, allowing us to use forEach
  // Menu and submenu items are combined into a single list; submenu items are filtered by FULL_MODE
  test.describe('admin pages (discovered)', () => {
    // Generate individual test() calls for each page using forEach
    // This pattern creates separate test() calls that Playwright can run in parallel
    // Reference: https://playwright.dev/docs/test-parameterize
    adminPagesToTest.forEach((pageItem) => {
      test(`admin page: ${pageItem.title} (${pageItem.path})`, async ({ page, wpInstance }) => {
        await testWordPressAdminPage(page, wpInstance, pageItem.path, {
          description: pageItem.description,
        });
      });
    });

    // Fallback test if no items were discovered
    if (adminPagesToTest.length === 0) {
      test('should discover admin pages', async ({ page, wpInstance }) => {
        test.skip(true, 'No admin pages discovered - discovery file may not have been generated');
      });
    }
  });
});

