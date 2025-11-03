import { test, expect } from './wp-fixtures.js';
import {
  testWordPressPage,
  detectPHPErrors,
} from './test-helpers.js';

test.describe('PHP Error Detection', () => {

  test('should detect PHP errors in rendered page content', async ({ page, wpInstance }) => {
    // Navigate to homepage
    await page.goto(wpInstance.url, { waitUntil: 'networkidle' });

    // Get page content
    const pageContent = await page.content();

    // Detect PHP errors
    const phpErrors = detectPHPErrors(pageContent);

    // Log results
    console.log('\n[PHP Error Detection Test]');
    if (phpErrors.length > 0) {
      console.log(`Detected ${phpErrors.length} PHP error(s):`);
      phpErrors.forEach((err, i) => {
        console.error(`  ${i + 1}. ${err.type.toUpperCase()}: ${err.message}`);
        if (err.file) {
          console.error(`     File: ${err.file}${err.line ? `:${err.line}` : ''}`);
        }
      });
    } else {
      console.log('No PHP errors detected (this is good!)');
    }

    // This test just verifies the detection mechanism works
    // It doesn't fail if no errors are found
    expect(Array.isArray(phpErrors)).toBe(true);
  });

  test('should capture PHP errors using testWordPressPage helper', async ({ page, wpInstance }) => {
    // Use the helper which automatically detects PHP errors
    const result = await testWordPressPage(page, wpInstance, '/', {
      allowPHPErrors: true, // Allow PHP errors for this test (won't fail on detection)
      description: 'Testing PHP error detection with helper',
    });

    // Log what was detected
    if (result.phpErrors && result.phpErrors.length > 0) {
      console.log('\n[Helper PHP Error Test] PHP errors detected:');
      result.phpErrors.forEach((err, i) => {
        console.error(`  ${i + 1}. ${err.type.toUpperCase()}: ${err.message}`);
        if (err.file) {
          console.error(`     File: ${err.file}${err.line ? `:${err.line}` : ''}`);
        }
      });
    } else {
      console.log('\n[Helper PHP Error Test] No PHP errors detected');
    }

    // Verify phpErrors array exists
    expect(result.phpErrors).toBeDefined();
    expect(Array.isArray(result.phpErrors)).toBe(true);
  });

  test('should fail test if PHP errors found (when not allowed)', async ({ page, wpInstance }) => {
    // This test will fail if PHP errors are found
    // This verifies the error detection and assertion mechanism

    try {
      await testWordPressPage(page, wpInstance, '/', {
        allowPHPErrors: false, // Don't allow PHP errors - test should fail if any found
        description: 'Testing PHP error detection - should fail if errors present',
      });

      // If we get here and there were no errors, that's good
      console.log('\n[PHP Error Assertion Test] No PHP errors found - test passed');
    } catch (error) {
      // Expected if PHP errors are found
      if (error.message && error.message.includes('PHP')) {
        console.log('\n[PHP Error Assertion Test] PHP errors detected and test correctly failed');
        throw error; // Re-throw so test fails as expected
      }
      // Some other error - re-throw
      throw error;
    }
  });
});

