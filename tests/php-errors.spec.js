import { test, expect } from './wp-fixtures.js';
import {
  testWordPressPage,
  detectPHPErrors,
} from './test-helpers.js';

/**
 * @fileoverview Internal tests - verify PHP error detection is working
 * These tests verify that the PHP error detection mechanisms themselves are functioning correctly.
 */
test.describe('PHP Error Detection', { tag: '@internal' }, () => {

  test('should detect PHP notice via Big Mistake plugin', async ({ page, wpInstance }) => {
    // Use Big Mistake plugin to trigger a PHP notice via GET parameter
    const baseUrl = wpInstance.url.replace(/\/$/, '');
    await page.goto(`${baseUrl}/?trigger_php_error=notice`, { waitUntil: 'load' });
    const pageContent = await page.content();
    const phpErrors = detectPHPErrors(pageContent);

    // Verify we detected a PHP error
    expect(phpErrors.length).toBeGreaterThan(0);
    expect(phpErrors.some(err =>
      err.message.includes('undefined') ||
      err.type === 'notice' ||
      err.type === 'warning'
    )).toBe(true);
  });

  test('should detect PHP warning via Big Mistake plugin', async ({ page, wpInstance }) => {
    // Use Big Mistake plugin to trigger a PHP warning via GET parameter
    const baseUrl = wpInstance.url.replace(/\/$/, '');
    await page.goto(`${baseUrl}/?trigger_php_error=warning`, { waitUntil: 'load' });
    const pageContent = await page.content();
    const phpErrors = detectPHPErrors(pageContent);

    // Verify we detected a PHP warning
    expect(phpErrors.length).toBeGreaterThan(0);
    expect(phpErrors.some(err =>
      err.type === 'warning'
    )).toBe(true);
  });

  test('should detect PHP errors via X-Trigger-PHP-Error header', async ({ page, wpInstance }) => {
    // Use Big Mistake plugin to trigger a PHP notice via header
    await page.setExtraHTTPHeaders({
      'X-Trigger-PHP-Error': 'notice',
    });

    await page.goto(wpInstance.url, { waitUntil: 'load' });
    const pageContent = await page.content();
    const phpErrors = detectPHPErrors(pageContent);

    // Verify we detected a PHP error
    expect(phpErrors.length).toBeGreaterThan(0);
    expect(phpErrors.some(err =>
      err.message.includes('undefined') ||
      err.type === 'notice' ||
      err.type === 'warning'
    )).toBe(true);
  });

  test('should capture PHP errors using testWordPressPage helper', async ({ page, wpInstance }) => {
    // Use Big Mistake plugin via header to trigger error
    await page.setExtraHTTPHeaders({
      'X-Trigger-PHP-Error': 'notice',
    });

    // Use the helper which automatically detects PHP errors
    const result = await testWordPressPage(page, wpInstance, '/', {
      allowPHPErrors: true, // Allow PHP errors for this test (won't fail on detection)
      description: 'Testing PHP error detection with helper',
    });

    // Verify errors were detected
    expect(result.phpErrors).toBeDefined();
    expect(Array.isArray(result.phpErrors)).toBe(true);
    expect(result.phpErrors.length).toBeGreaterThan(0);
  });

  test('should detect PHP fatal error via non_existent_function() and return 500', async ({ page, wpInstance }) => {
    // Use Big Mistake plugin to trigger a PHP fatal error via GET parameter
    const baseUrl = wpInstance.url.replace(/\/$/, '');
    const response = await page.goto(`${baseUrl}/?trigger_php_error=fatal`, { waitUntil: 'load' });

    // Fatal errors should result in a 500 status code
    expect(response.status()).toBe(500);

    // Check that the error message appears in the page content
    const pageContent = await page.content();
    const phpErrors = detectPHPErrors(pageContent);

    // Verify we detected a PHP fatal error
    expect(phpErrors.length).toBeGreaterThan(0);
    expect(phpErrors.some(err =>
      err.type === 'fatal' ||
      err.message.includes('non_existent_function') ||
      err.message.includes('Call to undefined function')
    )).toBe(true);

    // Also verify the error message appears in the raw content
    expect(pageContent).toContain('non_existent_function');
  });
});

