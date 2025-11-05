import { test, expect } from './wp-fixtures.js';
import {
  testWordPressPage,
  detectPHPErrors,
} from './test-helpers.js';

test.describe('PHP Error Detection', () => {

  test('should detect PHP errors by triggering an actual error', async ({ page, wpInstance }) => {
    // Access the playground instance to write to functions.php
    const cliServer = wpInstance.server;

    if (!cliServer || !cliServer.playground) {
      test.skip();
      return;
    }

    // Write to functions.php to trigger an error when WordPress loads
    try {
      // Read current functions.php (if it exists)
      let currentContent = '';
      try {
        const result = await cliServer.playground.run({
          code: `<?php
            $file = '/wordpress/wp-content/themes/twentytwentyfour/functions.php';
            if (file_exists($file)) {
              return file_get_contents($file);
            }
            return '<?php\n';
          `,
        });
        currentContent = typeof result === 'string' ? result : '<?php\n';
      } catch (error) {
        currentContent = '<?php\n';
      }

      // Add code that triggers a PHP warning/notice when page loads
      const errorTriggerCode = `
// Test PHP error trigger - this should generate a warning
add_action('wp_head', function() {
  // Access undefined variable to trigger PHP warning
  echo $undefined_test_variable;
});
`;

      // Append the error trigger code and write back
      const newContent = currentContent + errorTriggerCode;

      // Write back using run() to execute PHP
      await cliServer.playground.run({
        code: `<?php
          $file = '/wordpress/wp-content/themes/twentytwentyfour/functions.php';
          $dir = dirname($file);
          if (!file_exists($dir)) {
            mkdir($dir, 0755, true);
          }
          file_put_contents($file, base64_decode('${Buffer.from(newContent).toString('base64')}'));
        `,
      });
    } catch (error) {
      // If writing fails, skip the test
      test.skip();
      return;
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
    // First trigger an error via playground by writing to functions.php
    const cliServer = wpInstance.server;

    if (!cliServer || !cliServer.playground) {
      test.skip();
      return;
    }

    try {
      // Read current functions.php
      let currentContent = '';
      try {
        const result = await cliServer.playground.run({
          code: `<?php
            $file = '/wordpress/wp-content/themes/twentytwentyfour/functions.php';
            if (file_exists($file)) {
              return file_get_contents($file);
            }
            return '<?php\n';
          `,
        });
        currentContent = typeof result === 'string' ? result : '<?php\n';
      } catch (error) {
        currentContent = '<?php\n';
      }

      // Add code that triggers a PHP notice in wp_head (more visible than init)
      // Use wp_head hook which outputs to the page, making errors more visible
      const errorTriggerCode = `
// Test PHP error trigger - this should generate a notice
add_action('wp_head', function() {
  // Access undefined variable to trigger PHP notice/warning
  echo $undefined_test_variable;
});
`;

      // Append and write using run()
      const newContent = currentContent + errorTriggerCode;
      const base64Content = Buffer.from(newContent).toString('base64');
      
      await cliServer.playground.run({
        code: `<?php
          $file = '/wordpress/wp-content/themes/twentytwentyfour/functions.php';
          $dir = dirname($file);
          if (!file_exists($dir)) {
            mkdir($dir, 0755, true);
          }
          $content = base64_decode('${base64Content}');
          file_put_contents($file, $content);
          return file_exists($file) ? 'OK' : 'FAILED';
        `,
      });

      // Give WordPress time to reload the file
      await page.waitForTimeout(500);
    } catch (error) {
      // If writing fails, skip the test
      test.skip();
      return;
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

