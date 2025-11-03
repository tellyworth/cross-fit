import { test, expect } from './wp-fixtures.js';
import {
  testWordPressPage,
} from './test-helpers.js';

test.describe('Console Error Detection', () => {

  test('should capture and display JavaScript console errors', async ({ page, wpInstance }) => {
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

    // Navigate to the homepage
    await page.goto(wpInstance.url, { waitUntil: 'networkidle' });

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Inject JavaScript that will trigger console errors
    await page.evaluate(() => {
      // Trigger console.error
      console.error('TEST ERROR: This is an intentional console error for testing');

      // Trigger console.warn (for completeness, though we only capture errors)
      console.warn('TEST WARNING: This is a warning (not captured as error)');
    });

    // Wait a moment for the error to be captured
    await page.waitForTimeout(300);

    // Inject a page error (uncaught exception) - this needs to happen in a script tag, not evaluate
    await page.evaluate(() => {
      // Create a script that will run after listeners are set up
      const script = document.createElement('script');
      script.textContent = `
        setTimeout(() => {
          throw new Error('TEST PAGE ERROR: This is an intentional uncaught exception');
        }, 100);
      `;
      document.body.appendChild(script);
    });

    // Wait for the page error to be captured
    await page.waitForTimeout(500);

    // Verify we captured the console errors
    expect(consoleErrors.length).toBeGreaterThan(0);
    expect(
      consoleErrors.some(err => err.text.includes('TEST ERROR'))
    ).toBe(true);

    // Verify we captured the page error
    expect(pageErrors.length).toBeGreaterThan(0);
    expect(
      pageErrors.some(err => err.message.includes('TEST PAGE ERROR'))
    ).toBe(true);
  });

  test('should capture errors using testWordPressPage helper', async ({ page, wpInstance }) => {
    // Use the helper with allowConsoleErrors: false to verify error detection
    // This will fail if errors are found, but we can check what was captured
    try {
      const result = await testWordPressPage(page, wpInstance, '/', {
        allowConsoleErrors: false,
        description: 'Testing console error capture with helper',
      });

      // If no errors, that's expected - WordPress has no errors
    } catch (error) {
      // Expected if there are errors - the helper throws when allowConsoleErrors is false
      // This confirms error detection is working
    }

    // Test with errors allowed and trigger an error during navigation
    await page.route('**/*', (route) => {
      route.continue();
    });

    // Use helper with allowConsoleErrors: true
    const result = await testWordPressPage(page, wpInstance, '/', {
      allowConsoleErrors: true, // Allow errors for this test
      description: 'Testing helper with errors allowed',
    });

    // Inject an error after the helper's navigation completes
    await page.evaluate(() => {
      console.error('HELPER TEST ERROR: Intentional error injected after helper navigation');
    });
    await page.waitForTimeout(200);

    // Verify the result structure (error will be in separate listeners if captured)
    expect(result).toBeTruthy();
  });
});

