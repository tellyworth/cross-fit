import { test, expect } from './wp-fixtures.js';
import {
  testWordPressAdminPage,
} from './test-helpers.js';

test.describe('WordPress Admin Pages', () => {

  test('should access authenticated admin dashboard', async ({ page, wpInstance }) => {
    await testWordPressAdminPage(page, wpInstance, '/wp-admin/');
  });

  test('should access multiple admin pages', async ({ page, wpInstance }) => {
    // Test multiple admin pages
    await testWordPressAdminPage(page, wpInstance, '/wp-admin/');
    await testWordPressAdminPage(page, wpInstance, '/wp-admin/options-general.php');
    // Add more admin pages easily:
    // await testWordPressAdminPage(page, wpInstance, '/wp-admin/edit.php');
    // await testWordPressAdminPage(page, wpInstance, '/wp-admin/upload.php');
  });

  test('should successfully submit POST request to change site options', async ({ page, wpInstance }) => {
    // Navigate to General Settings page
    const baseUrl = wpInstance.url.replace(/\/$/, '');
    const optionsPath = '/wp-admin/options-general.php';
    const optionsUrl = `${baseUrl}${optionsPath}`;

    const optionsResponse = await page.goto(optionsUrl, { waitUntil: 'domcontentloaded' });

    expect(optionsResponse.status()).toBe(200);

    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');

    // Verify we're on the options page
    await expect(page.locator('#blogdescription')).toBeVisible({ timeout: 5000 });

    // Get current site tagline value (less likely to conflict with other tests)
    const currentTagline = await page.inputValue('#blogdescription');

    // Generate a new test tagline
    const newTagline = `Test Tagline ${Date.now()}`;

    // Fill in the new tagline
    await page.fill('#blogdescription', newTagline);

    // Submit the form
    await page.click('#submit');

    // Wait for form submission - wait for the success message or the field to be visible again
    await expect(page.locator('#blogdescription')).toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('domcontentloaded');

    // Wait a moment for the save to complete
    await page.waitForTimeout(1000);

    // Check if the change was saved by reading the value again
    const savedTagline = await page.inputValue('#blogdescription');

    expect(savedTagline).toBe(newTagline);
  });
});

