import { test, expect } from './wp-fixtures.js';
import { testWordPressAdminPage } from './test-helpers.js';

/**
 * @fileoverview Internal tests - verify compression test is disabled
 * These tests verify that the compression test AJAX request is not made on admin pages.
 */
test.describe('Compression Test Disabled', { tag: '@internal' }, () => {

  test('should not make compression test AJAX request on admin dashboard', async ({ page, wpInstance }) => {
    // Track all network requests
    const requests = [];
    const compressionTestRequests = [];

    // Monitor all requests
    page.on('request', (request) => {
      const url = request.url();
      requests.push({
        url,
        method: request.method(),
        resourceType: request.resourceType(),
      });

      // Check if this is a compression test request
      if (url.includes('wp-compression-test') || url.includes('action=wp-compression-test')) {
        compressionTestRequests.push({
          url,
          method: request.method(),
          resourceType: request.resourceType(),
        });
      }
    });

    // Load admin dashboard page
    await testWordPressAdminPage(page, wpInstance, '/wp-admin/');

    // Wait a bit for any delayed AJAX requests to fire
    await page.waitForTimeout(2000);

    // Verify no compression test requests were made
    expect(compressionTestRequests.length).toBe(0);

    // Log for debugging if test fails
    if (compressionTestRequests.length > 0) {
      console.error('Compression test requests found:');
      compressionTestRequests.forEach(req => {
        console.error(`  ${req.method} ${req.url} (${req.resourceType})`);
      });
    }
  });

  test('should not make compression test AJAX request on admin settings page', async ({ page, wpInstance }) => {
    // Track all network requests
    const requests = [];
    const compressionTestRequests = [];

    // Monitor all requests
    page.on('request', (request) => {
      const url = request.url();
      requests.push({
        url,
        method: request.method(),
        resourceType: request.resourceType(),
      });

      // Check if this is a compression test request
      if (url.includes('wp-compression-test') || url.includes('action=wp-compression-test')) {
        compressionTestRequests.push({
          url,
          method: request.method(),
          resourceType: request.resourceType(),
        });
      }
    });

    // Load admin settings page
    await testWordPressAdminPage(page, wpInstance, '/wp-admin/options-general.php');

    // Wait a bit for any delayed AJAX requests to fire
    await page.waitForTimeout(2000);

    // Verify no compression test requests were made
    expect(compressionTestRequests.length).toBe(0);

    // Log for debugging if test fails
    if (compressionTestRequests.length > 0) {
      console.error('Compression test requests found:');
      compressionTestRequests.forEach(req => {
        console.error(`  ${req.method} ${req.url} (${req.resourceType})`);
      });
    }
  });

  test('should verify compression test script is not present in page source', async ({ page, wpInstance }) => {
    // Load admin dashboard
    await testWordPressAdminPage(page, wpInstance, '/wp-admin/');

    // Check if compression test script is present in the page source
    // The script should not be output at all if we've properly disabled it
    const hasCompressionTestScript = await page.evaluate(() => {
      // Check for compression test script in page source
      const scripts = Array.from(document.querySelectorAll('script'));
      return scripts.some(script => {
        const text = script.textContent || script.innerHTML || '';
        return text.includes('wp-compression-test') || text.includes('compression_test');
      });
    });

    // The script should not be present in the page source
    // This verifies that our server-side prevention is working, not just client-side blocking
    expect(hasCompressionTestScript).toBe(false);
  });
});

