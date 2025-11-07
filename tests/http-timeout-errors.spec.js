import { test, expect } from './wp-fixtures.js';
import {
  testWordPressPage,
  detectPHPErrors,
} from './test-helpers.js';

/**
 * @fileoverview Internal tests - verify HTTP timeout error detection is working
 * These tests verify that HTTP timeout failures trigger PHP errors correctly.
 */
test.describe('HTTP Timeout Error Detection', { tag: '@internal' }, () => {

  test('should detect PHP warnings from HTTP timeout failures', async ({ page, wpInstance }) => {
    // Use Big Mistake plugin to trigger an HTTP request that will timeout
    // during page rendering, ensuring the error appears in page content
    const baseUrl = wpInstance.url.replace(/\/$/, '');
    // Use networkidle for this test to ensure HTTP timeout errors are captured
    // The HTTP request happens during wp_head, so we need to wait for it to complete
    await page.goto(`${baseUrl}/?test_http_timeout=1`, { waitUntil: 'networkidle' });

    const pageContent = await page.content();
    const phpErrors = detectPHPErrors(pageContent);

    // Verify we detected PHP warnings related to HTTP timeouts
    // The error should appear in page content since it's triggered during rendering
    expect(phpErrors.length).toBeGreaterThan(0);
    expect(phpErrors.some(err =>
      err.type === 'warning' &&
      (err.message.includes('HTTP request failed') ||
       err.message.includes('timeout') ||
       err.message.includes('timed out'))
    )).toBe(true);
  });

  test('should capture HTTP timeout errors using testWordPressPage helper', async ({ page, wpInstance }) => {
    // Use Big Mistake plugin to trigger an HTTP request that will timeout
    // Set header to trigger HTTP request during page rendering
    await page.setExtraHTTPHeaders({
      'X-Test-HTTP-Timeout': '1',
    });

    // Use the helper which automatically detects PHP errors
    // Use networkidle to ensure HTTP timeout errors are captured in page content
    const result = await testWordPressPage(page, wpInstance, '/', {
      allowPHPErrors: true, // Allow PHP errors for this test (won't fail on detection)
      waitUntil: 'networkidle', // Wait for network activity to complete (including HTTP timeout)
      description: 'Testing HTTP timeout error detection with helper',
    });

    // Verify errors were detected
    expect(result.phpErrors).toBeDefined();
    expect(Array.isArray(result.phpErrors)).toBe(true);
    expect(result.phpErrors.length).toBeGreaterThan(0);
    expect(result.phpErrors.some(err =>
      err.type === 'warning' &&
      (err.message.includes('HTTP request failed') ||
       err.message.includes('timeout') ||
       err.message.includes('timed out'))
    )).toBe(true);
  });
});

