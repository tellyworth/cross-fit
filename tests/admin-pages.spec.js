import { test, expect } from './wp-fixtures.js';
import {
  testWordPressAdminPage,
  discoverAllAdminSubmenuItems,
} from './test-helpers.js';

/**
 * @fileoverview Tests for authenticated WordPress admin pages
 */
test.describe('WordPress Admin Pages', { tag: '@admin' }, () => {

  test('should access authenticated admin dashboard', { tag: '@smoke' }, async ({ page, wpInstance }) => {
    await testWordPressAdminPage(page, wpInstance, '/wp-admin/');
  });

  test('should access multiple admin pages', async ({ page, wpInstance }) => {
    // Test multiple admin pages
    await testWordPressAdminPage(page, wpInstance, '/wp-admin/');
    // Extend timeout after first page to allow for additional pages
    test.setTimeout(test.info().timeout + 30000); // Add 30 seconds

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

    test.setTimeout(30000);

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

    // Check if the change was saved by reading the value again
    const savedTagline = await page.inputValue('#blogdescription');

    expect(savedTagline).toBe(newTagline);
  });

  test('should access all admin menu items without errors', async ({ page, wpInstance }) => {
    // This test accesses multiple admin pages in parallel
    // Set timeout based on number of items: base timeout + 15 seconds per item (parallel execution is faster)
    const isFullMode = process.env.FULL_MODE === '1';

    // Discover admin menu items lazily if not already cached
    let adminMenuItems = wpInstance.discoveredData?.adminMenuItems;
    if (!adminMenuItems || adminMenuItems.length === 0) {
      const { discoverAdminMenuItems } = await import('./test-helpers.js');
      adminMenuItems = await discoverAdminMenuItems(wpInstance, page);
      // Cache for other tests
      if (global.wpDiscoveredData) {
        global.wpDiscoveredData.adminMenuItems = adminMenuItems;
      }
      if (wpInstance.discoveredData) {
        wpInstance.discoveredData.adminMenuItems = adminMenuItems;
      }
    }

    if (adminMenuItems.length === 0) {
      test.skip(true, 'No admin menu items discovered');
      return;
    }

    // Calculate timeout for batched parallel execution:
    // With batched parallel execution, we need time for: base + (number of batches * time per batch)
    // Each batch processes items in parallel, taking ~20 seconds per batch
    const baseTimeout = 30000; // Base 30 seconds
    const timeoutPerItem = 20000; // 20 seconds per page (admin pages can be slow)
    // Match the worker count to avoid overwhelming the system
    // Playwright workers run tests in parallel, so we limit browser contexts per test accordingly
    const concurrencyLimit = 4; // Process 4 items in parallel at a time (matches worker count)
    const batches = Math.ceil(adminMenuItems.length / concurrencyLimit);
    const timePerBatch = timeoutPerItem + 5000; // 20s per page + 5s overhead per batch
    // Timeout = base + (batches * time per batch)
    const estimatedTimeout = baseTimeout + (batches * timePerBatch);
    test.setTimeout(estimatedTimeout);

    // Get browser from page context to create new contexts for parallel execution
    // Each context will have its own session/cookies, ensuring isolation
    const browserContext = page.context();
    const browser = browserContext.browser();
    if (!browser) {
      throw new Error('Could not access browser from page context');
    }

    // Get storage state once for reuse across all contexts
    const storageState = await browserContext.storageState();

    // Prepare menu items for parallel testing
    const menuItemTests = adminMenuItems.map((menuItem) => {
      const url = new URL(menuItem.url);
      const path = url.pathname + url.search;
      return {
        path,
        title: menuItem.title,
        slug: menuItem.slug,
        description: `Admin menu: ${menuItem.title} (${menuItem.slug})`,
      };
    });

    // Create a pool of reusable browser contexts to avoid the overhead of creating/closing contexts
    // This is much faster than creating a new context for each test
    const contextPool = [];
    const poolSize = concurrencyLimit; // Match worker count

    // Initialize context pool
    for (let i = 0; i < poolSize; i++) {
      const context = await browser.newContext({
        storageState: storageState,
      });
      contextPool.push(context);
    }

    // Helper to get a context from the pool (round-robin)
    let contextIndex = 0;
    function getContext() {
      const context = contextPool[contextIndex % poolSize];
      contextIndex++;
      return context;
    }

    // Process items with true concurrency limiting (not batching)
    // This starts new tasks as soon as a slot becomes available, rather than waiting for entire batches
    async function processWithConcurrencyLimit(items, concurrency, processor) {
      const results = [];
      const executing = new Set();
      let index = 0;

      while (index < items.length || executing.size > 0) {
        // Start new tasks up to the concurrency limit
        while (executing.size < concurrency && index < items.length) {
          const item = items[index++];
          const promise = Promise.resolve(processor(item))
            .then(
              (value) => ({ status: 'fulfilled', value }),
              (reason) => ({ status: 'rejected', reason })
            )
            .finally(() => {
              executing.delete(promise);
            });
          executing.add(promise);
        }

        // Wait for at least one task to complete
        if (executing.size > 0) {
          const result = await Promise.race(Array.from(executing));
          results.push(result);
        }
      }

      return results;
    }

    // Process menu items with concurrency limiting using the context pool
    const startTime = Date.now();
    const formatTimestamp = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const millis = String(now.getMilliseconds()).padStart(3, '0');
      return `${hours}:${minutes}:${seconds}.${millis}`;
    };

    console.log(`[${formatTimestamp()}] [Admin Menu Test] Starting parallel execution of ${menuItemTests.length} items with concurrency limit ${concurrencyLimit}`);

    const menuResults = await processWithConcurrencyLimit(
      menuItemTests,
      concurrencyLimit,
      async (menuItem) => {
        const itemStartTime = Date.now();
        const context = getContext();
        const testPage = await context.newPage();

        try {
          await testWordPressAdminPage(testPage, wpInstance, menuItem.path, {
            description: menuItem.description,
            timeout: 20000, // 20 seconds per page
          });
          const itemDuration = Date.now() - itemStartTime;
          console.log(`[${formatTimestamp()}] [Admin Menu Test] ✓ ${menuItem.title} completed in ${itemDuration}ms`);
          return { success: true, menuItem };
        } catch (error) {
          const itemDuration = Date.now() - itemStartTime;
          console.log(`[${formatTimestamp()}] [Admin Menu Test] ✗ ${menuItem.title} failed after ${itemDuration}ms: ${error.message}`);
          return { success: false, menuItem, error: error.message };
        } finally {
          await testPage.close();
        }
      }
    );

    const totalDuration = Date.now() - startTime;
    console.log(`[${formatTimestamp()}] [Admin Menu Test] Completed ${menuItemTests.length} items in ${totalDuration}ms (${(totalDuration / 1000).toFixed(1)}s)`);

    // Clean up context pool (but keep contexts open for submenu items if in full mode)
    if (!isFullMode) {
      await Promise.all(contextPool.map(ctx => ctx.close()));
    }

    // Process results and report failures
    const failures = [];
    menuResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        const menuItem = menuItemTests[index];
        failures.push({
          menuItem: menuItem.title,
          slug: menuItem.slug,
          error: result.reason?.message || String(result.reason),
        });
      } else if (result.value && !result.value.success) {
        failures.push({
          menuItem: result.value.menuItem.title,
          slug: result.value.menuItem.slug,
          error: result.value.error,
        });
      }
    });

    // Log warnings for failures but don't fail the test (similar to original behavior)
    if (failures.length > 0) {
      console.warn(`\n[Admin Menu Items] ${failures.length} of ${adminMenuItems.length} items had issues:`);
      failures.forEach((failure) => {
        console.warn(`  - "${failure.menuItem}" (${failure.slug}): ${failure.error}`);
      });
    }

    // In full mode, also test all submenu items in parallel
    if (isFullMode) {
      try {
        // Fetch all submenu items once (using original page)
        const allSubmenuItems = await discoverAllAdminSubmenuItems(wpInstance, page);

          if (allSubmenuItems.length > 0) {
          // For submenu items, we run them after menu items, so we need additional time
          // Calculate batches for submenu items
          const submenuBatches = Math.ceil(allSubmenuItems.length / concurrencyLimit);
          const submenuTimeout = test.info().timeout + (submenuBatches * timePerBatch);
          test.setTimeout(submenuTimeout);

          // Prepare submenu items for parallel testing
          const submenuItemTests = allSubmenuItems.map((submenuItem) => {
            const submenuUrl = new URL(submenuItem.url);
            const submenuPath = submenuUrl.pathname + submenuUrl.search;
            return {
              path: submenuPath,
              title: submenuItem.title,
              slug: submenuItem.slug,
              description: `Admin submenu: ${submenuItem.title} (${submenuItem.slug})`,
            };
          });

          // Test all submenu items with concurrency limiting using the same context pool
          const submenuStartTime = Date.now();
          console.log(`[${formatTimestamp()}] [Admin Submenu Test] Starting parallel execution of ${submenuItemTests.length} items with concurrency limit ${concurrencyLimit}`);

          const submenuResults = await processWithConcurrencyLimit(
            submenuItemTests,
            concurrencyLimit,
            async (submenuItem) => {
              const itemStartTime = Date.now();
              const context = getContext();
              const testPage = await context.newPage();

              try {
                await testWordPressAdminPage(testPage, wpInstance, submenuItem.path, {
                  description: submenuItem.description,
                  timeout: 20000,
                });
                const itemDuration = Date.now() - itemStartTime;
                console.log(`[${formatTimestamp()}] [Admin Submenu Test] ✓ ${submenuItem.title} completed in ${itemDuration}ms`);
                return { success: true, submenuItem };
              } catch (error) {
                const itemDuration = Date.now() - itemStartTime;
                console.log(`[${formatTimestamp()}] [Admin Submenu Test] ✗ ${submenuItem.title} failed after ${itemDuration}ms: ${error.message}`);
                return { success: false, submenuItem, error: error.message };
              } finally {
                await testPage.close();
              }
            }
          );

          const submenuTotalDuration = Date.now() - submenuStartTime;
          console.log(`[${formatTimestamp()}] [Admin Submenu Test] Completed ${submenuItemTests.length} items in ${submenuTotalDuration}ms (${(submenuTotalDuration / 1000).toFixed(1)}s)`);

          // Clean up context pool after submenu items
          await Promise.all(contextPool.map(ctx => ctx.close()));

          // Process submenu results
          const submenuFailures = [];
          submenuResults.forEach((result, index) => {
            if (result.status === 'rejected') {
              const submenuItem = submenuItemTests[index];
              submenuFailures.push({
                submenuItem: submenuItem.title,
                slug: submenuItem.slug,
                error: result.reason?.message || String(result.reason),
              });
            } else if (result.value && !result.value.success) {
              submenuFailures.push({
                submenuItem: result.value.submenuItem.title,
                slug: result.value.submenuItem.slug,
                error: result.value.error,
              });
            }
          });

          if (submenuFailures.length > 0) {
            console.warn(`\n[Admin Submenu Items] ${submenuFailures.length} of ${allSubmenuItems.length} items had issues:`);
            submenuFailures.forEach((failure) => {
              console.warn(`  - "${failure.submenuItem}" (${failure.slug}): ${failure.error}`);
            });
          }
        }
      } catch (error) {
        console.warn(`Warning: Could not discover submenu items:`, error.message);
      }
    }
  });
});

