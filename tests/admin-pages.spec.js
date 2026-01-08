import { test, expect } from './wp-fixtures.js';
import {
  testWordPressAdminPage,
  discoverAllAdminSubmenuItems,
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

// Prepare admin menu items for parameterized tests
const adminMenuItemsToTest = discoveryData?.adminMenuItems
  ? discoveryData.adminMenuItems
      .map((menuItem) => {
        const url = new URL(menuItem.url);
        const path = url.pathname + url.search;
        return {
          path,
          title: menuItem.title,
          slug: menuItem.slug,
          description: `Admin menu: ${menuItem.title} (${menuItem.slug})`,
        };
      })
      .filter((item) => {
        // Exclude admin pages that trigger expected WordPress.org API connection errors
        const excludedPaths = [
          '/wp-admin/plugin-install.php',
          '/wp-admin/update-core.php',
        ];
        return !excludedPaths.includes(item.path);
      })
  : [];

// Prepare admin submenu items for parameterized tests (only in full mode)
const adminSubmenuItemsToTest = process.env.FULL_MODE === '1' && discoveryData?.adminSubmenuItems
  ? discoveryData.adminSubmenuItems
      .map((submenuItem) => {
        const submenuUrl = new URL(submenuItem.url);
        const submenuPath = submenuUrl.pathname + submenuUrl.search;
        return {
          path: submenuPath,
          title: submenuItem.title,
          slug: submenuItem.slug,
          description: `Admin submenu: ${submenuItem.title} (${submenuItem.slug})`,
        };
      })
      .filter((item) => {
        const excludedPaths = [
          '/wp-admin/plugin-install.php',
          '/wp-admin/update-core.php',
        ];
        return !excludedPaths.includes(item.path);
      })
  : [];

test.describe('WordPress Admin Pages', { tag: '@admin' }, () => {

  test('should access authenticated admin dashboard', { tag: '@smoke' }, async ({ page, wpInstance }) => {
    await testWordPressAdminPage(page, wpInstance, '/wp-admin/');
  });

  test('should access multiple admin pages', async ({ page, wpInstance }) => {
    // Test multiple admin pages
    await testWordPressAdminPage(page, wpInstance, '/wp-admin/');
    // Extend timeout after first page to allow for additional pages
    test.setTimeout(test.info().timeout + 30000); // Add 30 seconds

    await testWordPressAdminPage(page, wpInstance, '/wp-admin/options-general.php');
    // Add more admin pages easily:
    // await testWordPressAdminPage(page, wpInstance, '/wp-admin/edit.php');
    // await testWordPressAdminPage(page, wpInstance, '/wp-admin/upload.php');
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

  // Data provider pattern: Generate individual test() calls for each admin menu item
  // Using Playwright's parameterized tests pattern: https://playwright.dev/docs/test-parameterize
  // Discovery file is read synchronously at file load time, allowing us to use forEach
  test.describe('admin menu items', () => {
    // Generate individual test() calls for each menu item using forEach
    // This pattern creates separate test() calls that Playwright can run in parallel
    // Reference: https://playwright.dev/docs/test-parameterize
    adminMenuItemsToTest.forEach((menuItem) => {
      test(`admin menu: ${menuItem.title} (${menuItem.path})`, async ({ page, wpInstance }) => {
        await testWordPressAdminPage(page, wpInstance, menuItem.path, {
            description: menuItem.description,
        });
      });
    });

    // Fallback test if no items were discovered
    if (adminMenuItemsToTest.length === 0) {
      test('should discover admin menu items', async ({ page, wpInstance }) => {
        test.skip(true, 'No admin menu items discovered - discovery file may not have been generated');
      });
    }
  });

  // Data provider pattern for submenu items (only in full mode)
  // Using Playwright's parameterized tests pattern: https://playwright.dev/docs/test-parameterize
  test.describe('admin submenu items', () => {
    // Generate individual test() calls for each submenu item using forEach
    adminSubmenuItemsToTest.forEach((submenuItem) => {
      test(`admin submenu: ${submenuItem.title} (${submenuItem.path})`, async ({ page, wpInstance }) => {
        await testWordPressAdminPage(page, wpInstance, submenuItem.path, {
                  description: submenuItem.description,
        });
      });
    });

    // Fallback test if not in full mode or no items discovered
    if (process.env.FULL_MODE !== '1') {
      test('submenu items test (full mode only)', async () => {
        test.skip(true, 'Submenu items only tested in FULL_MODE=1');
      });
    } else if (adminSubmenuItemsToTest.length === 0) {
      test('should discover admin submenu items', async ({ page, wpInstance }) => {
        test.skip(true, 'No admin submenu items discovered - discovery file may not have been generated');
      });
    }
  });
});

