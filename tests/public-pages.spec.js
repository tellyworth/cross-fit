import { test, expect } from './wp-fixtures.js';
import {
  testWordPressPage,
  testWordPressPages,
} from './test-helpers.js';

test.describe('WordPress Public Pages', () => {

  test('should load homepage without errors', async ({ page, wpInstance }) => {
    await testWordPressPage(page, wpInstance.url, {
      description: 'Test homepage',
    });
  });

  test('should load multiple public pages without errors', async ({ page, wpInstance }) => {
    // Test multiple pages with a single call - easy to extend
    await testWordPressPages(page, wpInstance.url, [
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
    await testWordPressPages(page, wpInstance.url, [
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

