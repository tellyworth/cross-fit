import { test, expect } from './wp-fixtures.js';
import {
  testWordPressPage,
  detectPHPErrors,
  readDebugLog,
} from './test-helpers.js';

/**
 * @fileoverview Internal tests - verify HTTP timeout error logging is working
 * These tests verify that HTTP timeout failures are logged to debug.log but NOT
 * displayed in page content (to prevent error cascades when testing real plugins).
 */
test.describe('HTTP Timeout Error Detection', { tag: '@internal' }, () => {

  test('should log HTTP timeout errors to debug.log but not display in page content', async ({ page, wpInstance }) => {
    // Use Big Mistake plugin to trigger an HTTP request that will timeout
    // The request goes to httpbin.org/delay/1 which is unique to this test
    const baseUrl = wpInstance.url.replace(/\/$/, '');
    // Use networkidle to ensure HTTP timeout completes before we check the log
    await page.goto(`${baseUrl}/?test_http_timeout=1`, { waitUntil: 'networkidle' });

    // Verify errors are logged to debug.log (filter by unique URL to avoid matching unrelated errors)
    const logContent = await readDebugLog(wpInstance, {
      filter: 'httpbin.org/delay/1',
      limit: 50,
    });
    expect(logContent).toBeTruthy();
    expect(logContent).toContain('HTTP request failed');
    expect(logContent).toMatch(/timeout|timed out/i);

    // Verify errors are NOT displayed in page content (to prevent error cascades)
    const pageContent = await page.content();
    const phpErrors = detectPHPErrors(pageContent);
    const httpTimeoutErrors = phpErrors.filter(err =>
      err.type === 'warning' &&
      (err.message.includes('HTTP request failed') ||
       err.message.includes('timeout') ||
       err.message.includes('timed out'))
    );
    expect(httpTimeoutErrors.length).toBe(0);
  });

  test('should log HTTP timeout errors using testWordPressPage helper', async ({ page, wpInstance }) => {
    // Use Big Mistake plugin to trigger an HTTP request that will timeout
    // Set header to trigger HTTP request during page rendering
    await page.setExtraHTTPHeaders({
      'X-Test-HTTP-Timeout': '1',
    });

    // Use the helper which automatically detects PHP errors
    // Use networkidle to ensure HTTP timeout completes before we check the log
    const result = await testWordPressPage(page, wpInstance, '/', {
      allowPHPErrors: true, // Allow PHP errors for this test (won't fail on detection)
      waitUntil: 'networkidle', // Wait for network activity to complete (including HTTP timeout)
      description: 'Testing HTTP timeout error logging with helper',
    });

    // Verify errors are logged to debug.log (filter by unique URL to avoid matching unrelated errors)
    const logContent = await readDebugLog(wpInstance, {
      filter: 'httpbin.org/delay/1',
      limit: 50,
    });
    expect(logContent).toBeTruthy();
    expect(logContent).toContain('HTTP request failed');
    expect(logContent).toMatch(/timeout|timed out/i);

    // Verify errors are NOT in page content (to prevent error cascades)
    expect(result.phpErrors).toBeDefined();
    expect(Array.isArray(result.phpErrors)).toBe(true);
    const httpTimeoutErrors = result.phpErrors.filter(err =>
      err.type === 'warning' &&
      (err.message.includes('HTTP request failed') ||
       err.message.includes('timeout') ||
       err.message.includes('timed out'))
    );
    expect(httpTimeoutErrors.length).toBe(0);
  });
});

