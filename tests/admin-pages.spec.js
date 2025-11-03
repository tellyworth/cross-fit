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

    // Navigate and wait for the form field to be ready
    const optionsResponse = await page.goto(optionsUrl, { waitUntil: 'commit' });

    expect(optionsResponse.status()).toBe(200);

    // Wait for the form field - this ensures the page is fully loaded and interactive
    await expect(page.locator('#blogdescription')).toBeVisible({ timeout: 15000 });

    // Get current site tagline value (less likely to conflict with other tests)
    const currentTagline = await page.inputValue('#blogdescription');

    // Generate a new test tagline
    const newTagline = `Test Tagline ${Date.now()}`;

    // Fill in the new tagline
    await page.fill('#blogdescription', newTagline);

    // Submit the form
    await page.click('#submit');

    // Wait for form submission - wait for navigation and then for the field to be visible again
    // The field being visible indicates the page has reloaded after form submission
    await expect(page.locator('#blogdescription')).toBeVisible({ timeout: 15000 });

    // Wait a moment for the save to complete
    await page.waitForTimeout(1000);

    // Check if the change was saved by reading the value again
    const savedTagline = await page.inputValue('#blogdescription');

    expect(savedTagline).toBe(newTagline);
  });
});

