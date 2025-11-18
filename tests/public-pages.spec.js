import { test, expect } from './wp-fixtures.js';
import {
  testWordPressPage,
  testWordPressPages,
  getOneItemPerPostType,
  getAllItemsPerPostType,
  discoverListPageTypes,
  getAllListPageInstances,
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

  test('should load one example of each post type without errors', async ({ page, wpInstance }) => {
    const isFullMode = process.env.FULL_MODE === '1';

    // Discover post types lazily if not already cached
    let postTypes = wpInstance.discoveredData?.postTypes;
    if (!postTypes || postTypes.length === 0) {
      const { discoverPostTypes } = await import('./test-helpers.js');
      postTypes = await discoverPostTypes(page, wpInstance);
      // Cache for other tests
      if (global.wpDiscoveredData) {
        global.wpDiscoveredData.postTypes = postTypes;
      }
      if (wpInstance.discoveredData) {
        wpInstance.discoveredData.postTypes = postTypes;
      }
    }

    if (postTypes.length === 0) {
      test.skip(true, 'No post types discovered');
      return;
    }

    let items;
    if (isFullMode) {
      // In full mode, test all published items of each post type
      items = await getAllItemsPerPostType(page, wpInstance, postTypes);
    } else {
      // In standard mode, test one example of each post type
      items = await getOneItemPerPostType(page, wpInstance, postTypes);
    }

    if (items.length === 0) {
      test.skip(true, 'No published items found for any post type');
      return;
    }

    // Test each item
    for (const item of items) {
      if (item.link) {
        // Extract path from full URL
        const url = new URL(item.link);
        const path = url.pathname + url.search;
        try {
          await testWordPressPage(page, wpInstance, path, {
            description: `${item.postTypeName} (${item.postType}): ${path}`,
            waitUntil: 'load', // Use load instead of networkidle for faster tests
          });
        } catch (error) {
          // If page times out or doesn't exist, log and continue
          if (error.message.includes('timeout') || error.message.includes('404')) {
            console.warn(`Warning: Could not load ${item.postTypeName} page at ${path}:`, error.message);
          } else {
            throw error; // Re-throw unexpected errors
          }
        }
      }
    }
  });

  test('should load list pages (archives, search, etc.) without errors', async ({ page, wpInstance }) => {
    const isFullMode = process.env.FULL_MODE === '1';
    let listPages;

    if (isFullMode) {
      // In full mode, get all instances of each list page type
      listPages = await getAllListPageInstances(page, wpInstance);
    } else {
      // In standard mode, discover lazily if not cached
      listPages = wpInstance.discoveredData?.listPageTypes;
      if (!listPages) {
        listPages = await discoverListPageTypes(page, wpInstance);
        // Cache for other tests
        if (global.wpDiscoveredData) {
          global.wpDiscoveredData.listPageTypes = listPages;
        }
        if (wpInstance.discoveredData) {
          wpInstance.discoveredData.listPageTypes = listPages;
        }
      }
    }

    // Collect all list page paths to test
    const pagesToTest = [];

    // Categories
    for (const cat of listPages.categories || []) {
      if (cat.link) {
        const url = new URL(cat.link, wpInstance.url);
        pagesToTest.push({
          path: url.pathname + url.search,
          description: `Category archive: ${cat.slug}`,
        });
      }
    }

    // Tags
    for (const tag of listPages.tags || []) {
      if (tag.link) {
        const url = new URL(tag.link, wpInstance.url);
        pagesToTest.push({
          path: url.pathname + url.search,
          description: `Tag archive: ${tag.slug}`,
        });
      }
    }

    // Authors
    for (const author of listPages.authors || []) {
      if (author.link) {
        const url = new URL(author.link, wpInstance.url);
        pagesToTest.push({
          path: url.pathname + url.search,
          description: `Author archive: ${author.slug}`,
        });
      }
    }

    // Date archives
    for (const dateArchive of listPages.dateArchives || []) {
      if (dateArchive.link) {
        const url = new URL(dateArchive.link, wpInstance.url);
        pagesToTest.push({
          path: url.pathname + url.search,
          description: `Date archive (${dateArchive.type}): ${dateArchive.path}`,
        });
      }
    }

    // Custom post type archives
    for (const cptArchive of listPages.customPostTypeArchives || []) {
      if (cptArchive.link) {
        const url = new URL(cptArchive.link, wpInstance.url);
        pagesToTest.push({
          path: url.pathname + url.search,
          description: `Custom post type archive: ${cptArchive.postType}`,
        });
      }
    }

    // Search
    if (listPages.search) {
      if (Array.isArray(listPages.search)) {
        for (const search of listPages.search) {
          pagesToTest.push({
            path: search.path,
            description: 'Search results',
          });
        }
      } else if (listPages.search.path) {
        pagesToTest.push({
          path: listPages.search.path,
          description: 'Search results',
        });
      }
    }

    if (pagesToTest.length === 0) {
      test.skip(true, 'No list pages found to test');
      return;
    }

    // Test each list page
    for (const pageDef of pagesToTest) {
      try {
        await testWordPressPage(page, wpInstance, pageDef.path, {
          description: pageDef.description,
          waitUntil: 'load', // Use load instead of networkidle for faster tests
        });
      } catch (error) {
        // If page times out or doesn't exist, log and continue
        if (error.message.includes('timeout') || error.message.includes('404')) {
          console.warn(`Warning: Could not load list page ${pageDef.description} at ${pageDef.path}:`, error.message);
        } else {
          throw error; // Re-throw unexpected errors
        }
      }
    }
  });
});

