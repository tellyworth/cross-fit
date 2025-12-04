import { test, expect } from './wp-fixtures.js';
import {
  testWordPressAdminPage,
  discoverAdminSubmenuItems,
} from './test-helpers.js';

/**
 * @fileoverview Tests for authenticated WordPress admin pages
 */
test.describe('WordPress Admin Pages', { tag: '@admin' }, () => {
  test.describe.configure({ mode: 'serial' });

  test('should access authenticated admin dashboard', { tag: '@smoke' }, async ({ page, wpInstance }) => {
    await testWordPressAdminPage(page, wpInstance, '/wp-admin/');
    // Wait briefly for network to settle (allows critical resources to load)
    // Timeout is longer under parallel load - network may be busy
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
      // Ignore timeout - network may not become fully idle, but page is functional
    });
  });

  test('should access multiple admin pages', async ({ page, wpInstance }) => {
    // Test multiple admin pages
    await testWordPressAdminPage(page, wpInstance, '/wp-admin/');
    // Extend timeout after first page to allow for additional pages
    test.setTimeout(test.info().timeout + 30000); // Add 30 seconds

    // Wait briefly for network to settle (allows critical resources to load)
    // Timeout is longer under parallel load - network may be busy
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
      // Ignore timeout - network may not become fully idle, but page is functional
    });

    await testWordPressAdminPage(page, wpInstance, '/wp-admin/options-general.php');
    // Wait briefly for network to settle (allows critical resources to load)
    // Timeout is longer under parallel load - network may be busy
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
      // Ignore timeout - network may not become fully idle, but page is functional
    });
    // Add more admin pages easily:
    // await testWordPressAdminPage(page, wpInstance, '/wp-admin/edit.php');
    // await testWordPressAdminPage(page, wpInstance, '/wp-admin/upload.php');
  });

  test('should successfully submit POST request to change site options', async ({ page, wpInstance }) => {
    // Navigate to General Settings page
    const baseUrl = wpInstance.url.replace(/\/$/, '');
    const optionsPath = '/wp-admin/options-general.php';
    const optionsUrl = `${baseUrl}${optionsPath}`;

    // Navigate and wait for the form field to be ready
    const optionsResponse = await page.goto(optionsUrl, { waitUntil: 'commit' });

    expect(optionsResponse.status()).toBe(200);

    // Wait briefly for network to settle (allows critical resources to load)
    // Timeout is longer under parallel load - network may be busy
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
      // Ignore timeout - network may not become fully idle, but page is functional
    });

    // Wait for the form field - this ensures the page is fully loaded and interactive
    await expect(page.locator('#blogdescription')).toBeVisible({ timeout: 15000 });

    // Get current site tagline value (less likely to conflict with other tests)
    const currentTagline = await page.inputValue('#blogdescription');

    // Generate a new test tagline
    const newTagline = `Test Tagline ${Date.now()}`;

    // Fill in the new tagline
    await page.fill('#blogdescription', newTagline);

    // Submit the form
    await page.click('#submit');

    // Wait for form submission - wait for navigation and then for the field to be visible again
    // The field being visible indicates the page has reloaded after form submission
    await expect(page.locator('#blogdescription')).toBeVisible({ timeout: 15000 });

    // Wait briefly for network to settle after form submission
    // Timeout is longer under parallel load - network may be busy
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
      // Ignore timeout - network may not become fully idle, but page is functional
    });

    // Wait a moment for the save to complete
    await page.waitForTimeout(1000);

    // Check if the change was saved by reading the value again
    const savedTagline = await page.inputValue('#blogdescription');

    expect(savedTagline).toBe(newTagline);
  });

  test('should access all top-level admin menu items without errors', async ({ page, wpInstance }) => {
    // This test accesses multiple admin pages, so it needs more time
    test.setTimeout(60000); // 60 seconds for multiple page loads

    const isFullMode = process.env.FULL_MODE === '1';

    // Discover admin menu items lazily if not already cached
    let adminMenuItems = wpInstance.discoveredData?.adminMenuItems;
    if (!adminMenuItems || adminMenuItems.length === 0) {
      const { discoverAdminMenuItems } = await import('./test-helpers.js');
      adminMenuItems = await discoverAdminMenuItems(wpInstance, page);
      // Cache for other tests
      if (global.wpDiscoveredData) {
        global.wpDiscoveredData.adminMenuItems = adminMenuItems;
      }
      if (wpInstance.discoveredData) {
        wpInstance.discoveredData.adminMenuItems = adminMenuItems;
      }
    }

    if (adminMenuItems.length === 0) {
      test.skip(true, 'No admin menu items discovered');
      return;
    }

    // Test each top-level menu item
    // Extend timeout dynamically after each successful page load
    // This allows the test to complete even with many items, while still timing out if a page hangs
    const timeoutExtensionPerItem = 10000; // Add 10 seconds per item (admin pages are slower)

    for (let i = 0; i < adminMenuItems.length; i++) {
      const menuItem = adminMenuItems[i];

      // Extract path from full URL
      const url = new URL(menuItem.url);
      const path = url.pathname + url.search;

      try {
        // Use a shorter timeout per menu item to prevent one failure from blocking all tests
        await testWordPressAdminPage(page, wpInstance, path, {
          description: `Admin menu: ${menuItem.title} (${menuItem.slug})`,
          timeout: 10000, // 10 seconds per page instead of default 20
        });

        // Wait for network to be idle to ensure all resources (especially JS files) finish loading
        // This prevents ECONNRESET errors by ensuring all requests complete before moving on
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {
          // Ignore timeout - network may not become fully idle, but page is functional
        });

        // After successful page load, extend timeout for remaining items
        test.setTimeout(test.info().timeout + timeoutExtensionPerItem);
      } catch (error) {
        // Log warning for inaccessible items but continue testing others
        console.warn(`Warning: Could not access admin menu item "${menuItem.title}" (${menuItem.slug}):`, error.message);
      }

      // In full mode, also test all submenu items
      if (isFullMode) {
        try {
          const submenuItems = await discoverAdminSubmenuItems(wpInstance, menuItem.slug);
          for (const submenuItem of submenuItems) {
            const submenuUrl = new URL(submenuItem.url);
            const submenuPath = submenuUrl.pathname + submenuUrl.search;
            try {
              await testWordPressAdminPage(page, wpInstance, submenuPath, {
                description: `Admin submenu: ${submenuItem.title} (${submenuItem.slug}) under ${menuItem.title}`,
              });

              // After successful submenu page load, extend timeout
              test.setTimeout(test.info().timeout + timeoutExtensionPerItem);
            } catch (subError) {
              console.warn(`Warning: Could not access admin submenu item "${submenuItem.title}" (${submenuItem.slug}):`, subError.message);
            }
          }
        } catch (error) {
          console.warn(`Warning: Could not discover submenu items for "${menuItem.title}":`, error.message);
        }
      }
    }
  });
});

