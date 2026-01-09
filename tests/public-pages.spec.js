import { test, expect } from './wp-fixtures.js';
import {
  setupErrorTracking,
  navigateToPage,
  getPageContentAndPHPErrors,
  validatePageTitle,
  validateBodyClass,
  checkForPHPErrorsPublic,
  checkForJavaScriptErrorsPublic,
  compareScreenshotPublic,
  normalizePath,
} from './test-helpers.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';

/**
 * @fileoverview Tests for public-facing WordPress pages
 */

// Read discovery file synchronously at file load time
// This allows us to use Playwright's forEach pattern to generate individual test() calls
// Reference: https://playwright.dev/docs/test-parameterize
function loadDiscoveryDataSync() {
  // Derive discovery file path from debug log path (both are in wp-content)
  const debugLogPath = process.env.WP_PLAYGROUND_DEBUG_LOG;
  if (!debugLogPath) {
    console.warn('Warning: WP_PLAYGROUND_DEBUG_LOG not set, discovery file cannot be loaded synchronously');
    return null;
  }

  // Discovery file is in the same directory as debug.log
  const discoveryFilePath = join(dirname(debugLogPath), 'big-mistake-discovery.json');

  if (!existsSync(discoveryFilePath)) {
    console.warn(`Warning: Discovery file not found at ${discoveryFilePath}`);
    return null;
  }

  try {
    const fileContent = readFileSync(discoveryFilePath, 'utf8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.warn(`Warning: Failed to read or parse discovery file: ${error.message}`);
    return null;
  }
}

// Load discovery data at file load time (synchronous)
const discoveryData = loadDiscoveryDataSync();

// Combine post items and list pages into a single list for unified testing
// Post items are filtered: one per type in standard mode, all in FULL_MODE
function preparePublicPagesToTest(discoveryData) {
  const allPages = [];
  const isFullMode = process.env.FULL_MODE === '1';

  // Add post items
  if (discoveryData?.postItems) {
    const postItemsByType = new Map();

    // Group items by post type
    for (const item of discoveryData.postItems) {
      if (!item.link) continue;

        const url = new URL(item.link);
        const path = url.pathname + url.search;

      if (!postItemsByType.has(item.postType)) {
        postItemsByType.set(item.postType, []);
      }
      postItemsByType.get(item.postType).push({
        path,
        description: `${item.postTypeName} (${item.postType}): ${path}`,
        type: 'post-item',
        postType: item.postType,
      });
    }

    // Add items: one per type in standard mode, all in full mode
    for (const items of postItemsByType.values()) {
    if (isFullMode) {
        allPages.push(...items);
    } else {
        // Add first item of each type
        if (items.length > 0) {
          allPages.push(items[0]);
        }
      }
    }
  }

  // Add list pages (categories, tags, authors, date archives, CPT archives, search)
  if (discoveryData?.listPages) {
    const listPages = discoveryData.listPages;

    // Categories
    for (const cat of listPages.categories || []) {
      if (cat.url) {
        const url = new URL(cat.url);
        allPages.push({
          path: url.pathname + url.search,
          description: `Category archive: ${cat.slug}`,
          type: 'list-page',
        });
      }
    }

    // Tags
    for (const tag of listPages.tags || []) {
      if (tag.url) {
        const url = new URL(tag.url);
        allPages.push({
          path: url.pathname + url.search,
          description: `Tag archive: ${tag.slug}`,
          type: 'list-page',
        });
      }
    }

    // Authors
    for (const author of listPages.authors || []) {
      if (author.url) {
        const url = new URL(author.url);
        allPages.push({
          path: url.pathname + url.search,
          description: `Author archive: ${author.slug}`,
          type: 'list-page',
        });
      }
    }

    // Date archives
    for (const dateArchive of listPages.dateArchives || []) {
      if (dateArchive.url) {
        const url = new URL(dateArchive.url);
        const monthStr = dateArchive.month ? String(dateArchive.month).padStart(2, '0') : '';
        const dateStr = monthStr ? `${dateArchive.year}/${monthStr}` : String(dateArchive.year);
        allPages.push({
          path: url.pathname + url.search,
          description: `Date archive (${dateArchive.type || 'month'}): ${dateStr}`,
          type: 'list-page',
        });
      }
    }

    // Custom post type archives
    for (const cptArchive of listPages.customPostTypeArchives || []) {
      if (cptArchive.url) {
        const url = new URL(cptArchive.url);
        allPages.push({
          path: url.pathname + url.search,
          description: `Custom post type archive: ${cptArchive.name || cptArchive.slug}`,
          type: 'list-page',
        });
      }
    }

    // Search
    if (listPages.search?.url) {
      const url = new URL(listPages.search.url);
      allPages.push({
        path: url.pathname + url.search,
            description: 'Search results',
        type: 'list-page',
        });
      }
    }

  // Add common pages (homepage, feed)
  allPages.push(
    {
      path: '/',
      description: 'Homepage',
      type: 'common',
    },
    {
      path: '/feed/',
      description: 'RSS Feed',
      type: 'common',
    }
  );

  return allPages;
}

// Prepare pages to test at file load time
const publicPagesToTest = discoveryData ? preparePublicPagesToTest(discoveryData) : [];

test.describe('WordPress Public Pages', { tag: '@public' }, () => {
  // Data provider pattern: Generate individual test() calls for all public pages
  // Using Playwright's parameterized tests pattern: https://playwright.dev/docs/test-parameterize
  // Discovery file is read synchronously at file load time, allowing us to use forEach
  // Post items and list pages are combined into a single list; post items are filtered by FULL_MODE
  test.describe('public pages (discovered)', () => {
    // Generate individual test() calls for each page using forEach
    // This pattern creates separate test() calls that Playwright can run in parallel
    // Reference: https://playwright.dev/docs/test-parameterize
    publicPagesToTest.forEach((pageItem) => {
      test(`public page: ${pageItem.description} (${pageItem.path})`, { tag: pageItem.path === '/' ? '@smoke' : undefined }, async ({ page, wpInstance }) => {
        const url = normalizePath(wpInstance.url, pageItem.path);

        // Step 1: Set up error tracking
        const errorTracking = setupErrorTracking(page);

        try {
          // Step 2: Navigate to page (checks status internally)
          await navigateToPage(page, url, 'load', 200);

          // Step 3: Get page content and detect PHP errors
          const { pageContent, phpErrors } = await getPageContentAndPHPErrors(page);

          // Step 4: Validate page title (optional, not enforced for all pages)
          // Skip for now - can be added per-page if needed

          // Step 5: Validate body class (optional, not enforced for all pages)
          // Skip for now - can be added per-page if needed

          // Step 6: Check for PHP errors
          checkForPHPErrorsPublic(phpErrors, false);

          // Step 7: Check for JavaScript errors
          checkForJavaScriptErrorsPublic(
            errorTracking.consoleErrors,
            errorTracking.pageErrors,
            false,
            false
          );

          // Step 8: Compare screenshot if needed
          await compareScreenshotPublic(page, pageItem.path, pageContent, false);
        } finally {
          // Cleanup error tracking listeners
          errorTracking.cleanup();
        }
      });
    });

    // Fallback test if no items were discovered
    if (publicPagesToTest.length === 0) {
      test('should discover public pages', async ({ page, wpInstance }) => {
        test.skip(true, 'No public pages discovered - discovery file may not have been generated');
      });
    }
  });
});
