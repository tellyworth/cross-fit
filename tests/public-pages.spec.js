import { test, expect } from './wp-fixtures.js';
import {
  testWordPressPage,
  testWordPressPages,
} from './test-helpers.js';

/**
 * @fileoverview Tests for public-facing WordPress pages
 */
test.describe('WordPress Public Pages', { tag: '@public' }, () => {

  test('should load homepage without errors', { tag: '@smoke' }, async ({ page, wpInstance }) => {
    await testWordPressPage(page, wpInstance, '/', {
      description: 'Test homepage',
    });
  });

  test('should load multiple public pages without errors', async ({ page, wpInstance }) => {
    // Test multiple pages with a single call - easy to extend
    await testWordPressPages(page, wpInstance, [
      '/',
      '/feed/',
      // Add more pages here easily:
      // '/about/',
      // '/contact/',
      // '/blog/',
    ]);
  });

  test('should test pages with custom options', async ({ page, wpInstance }) => {
    // Test pages with custom validation options
    await testWordPressPages(page, wpInstance, [
      {
        path: '/',
        options: {
          expectedTitle: 'My WordPress Website', // String or regex
          expectedBodyClass: /home|front-page/, // String or regex
        },
      },
      {
        path: '/feed/',
        options: {
          // Custom options for this specific page
          allowConsoleErrors: false, // Override defaults
        },
      },
    ]);
  });
});

