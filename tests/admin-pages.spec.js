import { test, expect } from './wp-fixtures.js';
import {
  setupErrorTracking,
  navigateToAdminPage,
  checkSamePage,
  waitForAdminUI,
  waitForJavaScriptReady,
  getPageContentAndPHPErrors,
  checkAdminChrome,
  checkAuthentication,
  checkForPHPErrors,
  checkForJavaScriptErrors,
  checkDashboardNotices,
  compareScreenshotIfNeeded,
  normalizePath,
  loadDiscoveryDataSync,
  prepareAdminPagesToTest,
} from './test-helpers.js';

/**
 * @fileoverview Tests for authenticated WordPress admin pages
 */

// Load discovery data at file load time (synchronous)
// This allows us to use Playwright's forEach pattern to generate individual test() calls
// Reference: https://playwright.dev/docs/test-parameterize
const discoveryData = loadDiscoveryDataSync();
const adminPagesToTest = prepareAdminPagesToTest(discoveryData);

test.describe('WordPress Admin Pages', { tag: '@admin' }, () => {

  test.skip('should successfully submit POST request to change site options', async ({ page, wpInstance }) => {
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
        const url = normalizePath(wpInstance.url, pageItem.path);

        // Step 1: Set up error tracking
        const errorTracking = setupErrorTracking(page);

        try {
          // Step 2: Navigate to admin page (checks status internally, asserts no redirect)
          await navigateToAdminPage(page, url);

          // Step 2.5: Verify we're still on the requested page (catches plugin redirects)
          await checkSamePage(page, url);

          // Step 3: Wait for admin UI elements
          await waitForAdminUI(page);

          // Step 4: Wait for JavaScript to be ready
          await waitForJavaScriptReady(page);

          // Step 5: Get page content and detect PHP errors
          const { pageContent, phpErrors } = await getPageContentAndPHPErrors(page);

          // Step 6: Check admin chrome (does expect internally)
          await checkAdminChrome(page);

          // Step 7: Check authentication
          await checkAuthentication(page, pageItem.path);

          // Step 8: Check for PHP errors
          checkForPHPErrors(phpErrors, false, pageItem.path);

          // Step 9: Check for JavaScript errors
          checkForJavaScriptErrors(
            errorTracking.consoleErrors,
            errorTracking.pageErrors,
            false,
            false,
            pageItem.path
          );

          // Step 10: Check dashboard notices
          await checkDashboardNotices(page, pageItem.path);

          // Step 11: Compare screenshot if needed
          await compareScreenshotIfNeeded(page, pageItem.path, pageContent);
        } finally {
          // Cleanup error tracking listeners
          errorTracking.cleanup();
        }
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

