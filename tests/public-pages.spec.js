import { test, expect } from './wp-fixtures.js';
import {
  setupErrorTracking,
  navigateToPage,
  checkSamePage,
  getPageContentAndPHPErrors,
  validatePageTitle,
  validateBodyClass,
  checkForPHPErrorsPublic,
  checkForJavaScriptErrorsPublic,
  compareScreenshotPublic,
  normalizePath,
  loadDiscoveryDataSync,
  preparePublicPagesToTest,
} from './test-helpers.js';

/**
 * @fileoverview Tests for public-facing WordPress pages
 */

// Load discovery data at file load time (synchronous)
// This allows us to use Playwright's forEach pattern to generate individual test() calls
// Reference: https://playwright.dev/docs/test-parameterize
const discoveryData = loadDiscoveryDataSync();
const publicPagesToTest = discoveryData ? preparePublicPagesToTest(discoveryData) : [];

test.describe('WordPress Public Pages', { tag: '@public' }, () => {
  // Data provider pattern: Generate individual test() calls for all public pages
  // Using Playwright's parameterized tests pattern: https://playwright.dev/docs/test-parameterize
  // Discovery file is read synchronously at file load time, allowing us to use forEach
  // Post items and list pages are combined into a single list; post items are filtered by FULL_MODE
  test.describe('public pages (discovered)', () => {
    // Generate individual test() calls for each page using forEach
    // This pattern creates separate test() calls that Playwright can run in parallel
    // Reference: https://playwright.dev/docs/test-parameterize
    publicPagesToTest.forEach((pageItem) => {
      test(`public page: ${pageItem.description} (${pageItem.path})`, { tag: pageItem.path === '/' ? '@smoke' : undefined }, async ({ page, wpInstance }) => {
        const url = normalizePath(wpInstance.url, pageItem.path);

        // Step 1: Set up error tracking
        const errorTracking = setupErrorTracking(page);

        try {
          // Step 2: Navigate to page (checks status internally, asserts no redirect)
          await navigateToPage(page, url, 'load', 200);

          // Step 2.5: Verify we're still on the requested page (catches plugin redirects)
          await checkSamePage(page, url);

          // Step 3: Get page content and detect PHP errors
          const { pageContent, phpErrors } = await getPageContentAndPHPErrors(page);

          // Step 4: Validate page title (if provided in discovery data)
          if (pageItem.title) {
            await validatePageTitle(page, pageItem.title);
          }

          // Step 5: Validate body class (if provided in discovery data)
          if (pageItem.bodyClass) {
            await validateBodyClass(page, pageItem.bodyClass);
          }

          // Step 6: Check for PHP errors
          checkForPHPErrorsPublic(phpErrors, false);

          // Step 7: Check for JavaScript errors
          checkForJavaScriptErrorsPublic(
            errorTracking.consoleErrors,
            errorTracking.pageErrors,
            false,
            false
          );

          // Step 8: Compare screenshot if needed
          await compareScreenshotPublic(page, pageItem.path, pageContent, false);
        } finally {
          // Cleanup error tracking listeners
          errorTracking.cleanup();
        }
      });
    });

    // Fallback test if no items were discovered
    if (publicPagesToTest.length === 0) {
      test('should discover public pages', async ({ page, wpInstance }) => {
        test.skip(true, 'No public pages discovered - discovery file may not have been generated');
      });
    }
  });
});
