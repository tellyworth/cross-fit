import { test, expect } from './wp-fixtures.js';
import {
  testWordPressPage,
  testWordPressPages,
  testWordPressRSSFeed,
  testWordPressAdminPage,
} from './test-helpers.js';

test.describe('WordPress E2E Tests', () => {

  test('should load public homepage without errors', async ({ page, wpInstance }) => {
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

  test('should access authenticated admin dashboard', async ({ page, wpInstance }) => {
    const baseUrl = wpInstance.url.replace(/\/$/, '');
    await testWordPressAdminPage(page, `${baseUrl}/wp-admin/`);
  });

  test('should access multiple admin pages', async ({ page, wpInstance }) => {
    const baseUrl = wpInstance.url.replace(/\/$/, '');

    // Test multiple admin pages
    await testWordPressAdminPage(page, `${baseUrl}/wp-admin/`);
    await testWordPressAdminPage(page, `${baseUrl}/wp-admin/options-general.php`);
    // Add more admin pages easily
  });

  test('should validate RSS feed structure', async ({ page, wpInstance }) => {
    const feedBaseUrl = wpInstance.url.replace(/\/$/, '');
    await testWordPressRSSFeed(page, `${feedBaseUrl}/feed/`);
  });

  test('should successfully submit POST request to change site options', async ({ page, wpInstance }) => {
    // Navigate to General Settings page
    const optionsBaseUrl = wpInstance.url.replace(/\/$/, '');
    const optionsUrl = `${optionsBaseUrl}/wp-admin/options-general.php`;

    const optionsResponse = await page.goto(optionsUrl, { waitUntil: 'networkidle' });

    expect(optionsResponse.status()).toBe(200);

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Verify we're on the options page
    await expect(page.locator('#blogname')).toBeVisible({ timeout: 5000 });

    // Get current site title value
    const currentTitle = await page.inputValue('#blogname');
    console.log(`Current site title: "${currentTitle}"`);

    // Generate a new test title
    const newTitle = `Test Site ${Date.now()}`;
    console.log(`Changing site title to: "${newTitle}"`);

    // Fill in the new title
    await page.fill('#blogname', newTitle);

    // Submit the form
    await page.click('#submit');

    // Wait for form submission and page reload
    await page.waitForLoadState('networkidle');

    // Wait a moment for the save to complete
    await page.waitForTimeout(1000);

    // Check if the change was saved by reading the value again
    const savedTitle = await page.inputValue('#blogname');
    console.log(`Saved site title: "${savedTitle}"`);

    expect(savedTitle).toBe(newTitle);
  });
});

