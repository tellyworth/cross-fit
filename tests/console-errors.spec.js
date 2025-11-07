import { test, expect } from './wp-fixtures.js';
import {
  testWordPressPage,
} from './test-helpers.js';

/**
 * @fileoverview Internal tests - verify JavaScript error detection is working
 * These tests verify that the error detection mechanisms themselves are functioning correctly.
 */
test.describe('Console Error Detection', { tag: '@internal' }, () => {

  test('should capture and display JavaScript console errors via Big Mistake plugin', async ({ page, wpInstance }) => {
    // Set up listeners BEFORE navigation to ensure we capture all errors
    const consoleErrors = [];
    const pageErrors = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push({
          text: msg.text(),
          location: msg.location(),
        });
      }
    });

    page.on('pageerror', (error) => {
      pageErrors.push({
        message: error.message,
        stack: error.stack,
      });
    });

    // Use Big Mistake plugin to trigger console error via GET parameter
    const baseUrl = wpInstance.url.replace(/\/$/, '');
    await page.goto(`${baseUrl}/?trigger_js_error=1&js_error_type=console`, { waitUntil: 'load' });
    await page.waitForTimeout(300);

    // Verify we captured the console errors
    expect(consoleErrors.length).toBeGreaterThan(0);
    expect(
      consoleErrors.some(err => err.text.includes('Big Mistake'))
    ).toBe(true);
  });

  test('should capture JavaScript uncaught exceptions via Big Mistake plugin', async ({ page, wpInstance }) => {
    // Set up listeners BEFORE navigation
    const pageErrors = [];

    page.on('pageerror', (error) => {
      pageErrors.push({
        message: error.message,
        stack: error.stack,
      });
    });

    // Use Big Mistake plugin to trigger uncaught exception via GET parameter
    const baseUrl = wpInstance.url.replace(/\/$/, '');
    await page.goto(`${baseUrl}/?trigger_js_error=1&js_error_type=exception`, { waitUntil: 'load' });
    await page.waitForTimeout(300);

    // Verify we captured the page error
    expect(pageErrors.length).toBeGreaterThan(0);
    expect(
      pageErrors.some(err => err.message.includes('Big Mistake'))
    ).toBe(true);
  });

  test('should capture errors using testWordPressPage helper with Big Mistake plugin', async ({ page, wpInstance }) => {
    // Set header to trigger JS error via Big Mistake plugin
    await page.setExtraHTTPHeaders({
      'X-Trigger-JS-Error': '1',
      'X-Trigger-JS-Error-Type': 'console',
    });

    // Use helper with allowConsoleErrors: true to capture errors
    const result = await testWordPressPage(page, wpInstance, '/', {
      allowConsoleErrors: true, // Allow errors for this test
      description: 'Testing helper with Big Mistake plugin JS errors',
    });

    // Verify the result structure and that errors were captured
    expect(result).toBeTruthy();
    expect(result.consoleErrors).toBeDefined();
    expect(Array.isArray(result.consoleErrors)).toBe(true);
    expect(result.consoleErrors.length).toBeGreaterThan(0);
    expect(
      result.consoleErrors.some(err => err.text.includes('Big Mistake'))
    ).toBe(true);
  });
});

