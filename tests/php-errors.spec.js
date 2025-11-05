import { test, expect } from './wp-fixtures.js';
import {
  testWordPressPage,
  detectPHPErrors,
} from './test-helpers.js';

test.describe('PHP Error Detection', () => {

  test('should detect PHP notice via Big Mistake plugin', async ({ page, wpInstance }) => {
    // Use Big Mistake plugin to trigger a PHP notice via GET parameter
    const baseUrl = wpInstance.url.replace(/\/$/, '');
    await page.goto(`${baseUrl}/?trigger_php_error=notice`, { waitUntil: 'networkidle' });
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
    await page.goto(`${baseUrl}/?trigger_php_error=warning`, { waitUntil: 'networkidle' });
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

    await page.goto(wpInstance.url, { waitUntil: 'networkidle' });
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
});

