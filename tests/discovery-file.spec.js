import { test, expect } from './wp-fixtures.js';
import { testWordPressAdminPage } from './test-helpers.js';

/**
 * @fileoverview Internal tests - verify discovery JSON file is generated correctly
 * These tests verify that the Big Mistake plugin's discovery file exists and contains
 * reasonable data for use by other tests.
 */
test.describe('Discovery File', { tag: '@internal' }, () => {

  test('should generate and contain valid discovery data', async ({ page, wpInstance }) => {
    // First, load an admin page to ensure the discovery file is generated
    // The discovery file is generated on admin_init, so we need to visit an admin page first
    await testWordPressAdminPage(page, wpInstance, '/wp-admin/');

    // Fetch the discovery file
    const baseUrl = wpInstance.url.replace(/\/$/, '');
    const discoveryUrl = `${baseUrl}/wp-content/big-mistake-discovery.json`;

    const response = await page.request.get(discoveryUrl, {
      headers: {
        Accept: 'application/json',
      },
    });

    // Verify the file exists and is accessible
    expect(response.status()).toBe(200);

    // Parse the JSON
    const data = await response.json();

    // Verify the data structure
    expect(data).toBeDefined();
    expect(typeof data).toBe('object');

    // Verify postTypes exists and is an array
    expect(Array.isArray(data.postTypes)).toBe(true);
    expect(data.postTypes.length).toBeGreaterThan(0);
    // Should have at least the default 'post' type
    expect(data.postTypes.some(pt => pt.slug === 'post')).toBe(true);

    // Verify listPages exists and has expected structure
    expect(data.listPages).toBeDefined();
    expect(typeof data.listPages).toBe('object');
    expect(Array.isArray(data.listPages.categories)).toBe(true);
    expect(Array.isArray(data.listPages.tags)).toBe(true);
    expect(Array.isArray(data.listPages.authors)).toBe(true);
    expect(Array.isArray(data.listPages.dateArchives)).toBe(true);
    expect(Array.isArray(data.listPages.customPostTypeArchives)).toBe(true);
    // Should have at least one category (uncategorized)
    expect(data.listPages.categories.length).toBeGreaterThan(0);
    // Should have at least one author (admin)
    expect(data.listPages.authors.length).toBeGreaterThan(0);

    // Verify adminMenuItems exists and contains reasonable number of items
    expect(Array.isArray(data.adminMenuItems)).toBe(true);
    expect(data.adminMenuItems.length).toBeGreaterThanOrEqual(5); // Should have at least 5 top-level menu items
    // Should have common admin menu items
    const menuSlugs = data.adminMenuItems.map(item => item.slug);
    expect(menuSlugs).toContain('index.php'); // Dashboard
    expect(menuSlugs.some(slug => slug.includes('edit.php'))).toBe(true); // Posts or Pages

    // Verify adminSubmenuItems exists and is an array
    expect(Array.isArray(data.adminSubmenuItems)).toBe(true);
    // Should have at least some submenu items (WordPress has many submenus)
    expect(data.adminSubmenuItems.length).toBeGreaterThanOrEqual(5);

    // Verify submenu items have required fields
    if (data.adminSubmenuItems.length > 0) {
      const submenuItem = data.adminSubmenuItems[0];
      expect(submenuItem).toHaveProperty('parent');
      expect(submenuItem).toHaveProperty('slug');
      expect(submenuItem).toHaveProperty('title');
      expect(submenuItem).toHaveProperty('url');
    }
  });

  test('should update discovery file after visiting different admin pages', async ({ page, wpInstance }) => {
    // Load the dashboard first
    await testWordPressAdminPage(page, wpInstance, '/wp-admin/');

    const baseUrl = wpInstance.url.replace(/\/$/, '');
    const discoveryUrl = `${baseUrl}/wp-content/big-mistake-discovery.json`;

    // Fetch initial discovery data
    const response1 = await page.request.get(discoveryUrl, {
      headers: {
        Accept: 'application/json',
      },
    });
    expect(response1.status()).toBe(200);
    const data1 = await response1.json();

    // Load a different admin page (this should regenerate the discovery file)
    await testWordPressAdminPage(page, wpInstance, '/wp-admin/edit.php');

    // Fetch discovery data again
    const response2 = await page.request.get(discoveryUrl, {
      headers: {
        Accept: 'application/json',
      },
    });
    expect(response2.status()).toBe(200);
    const data2 = await response2.json();

    // Both should have the same structure and reasonable data
    expect(data2.adminMenuItems.length).toBe(data1.adminMenuItems.length);
    expect(data2.postTypes.length).toBe(data1.postTypes.length);
  });
});

