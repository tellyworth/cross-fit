import { test, expect } from './wp-fixtures.js';
import {
  testWordPressPage,
  detectPHPErrors,
} from './test-helpers.js';

test.describe('PHP Error Detection', () => {

  test('should detect PHP errors by triggering an actual error', async ({ page, wpInstance }) => {
    // Access the playground instance to execute PHP code that triggers an error
    const cliServer = wpInstance.server;

    if (!cliServer || !cliServer.playground) {
      test.skip();
      return;
    }

    // Trigger a PHP warning by accessing an undefined variable
    // This should appear in the rendered page when WP_DEBUG_DISPLAY is enabled
    try {
      await cliServer.playground.run({
        code: `<?php
          // Trigger a PHP warning - accessing undefined variable
          echo $undefined_variable;
        `,
      });
    } catch (error) {
      // The error might be caught, but it should still appear in page output
    }

    // Now navigate to a page that will execute PHP and display the error
    // We can use a custom endpoint or just check if errors appear on any page

    // Create a test page via WordPress API or directly execute PHP in a request
    // For now, let's check if we can trigger an error via a hook or filter

    // Actually, the simplest approach: use playground to add code to functions.php
    // that will trigger an error when the page loads

    try {
      await cliServer.playground.run({
        code: `<?php
          // Add an action that triggers a PHP warning when wp_head is called
          add_action('wp_head', function() {
            // Access undefined variable to trigger warning
            echo $test_undefined_var;
          });
        `,
      });
    } catch (error) {
      // Continue even if this fails
    }

    // Navigate to homepage - the wp_head action should trigger the error
    await page.goto(wpInstance.url, { waitUntil: 'networkidle' });
    const pageContent = await page.content();

    // Detect PHP errors
    const phpErrors = detectPHPErrors(pageContent);

    // Verify we detected at least one error
    expect(phpErrors.length).toBeGreaterThan(0);
    expect(phpErrors.some(err =>
      err.message.includes('undefined') ||
      err.type === 'warning' ||
      err.type === 'notice'
    )).toBe(true);
  });

  test('should capture PHP errors using testWordPressPage helper', async ({ page, wpInstance }) => {
    // First trigger an error via playground
    const cliServer = wpInstance.server;

    if (cliServer && cliServer.playground) {
      try {
        await cliServer.playground.run({
          code: `<?php
            add_action('init', function() {
              // Trigger a notice by accessing undefined variable
              $x = $undefined_variable;
            });
          `,
        });
      } catch (error) {
        // Continue
      }
    }

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

