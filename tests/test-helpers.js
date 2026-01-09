import { expect } from '@playwright/test';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import playwrightConfig from '../playwright.config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get screenshot configuration from playwright.config.js
const screenshotConfig = playwrightConfig.default?.screenshot || {};
const SCREENSHOT_NETWORK_IDLE_TIMEOUT = screenshotConfig.networkIdleTimeout ?? 2000;
const SCREENSHOT_STABILIZATION_DELAY = screenshotConfig.stabilizationDelay ?? 500;
const SCREENSHOT_SKIP_PATHS = screenshotConfig.skipPaths || [];

/**
 * Reusable test helpers for WordPress E2E testing
 * Following Playwright's recommended patterns
 */

/**
 * Generate a safe snapshot name from a path
 * Converts /wp-admin/options-general.php to wp-admin-options-general-php.png
 * Handles query parameters by encoding them
 * Note: Playwright automatically adds platform suffix (e.g., -darwin), so we just need .png extension
 */
function pathToSnapshotName(path) {
  // Split path and query
  const [pathPart, queryPart] = path.split('?');

  // Remove leading/trailing slashes and replace remaining slashes with dashes
  let name = pathPart.replace(/^\/+|\/+$/g, '').replace(/\//g, '-') || 'index';

  // Remove file extensions for cleaner names (e.g., .php, .html)
  name = name.replace(/\.(php|html)$/, '');

  // If there's a query string, encode it and append
  if (queryPart) {
    // Replace special chars in query with safe equivalents
    const safeQuery = queryPart.replace(/[=&]/g, '-').replace(/[^a-zA-Z0-9-]/g, '_');
    name = `${name}__${safeQuery}`;
  }

  // Playwright requires .png extension (it will add platform suffix automatically)
  return `${name}.png`;
}

/**
 * Get the full path to a snapshot file
 * Playwright uses snapshotPathTemplate: 'test-snapshots/{arg}{ext}'
 * Playwright automatically adds platform suffix (e.g., -darwin, -win32, -linux) to snapshot names
 * So we need to check for the platform-specific filename
 */
function getSnapshotPath(snapshotName) {
  // Remove .png extension if present
  const baseName = snapshotName.replace(/\.png$/, '');
  // Get platform suffix (Playwright uses darwin, win32, or linux)
  const platform = os.platform() === 'darwin' ? 'darwin' : os.platform() === 'win32' ? 'win32' : 'linux';
  // Construct the platform-specific filename
  const platformSpecificName = `${baseName}-${platform}.png`;
  return join(__dirname, '..', 'test-snapshots', platformSpecificName);
}

/**
 * Shared screenshot comparison logic for both public and admin pages
 */
async function compareScreenshot(page, path, snapshotName, options = {}) {
  const snapshotPath = getSnapshotPath(snapshotName);
  const isCaptureMode = process.env.CAPTURE === '1';

  // Only compare if snapshot exists OR if in capture mode (to create it)
  if (!existsSync(snapshotPath) && !isCaptureMode) {
    return; // No snapshot exists and not capturing - skip silently
  }

  // Wait for page to stabilize before taking screenshot (admin pages only)
  if (options.waitForStabilization) {
    try {
      await page.waitForLoadState('networkidle', { timeout: SCREENSHOT_NETWORK_IDLE_TIMEOUT });
    } catch (e) {
      // If networkidle times out quickly, continue anyway - page may be stable enough
    }
    await page.waitForTimeout(SCREENSHOT_STABILIZATION_DELAY);
  }

  const screenshotOptions = { fullPage: true };

  // Override threshold if specified via CLI
  if (process.env.SCREENSHOT_THRESHOLD) {
    screenshotOptions.maxDiffPixelRatio = parseFloat(process.env.SCREENSHOT_THRESHOLD);
  }

  try {
    await expect(page).toHaveScreenshot(snapshotName, screenshotOptions);
  } catch (error) {
    const errorMsg = error.message || String(error);
    if (errorMsg.includes('Screenshot') || errorMsg.includes('snapshot')) {
      // Log mismatch and re-throw to fail the test
      console.warn(`[Baseline Mismatch] ${path}`);
    }
    throw error;
  }
}

/**
 * Normalize URL - handles full URLs or relative paths
 * @param {string} baseUrl - Base URL from wpInstance
 * @param {string} path - Relative path (e.g., '/wp-admin/') or full URL
 * @returns {string} Full URL
 */
export function normalizePath(baseUrl, path) {
  // If path is already a full URL, return it
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  // Normalize base URL (remove trailing slash)
  const base = baseUrl.replace(/\/$/, '');

  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${base}${normalizedPath}`;
}

/**
 * Detect PHP errors in page content
 * When WP_DEBUG_DISPLAY is enabled, PHP errors appear in the rendered HTML
 * @param {string} htmlContent - HTML content of the page
 * @returns {Array} Array of detected PHP errors with details
 */
export function detectPHPErrors(htmlContent) {
  const errors = [];

  // PHP error patterns (case-insensitive)
  // These match common PHP error formats when display_errors is on
  // Note: PHP errors in HTML may be wrapped in <b> tags or other HTML
  const phpErrorPatterns = [
    // PHP Fatal errors (with optional HTML tags)
    /<b>Fatal\s+error<\/b>:\s*([^<\n]+)/gi,
    /Fatal\s+error:\s*([^\n]+)/gi,
    // PHP Parse errors (with optional HTML tags)
    /<b>Parse\s+error<\/b>:\s*([^<\n]+)/gi,
    /Parse\s+error:\s*([^\n]+)/gi,
    // PHP Warnings (with optional HTML tags)
    /<b>Warning<\/b>:\s*([^<\n]+)/gi,
    /Warning:\s*([^\n]+)/gi,
    // PHP Notices (with optional HTML tags)
    /<b>Notice<\/b>:\s*([^<\n]+)/gi,
    /Notice:\s*([^\n]+)/gi,
    // PHP Deprecated warnings (with optional HTML tags)
    /<b>Deprecated<\/b>:\s*([^<\n]+)/gi,
    /Deprecated:\s*([^\n]+)/gi,
    // PHP Strict errors
    /<b>Strict\s+(?:Standards\s+)?(?:Warning|Error|Notice)<\/b>:\s*([^<\n]+)/gi,
    /Strict\s+(?:Standards\s+)?(?:Warning|Error|Notice):\s*([^\n]+)/gi,
    // PHP Errors with file locations (HTML wrapped)
    /<b>(?:Fatal\s+)?(?:Parse\s+)?(?:Warning|Error|Notice)<\/b>:\s*([^<\n]+?)\s+in\s+<b>([^<]+)<\/b>\s+on\s+line\s+<b>(\d+)<\/b>/gi,
    /PHP\s+(?:Fatal\s+)?(?:Parse\s+)?(?:Warning|Error|Notice):\s*([^\n]+?)\s+in\s+([^\s:]+)(?::(\d+))?/gi,
    // WordPress-style debug messages (if displayed)
    /WordPress\s+Database\s+Error:\s*([^\n]+)/gi,
    // Catch-all for any remaining PHP error-like patterns
    /\[PHP\s+Error\]\s*([^\n]+)/gi,
  ];

  // Match all error patterns
  phpErrorPatterns.forEach((pattern, index) => {
    let match;
    // Reset regex lastIndex
    pattern.lastIndex = 0;

    while ((match = pattern.exec(htmlContent)) !== null) {
      const errorMessage = match[1] || match[0];
      const fileName = match[2] || null;
      const lineNumber = match[3] || null;

      // Avoid duplicates - check if we already have this error
      const isDuplicate = errors.some(err =>
        err.message === errorMessage &&
        err.file === fileName &&
        err.line === lineNumber
      );

      if (!isDuplicate) {
        errors.push({
          type: detectErrorType(match[0]),
          message: errorMessage.trim(),
          file: fileName,
          line: lineNumber ? parseInt(lineNumber, 10) : null,
          raw: match[0],
          matchIndex: index,
        });
      }
    }
  });

  return errors;
}

/**
 * Read WordPress debug log from Playground filesystem
 *
 * @param {Object} wpInstance - WordPress instance with server property
 * @param {Object} options - Optional options
 * @param {string} options.filter - Filter log lines by this string (e.g., '[Big Mistake]')
 * @param {number} options.limit - Maximum number of lines to return (default: 50)
 * @returns {Promise<string>} - Debug log content (filtered if specified)
 */
export async function readDebugLog(wpInstance, options = {}) {
  const { filter = null, limit = 50 } = options;

  if (!wpInstance?.debugLogPath) {
    return null;
  }

  try {
    if (!existsSync(wpInstance.debugLogPath)) {
      return null;
    }

    const logContent = readFileSync(wpInstance.debugLogPath, 'utf8');
    const lines = logContent.split('\n').filter(line => line.trim());

    let filteredLines = lines;
    if (filter) {
      filteredLines = lines.filter(line => line.includes(filter));
    }

    const selectedLines = filteredLines.slice(-limit);

    if (selectedLines.length > 0) {
      return selectedLines.join('\n');
    }

    return null;
  } catch (e) {
    console.error(`[readDebugLog] Error reading debug log:`, e.message);
    return null;
  }
}


function detectErrorType(errorText) {
  const lowerText = errorText.toLowerCase();
  if (lowerText.includes('fatal error')) return 'fatal';
  if (lowerText.includes('parse error')) return 'parse';
  if (lowerText.includes('deprecated')) return 'deprecated';
  if (lowerText.includes('strict')) return 'strict';
  if (lowerText.includes('warning')) return 'warning';
  if (lowerText.includes('notice')) return 'notice';
  if (lowerText.includes('database error')) return 'database';
  return 'error';
}

/**
 * Test a WordPress page URL with standard checks:
 * - HTTP response status
 * - JavaScript console errors
 * - Page errors
 * - Optional title/body class validation
 *
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {Object} wpInstance - WordPress instance with url property
 * @param {string} path - Relative path (e.g., '/wp-admin/') or full URL
 * @param {Object} options - Optional test options
 * @param {number} options.expectedStatus - Expected HTTP status (default: 200)
 * @param {string|RegExp} options.expectedTitle - Expected page title (optional)
 * @param {string|RegExp} options.expectedBodyClass - Expected body class (optional)
 * @param {boolean} options.allowConsoleErrors - Allow console errors (default: false)
 * @param {boolean} options.allowPageErrors - Allow page errors (default: false)
 * @param {boolean} options.allowPHPErrors - Allow PHP errors (default: false)
 * @param {string} options.description - Description for test.step (optional)
 */
/**
 * Test WordPress public page
 * This is a convenience wrapper that calls all the composable steps in order.
 * For more control, use the individual step functions directly.
 *
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {Object} wpInstance - WordPress instance with url property
 * @param {string} path - Relative path to page (e.g., '/')
 * @param {Object} options - Optional test options
 */
export async function testWordPressPage(page, wpInstance, path, options = {}) {
  const url = normalizePath(wpInstance.url, path);
  const {
    expectedStatus = 200,
    expectedTitle = null,
    expectedBodyClass = null,
    allowConsoleErrors = false,
    allowPageErrors = false,
    allowPHPErrors = false,
    description = null,
    waitUntil = 'load',
  } = options;

  // Step 1: Set up error tracking
  const errorTracking = setupErrorTracking(page);

  try {
    // Step 2: Navigate to page (checks status internally)
    await navigateToPage(page, url, waitUntil, expectedStatus);

    // Step 3: Get page content and detect PHP errors
    const { pageContent, phpErrors } = await getPageContentAndPHPErrors(page);

    // Step 4: Validate page title (if specified)
    await validatePageTitle(page, expectedTitle);

    // Step 5: Validate body class (if specified)
    await validateBodyClass(page, expectedBodyClass);

    // Step 6: Check for PHP errors
    checkForPHPErrorsPublic(phpErrors, allowPHPErrors);

    // Step 7: Check for JavaScript errors
    checkForJavaScriptErrorsPublic(
      errorTracking.consoleErrors,
      errorTracking.pageErrors,
      allowConsoleErrors,
      allowPageErrors
    );

    // Step 8: Compare screenshot if needed
    await compareScreenshotPublic(page, path, pageContent, allowPHPErrors);

  return {
    consoleErrors: errorTracking.consoleErrors,
    pageErrors: errorTracking.pageErrors,
    phpErrors,
    title: await page.title(),
    bodyClasses: await page.evaluate(() => document.body.className),
  };
  } finally {
    // Cleanup error tracking listeners
    errorTracking.cleanup();
  }
}

/**
 * Test multiple WordPress pages with a single call
 * Useful for testing a list of URLs with standard checks
 *
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {Object} wpInstance - WordPress instance with url property
 * @param {Array<string|Object>} pages - Array of page paths or objects with path and options
 * @param {Object} defaultOptions - Default options applied to all pages
 */
export async function testWordPressPages(page, wpInstance, pages, defaultOptions = {}) {
  const results = [];

  for (const pageDef of pages) {
    let path, options;

    if (typeof pageDef === 'string') {
      path = pageDef;
      options = {};
    } else {
      path = pageDef.path;
      options = pageDef.options || {};
    }

    const mergedOptions = { ...defaultOptions, ...options };

    const result = await testWordPressPage(page, wpInstance, path, {
      ...mergedOptions,
      description: `Testing: ${path}`,
    });

    results.push({
      path,
      url: normalizePath(wpInstance.url, path),
      ...result,
    });
  }

  return results;
}

/**
 * Discover WordPress post types that have public single views (using fetch)
 * Uses REST API to get all registered post types
 * This version uses fetch directly and doesn't require a page object
 *
 * @param {string} baseUrl - WordPress base URL
 * @returns {Promise<Array<Object>>} Array of post type objects with slug, name, and rest_base
 */
export async function discoverPostTypesFetch(baseUrl) {
  // Parse the base URL to extract host
  const urlObj = new URL(baseUrl);
  const url = `${baseUrl.replace(/\/$/, '')}/wp-json/wp/v2/types`;

  const fetchOptions = {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'cross-fit-test-tool/1.0',
      'Host': urlObj.host, // Set Host header explicitly
    },
    redirect: 'manual', // Handle redirects manually
  };

  let response;
  try {
    response = await fetch(url, fetchOptions);

    // Handle redirect manually
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');

      if (location) {
        // Resolve relative URLs
        const redirectUrl = location.startsWith('http') ? location : new URL(location, baseUrl).toString();

        // Try with trailing slash if redirect is to same path
        let redirectUrlToTry = redirectUrl;
        if (redirectUrl === url && !url.endsWith('/')) {
          redirectUrlToTry = url + '/';
        }

        // Only follow one redirect to avoid loops
        const redirectResponse = await fetch(redirectUrlToTry, { ...fetchOptions, redirect: 'manual' });

        if (redirectResponse.status >= 300 && redirectResponse.status < 400) {
          const redirectLocation = redirectResponse.headers.get('location');
          throw new Error(`Redirect loop detected: ${url} -> ${redirectUrlToTry} -> ${redirectLocation}`);
        }

        response = redirectResponse;
      }
    }
  } catch (error) {
    throw error;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch post types: HTTP ${response.status} ${response.statusText}`);
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error(`Failed to parse post types JSON: ${error.message}`);
  }

  const postTypes = [];

  if (data && typeof data === 'object') {
    for (const [slug, typeData] of Object.entries(data)) {
      if (typeData.rest_base && typeData.publicly_queryable !== false) {
        postTypes.push({
          slug,
          name: typeData.name || slug,
          rest_base: typeData.rest_base,
          has_archive: typeData.has_archive || false,
        });
      }
    }
  }

  return postTypes;
}

/**
 * Discover WordPress post types that have public single views
 * Uses Big Mistake plugin's discovery endpoint
 *
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {Object} wpInstance - WordPress instance with url property
 * @returns {Promise<Array<Object>>} Array of post type objects with slug, name, and rest_base
 */
export async function discoverPostTypes(page, wpInstance) {
  try {
    const data = await loadDiscoveryDataFromFile(page, wpInstance);
    const postTypes = Array.isArray(data.postTypes) ? data.postTypes : [];
    return postTypes;
  } catch (error) {
    throw error;
  }
}

/**
 * Get one published item of each post type
 * Used for standard test mode (one example per type)
 *
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {Object} wpInstance - WordPress instance with url property
 * @param {Array<Object>} postTypes - Array of post type objects from discoverPostTypes
 * @returns {Promise<Array<Object>>} Array of objects with postType and item data
 */
export async function getOneItemPerPostType(page, wpInstance, postTypes) {
  const items = [];

  for (const postType of postTypes) {
    // Use page.request directly to check status without assertion
    const url = normalizePath(wpInstance.url, `/wp-json/wp/v2/${postType.rest_base}?per_page=1&status=publish`);
    const response = await page.request.get(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    const status = response.status();

    // Fail if we get a non-200 response - this indicates discovery filtering didn't work correctly
    if (status !== 200) {
      const errorText = await response.text().catch(() => 'Could not read response body');
      throw new Error(
        `Post type ${postType.slug} returned HTTP ${status} when fetching items. ` +
        `This post type should have been filtered during discovery as it is not publicly accessible. ` +
        `Response: ${errorText.substring(0, 200)}`
      );
    }

    // Process 200 response
    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      const item = data[0];
      items.push({
        postType: postType.slug,
        postTypeName: postType.name,
        id: item.id,
        slug: item.slug || null,
        link: item.link || null,
      });
    }
  }

  return items;
}

/**
 * Get all published items of each post type
 * Used for full test mode (all items)
 *
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {Object} wpInstance - WordPress instance with url property
 * @param {Array<Object>} postTypes - Array of post type objects from discoverPostTypes
 * @returns {Promise<Array<Object>>} Array of objects with postType and item data
 */
export async function getAllItemsPerPostType(page, wpInstance, postTypes) {
  const items = [];

  for (const postType of postTypes) {
    // Use page.request directly to check status without assertion
    const url = normalizePath(wpInstance.url, `/wp-json/wp/v2/${postType.rest_base}?per_page=100&status=publish`);
    const response = await page.request.get(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    const status = response.status();

    // Fail if we get a non-200 response - this indicates discovery filtering didn't work correctly
    if (status !== 200) {
      const errorText = await response.text().catch(() => 'Could not read response body');
      throw new Error(
        `Post type ${postType.slug} returned HTTP ${status} when fetching items. ` +
        `This post type should have been filtered during discovery as it is not publicly accessible. ` +
        `Response: ${errorText.substring(0, 200)}`
      );
    }

    // Process 200 response with pagination
    let data = await response.json();
    let pageNum = 1;
    const perPage = 100;

    // Get total pages from response header to avoid extra requests
    const totalPages = parseInt(response.headers()['x-wp-totalpages'] || '1', 10);

    // Process first page
    if (Array.isArray(data) && data.length > 0) {
      for (const item of data) {
        items.push({
          postType: postType.slug,
          postTypeName: postType.name,
          id: item.id,
          slug: item.slug || null,
          link: item.link || null,
        });
      }

      // Continue fetching while there are more pages
      while (pageNum < totalPages) {
        pageNum++;
        const nextUrl = normalizePath(wpInstance.url, `/wp-json/wp/v2/${postType.rest_base}?per_page=${perPage}&page=${pageNum}&status=publish`);
        const nextResponse = await page.request.get(nextUrl, {
          headers: {
            'Accept': 'application/json',
          },
        });

        const nextStatus = nextResponse.status();
        if (nextStatus !== 200) {
          const errorText = await nextResponse.text().catch(() => 'Could not read response body');
          throw new Error(
            `Post type ${postType.slug} returned HTTP ${nextStatus} when fetching page ${pageNum}. ` +
            `This post type should have been filtered during discovery as it is not publicly accessible. ` +
            `Response: ${errorText.substring(0, 200)}`
          );
        }

        data = await nextResponse.json();
        if (Array.isArray(data) && data.length > 0) {
          for (const item of data) {
            items.push({
              postType: postType.slug,
              postTypeName: postType.name,
              id: item.id,
              slug: item.slug || null,
              link: item.link || null,
            });
          }
        }
      }
    }
  }

  return items;
}

/**
 * Discover WordPress list page types (archives, search, etc.) using fetch
 * Returns one example of each type for standard mode
 * This version uses fetch directly and doesn't require a page object
 *
 * @param {string} baseUrl - WordPress base URL
 * @returns {Promise<Object>} Object with different list page types and examples
 */
export async function discoverListPageTypesFetch(baseUrl) {
  const listPages = {
    categories: [],
    tags: [],
    authors: [],
    dateArchives: [],
    customPostTypeArchives: [],
    search: null,
  };

  const base = baseUrl.replace(/\/$/, '');

  // Discover categories
  try {
    const url = `${base}/wp-json/wp/v2/categories?per_page=1&hide_empty=false`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'cross-fit-test-tool/1.0',
      },
      redirect: 'follow',
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      listPages.categories = data.map(cat => ({
        id: cat.id,
        slug: cat.slug,
        link: cat.link || `/category/${cat.slug}/`,
      }));
    }
  } catch (error) {
    throw error;
  }

  // Discover tags
  try {
    const url = `${base}/wp-json/wp/v2/tags?per_page=1&hide_empty=false`;
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      listPages.tags = data.map(tag => ({
        id: tag.id,
        slug: tag.slug,
        link: tag.link || `/tag/${tag.slug}/`,
      }));
    }
  } catch (error) {
    throw error;
  }

  // Discover authors
  try {
    const url = `${base}/wp-json/wp/v2/users?per_page=1`;
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      listPages.authors = data.map(author => ({
        id: author.id,
        slug: author.slug,
        link: author.link || `/author/${author.slug}/`,
      }));
    }
  } catch (error) {
    throw error;
  }

  // Discover date archives
  try {
    const url = `${base}/wp-json/wp/v2/posts?per_page=1&status=publish`;
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      const post = data[0];
      if (post.date) {
        const date = new Date(post.date);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        listPages.dateArchives = [
          { type: 'year', path: `/${year}/`, link: `/${year}/` },
          { type: 'month', path: `/${year}/${month}/`, link: `/${year}/${month}/` },
        ];
      }
    }
  } catch (error) {
    throw error;
  }

  // Discover custom post type archives
  try {
    const url = `${base}/wp-json/wp/v2/types`;
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    if (data && typeof data === 'object') {
      for (const [slug, typeData] of Object.entries(data)) {
        if (typeData.has_archive && typeData.rest_base) {
          const archivePath = typeData.has_archive === true ? `/${slug}/` : `/${typeData.has_archive}/`;
          listPages.customPostTypeArchives.push({
            postType: slug,
            path: archivePath,
            link: archivePath,
          });
        }
      }
    }
  } catch (error) {
    throw error;
  }

  listPages.search = { path: '/?s=test', link: '/?s=test' };

  return listPages;
}

/**
 * Discover WordPress list page types (archives, search, etc.)
 * Returns one example of each type for standard mode
 *
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {Object} wpInstance - WordPress instance with url property
 * @returns {Promise<Object>} Object with different list page types and examples
 */
export async function discoverListPageTypes(page, wpInstance) {
  const data = await loadDiscoveryDataFromFile(page, wpInstance);
  const rawListPages = data.listPages || {};

  const listPages = {
    categories: rawListPages.categories || [],
    tags: rawListPages.tags || [],
    authors: rawListPages.authors || [],
    dateArchives: rawListPages.dateArchives || [],
    customPostTypeArchives: rawListPages.customPostTypeArchives || [],
    search: rawListPages.search || null,
  };

  // Convert URLs to paths for categories, tags, authors
  if (listPages.categories) {
    listPages.categories = listPages.categories.map(cat => ({
      ...cat,
      link: cat.url ? new URL(cat.url).pathname : `/category/${cat.slug}/`,
    }));
  }
  if (listPages.tags) {
    listPages.tags = listPages.tags.map(tag => ({
      ...tag,
      link: tag.url ? new URL(tag.url).pathname : `/tag/${tag.slug}/`,
    }));
  }
  if (listPages.authors) {
    listPages.authors = listPages.authors.map(author => ({
      ...author,
      link: author.url ? new URL(author.url).pathname : `/author/${author.slug}/`,
    }));
  }
  if (listPages.dateArchives) {
    listPages.dateArchives = listPages.dateArchives.map(archive => ({
      ...archive,
      path: archive.url ? new URL(archive.url).pathname : `/${archive.year}/${archive.month}/`,
      link: archive.url ? new URL(archive.url).pathname : `/${archive.year}/${archive.month}/`,
    }));
  }
  if (listPages.customPostTypeArchives) {
    listPages.customPostTypeArchives = listPages.customPostTypeArchives.map(archive => ({
      ...archive,
      path: archive.url ? new URL(archive.url).pathname : `/${archive.slug}/`,
      link: archive.url ? new URL(archive.url).pathname : `/${archive.slug}/`,
    }));
  }
  if (listPages.search && listPages.search.url) {
    const searchUrl = new URL(listPages.search.url);
    const searchPath = searchUrl.pathname + (searchUrl.search || '');
    listPages.search = {
      path: searchPath,
      link: searchPath,
    };
  } else if (!listPages.search) {
    listPages.search = { path: '/?s=test', link: '/?s=test' };
  }

  return listPages;
}

/**
 * Get all instances of each list page type
 * Used for full test mode
 *
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {Object} wpInstance - WordPress instance with url property
 * @returns {Promise<Object>} Object with all list page instances
 */
export async function getAllListPageInstances(page, wpInstance) {
  const listPages = {
    categories: [],
    tags: [],
    authors: [],
    dateArchives: [],
    customPostTypeArchives: [],
    search: [{ path: '/?s=test', link: '/?s=test' }], // Just one search example
  };

  // Get all categories
  try {
    let pageNum = 1;
    let hasMore = true;
    while (hasMore) {
      const result = await testWordPressRESTAPI(page, wpInstance, `/wp-json/wp/v2/categories?per_page=100&page=${pageNum}&hide_empty=false`, {
        expectedStatus: 200,
      });
      if (Array.isArray(result.data) && result.data.length > 0) {
        for (const cat of result.data) {
          listPages.categories.push({
            id: cat.id,
            slug: cat.slug,
            link: cat.link || `/category/${cat.slug}/`,
          });
        }
        const totalPages = parseInt(result.response.headers()['x-wp-totalpages'] || '1', 10);
        hasMore = pageNum < totalPages;
        pageNum++;
      } else {
        hasMore = false;
      }
    }
  } catch (error) {
    console.warn('Warning: Could not fetch all categories:', error.message);
  }

  // Get all tags
  try {
    let pageNum = 1;
    let hasMore = true;
    while (hasMore) {
      const result = await testWordPressRESTAPI(page, wpInstance, `/wp-json/wp/v2/tags?per_page=100&page=${pageNum}&hide_empty=false`, {
        expectedStatus: 200,
      });
      if (Array.isArray(result.data) && result.data.length > 0) {
        for (const tag of result.data) {
          listPages.tags.push({
            id: tag.id,
            slug: tag.slug,
            link: tag.link || `/tag/${tag.slug}/`,
          });
        }
        const totalPages = parseInt(result.response.headers()['x-wp-totalpages'] || '1', 10);
        hasMore = pageNum < totalPages;
        pageNum++;
      } else {
        hasMore = false;
      }
    }
  } catch (error) {
    console.warn('Warning: Could not fetch all tags:', error.message);
  }

  // Get all authors
  try {
    let pageNum = 1;
    let hasMore = true;
    while (hasMore) {
      const result = await testWordPressRESTAPI(page, wpInstance, `/wp-json/wp/v2/users?per_page=100&page=${pageNum}`, {
        expectedStatus: 200,
      });
      if (Array.isArray(result.data) && result.data.length > 0) {
        for (const author of result.data) {
          listPages.authors.push({
            id: author.id,
            slug: author.slug,
            link: author.link || `/author/${author.slug}/`,
          });
        }
        const totalPages = parseInt(result.response.headers()['x-wp-totalpages'] || '1', 10);
        hasMore = pageNum < totalPages;
        pageNum++;
      } else {
        hasMore = false;
      }
    }
  } catch (error) {
    console.warn('Warning: Could not fetch all authors:', error.message);
  }

  // Get all date archives - need to get all posts and extract unique dates
  try {
    const postsResult = await testWordPressRESTAPI(page, wpInstance, '/wp-json/wp/v2/posts?per_page=100&status=publish', {
      expectedStatus: 200,
    });
    if (Array.isArray(postsResult.data) && postsResult.data.length > 0) {
      const dateSet = new Set();
      for (const post of postsResult.data) {
        if (post.date) {
          const date = new Date(post.date);
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          dateSet.add(`${year}/${month}`);
          dateSet.add(year.toString());
        }
      }
      for (const dateStr of dateSet) {
        if (dateStr.includes('/')) {
          listPages.dateArchives.push({ type: 'month', path: `/${dateStr}/`, link: `/${dateStr}/` });
        } else {
          listPages.dateArchives.push({ type: 'year', path: `/${dateStr}/`, link: `/${dateStr}/` });
        }
      }
    }
  } catch (error) {
    console.warn('Warning: Could not discover all date archives:', error.message);
  }

  // Custom post type archives (same as standard mode, but we'll include all)
  try {
    const typesResult = await testWordPressRESTAPI(page, wpInstance, '/wp-json/wp/v2/types', {
      expectedStatus: 200,
    });
    if (typesResult.data && typeof typesResult.data === 'object') {
      for (const [slug, typeData] of Object.entries(typesResult.data)) {
        if (typeData.has_archive && typeData.rest_base) {
          const archivePath = typeData.has_archive === true ? `/${slug}/` : `/${typeData.has_archive}/`;
          listPages.customPostTypeArchives.push({
            postType: slug,
            path: archivePath,
            link: archivePath,
          });
        }
      }
    }
  } catch (error) {
    console.warn('Warning: Could not discover custom post type archives:', error.message);
  }

  return listPages;
}

/**
 * Discover WordPress admin menu items (top-level only)
 * Uses PHP execution to access $GLOBALS['menu']
 *
 * @param {Object} wpInstance - WordPress instance with server property
 * @returns {Promise<Array<Object>>} Array of menu item objects with slug, title, and URL
 */
export async function discoverAdminMenuItems(wpInstance, page = null) {
  // If page is not provided, we can't make the request
  if (!page) {
    throw new Error('Page object is required for admin menu discovery');
  }

  const data = await loadDiscoveryDataFromFile(page, wpInstance);
  const adminMenuItems = Array.isArray(data.adminMenuItems) ? data.adminMenuItems : [];
  return adminMenuItems;
}

/**
 * Load discovery data from wp-content/big-mistake-discovery.json
 * Uses Playwright's page.request to fetch the JSON file.
 *
 * Caching: Uses global.wpDiscoveryFileCache to cache the discovery file data
 * across calls within a worker. This cache persists for the lifetime of the worker
 * but is cleared when workers restart, which is acceptable since the discovery file
 * is created during global setup and should be available for all tests.
 *
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {Object} wpInstance - WordPress instance with url property
 * @returns {Promise<Object>} Parsed discovery data object
 */
async function loadDiscoveryDataFromFile(page, wpInstance) {
  // Use global cache to persist across calls within a worker
  // Initialize if it doesn't exist
  if (!global.wpDiscoveryFileCache) {
    global.wpDiscoveryFileCache = null;
  }

  if (global.wpDiscoveryFileCache) {
    return global.wpDiscoveryFileCache;
  }

  const url = normalizePath(wpInstance.url, '/wp-content/big-mistake-discovery.json');

  const response = await page.request.get(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  const status = response.status();
  if (status !== 200) {
    const bodyText = await response.text().catch(() => '');
    throw new Error(
      `Failed to load discovery data from ${url}: HTTP ${status}. ` +
      `Response: ${bodyText.substring(0, 200)}`
    );
  }

  const data = await response.json().catch((err) => {
    throw new Error(`Failed to parse discovery JSON from ${url}: ${err.message}`);
  });

  global.wpDiscoveryFileCache = data || {};
  return global.wpDiscoveryFileCache;
}

/**
 * Discover WordPress admin submenu items for a given parent menu
 * Uses PHP execution to access $GLOBALS['submenu']
 *
 * @param {Object} wpInstance - WordPress instance with server property
 * @param {string} parentSlug - Parent menu slug
 * @returns {Promise<Array<Object>>} Array of submenu item objects with slug, title, and URL
 */
/**
 * Discover all admin submenu items as a flat list
 * Fetches discovery data once and returns all submenu items regardless of parent
 *
 * @param {Object} wpInstance - WordPress instance with url property
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @returns {Promise<Array<Object>>} Array of all submenu items
 */
export async function discoverAllAdminSubmenuItems(wpInstance, page) {
  if (!page) {
    throw new Error('Page object is required for admin submenu discovery');
  }

  const data = await loadDiscoveryDataFromFile(page, wpInstance);
  const allSubmenus = Array.isArray(data.adminSubmenuItems) ? data.adminSubmenuItems : [];
  return allSubmenus;
}

/**
 * Discover admin submenu items for a specific parent menu item
 * @deprecated Use discoverAllAdminSubmenuItems and filter client-side for better performance
 *
 * @param {Object} wpInstance - WordPress instance with url property
 * @param {string} parentSlug - Parent menu slug to filter by
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @returns {Promise<Array<Object>>} Array of submenu items for the specified parent
 */
export async function discoverAdminSubmenuItems(wpInstance, parentSlug, page) {
  if (!page) {
    throw new Error('Page object is required for admin submenu discovery');
  }

  const data = await loadDiscoveryDataFromFile(page, wpInstance);
  const allSubmenus = Array.isArray(data.adminSubmenuItems) ? data.adminSubmenuItems : [];

  // Filter by parent slug
  const submenuItems = allSubmenus.filter((item) => item.parent === parentSlug);
  return submenuItems;
}

/**
 * Test WordPress RSS feed with XML validation
 *
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {Object} wpInstance - WordPress instance with url property
 * @param {string} path - Relative path to RSS feed (e.g., '/feed/')
 * @param {Object} options - Optional test options
 */
export async function testWordPressRSSFeed(page, wpInstance, path, options = {}) {
  const feedUrl = normalizePath(wpInstance.url, path);
  const response = await page.goto(feedUrl, { waitUntil: 'load' });

  expect(response.status()).toBe(200);

  // Check content type
  const contentType = response.headers()['content-type'] || '';
  expect(
    contentType.includes('xml') ||
    contentType.includes('rss') ||
    contentType.includes('atom')
  ).toBe(true);

  // Validate RSS feed structure using browser's DOMParser
  const feedValidation = await page.evaluate(() => {
    const parser = new DOMParser();
    const xmlText = document.body.textContent || document.documentElement.textContent;
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

    // Check for parse errors
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
      return { valid: false, error: 'XML parse error' };
    }

    // Check for RSS structure
    const rss = xmlDoc.querySelector('rss');
    const channel = xmlDoc.querySelector('channel');
    const title = xmlDoc.querySelector('channel > title');
    const description = xmlDoc.querySelector('channel > description');

    return {
      valid: !!(rss && channel && title && description),
      hasRss: !!rss,
      hasChannel: !!channel,
      hasTitle: !!title,
      hasDescription: !!description,
      titleText: title ? title.textContent : null,
    };
  });

  expect(feedValidation.valid).toBe(true);
  expect(feedValidation.hasRss).toBe(true);
  expect(feedValidation.hasChannel).toBe(true);
  expect(feedValidation.hasTitle).toBe(true);
  expect(feedValidation.hasDescription).toBe(true);

  return {
    response,
    contentType,
    channelTitle: feedValidation.titleText,
  };
}

/**
 * Composable test steps for WordPress admin pages
 * These steps can be used individually or together via testWordPressAdminPage()
 */

/**
 * Step 1: Set up error tracking listeners for console and page errors
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @returns {Object} Tracking object with { consoleErrors, pageErrors, cleanup }
 */
export function setupErrorTracking(page) {
  const consoleErrors = [];
  const pageErrors = [];

  const consoleListener = (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push({
        text: msg.text(),
        location: msg.location(),
      });
    }
  };

  const pageErrorListener = (error) => {
    pageErrors.push({
      message: error.message,
      stack: error.stack,
    });
  };

  page.on('console', consoleListener);
  page.on('pageerror', pageErrorListener);

  return {
    consoleErrors,
    pageErrors,
    cleanup: () => {
      page.off('console', consoleListener);
      page.off('pageerror', pageErrorListener);
    },
  };
}

/**
 * Step 2: Navigate to admin page with retry logic and status check
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {string} url - Full URL to navigate to
 * @param {number} [retryDelayMs=500] - Delay before retrying navigation
 * @param {number} [navigationTimeout=30000] - Navigation timeout
 */
export async function navigateToAdminPage(page, url, retryDelayMs = 500, navigationTimeout = 30000) {
  if (page.isClosed()) {
    throw new Error('Page was closed before navigation');
  }

  let response;
  try {
    response = await page.goto(url, { waitUntil: 'commit', timeout: navigationTimeout });
    } catch (e) {
      if (page.isClosed()) {
        throw new Error('Page was closed during navigation');
      }
      if (String(e.message || '').includes('ERR_ABORTED') || String(e.message || '').includes('Target page')) {
        await page.waitForTimeout(retryDelayMs);
        if (page.isClosed()) {
          throw new Error('Page was closed after navigation error');
        }
        try {
        response = await page.goto(url, { waitUntil: 'commit', timeout: navigationTimeout });
        } catch (retryError) {
          if (page.isClosed()) {
            throw new Error('Page was closed during retry navigation');
          }
          throw retryError;
        }
      } else {
        throw e;
    }
  }

  // Check response status internally
  if (response) {
    expect(response.status()).toBe(200);
  }
}

/**
 * Step 3: Wait for admin UI elements to appear
 * @param {import('@playwright/test').Page} page - Playwright page object
 */
export async function waitForAdminUI(page) {
  await Promise.race([
    page.waitForSelector('#wpadminbar', { timeout: 5000 }),
    page.waitForSelector('#adminmenumain', { timeout: 5000 }),
    page.waitForSelector('body.wp-admin', { timeout: 5000 }),
    page.waitForSelector('#wpbody-content', { timeout: 5000 }),
  ]).catch(() => {
    // If none found, continue - we'll check below
  });
}

/**
 * Step 4: Wait for JavaScript to be ready (hide hide-if-js elements)
 * @param {import('@playwright/test').Page} page - Playwright page object
 */
export async function waitForJavaScriptReady(page) {
  try {
    await page.waitForFunction(
      () => {
        const jsLoaded = typeof jQuery !== 'undefined' || typeof wp !== 'undefined';
        if (!jsLoaded) {
          return false;
        }
        const hideIfJsElements = Array.from(document.querySelectorAll('.hide-if-js'));
        const visibleCount = hideIfJsElements.filter(el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && !el.classList.contains('hidden');
        }).length;
        return visibleCount === 0;
      },
      { timeout: 2000 }
    ).catch(() => {
      // Continue if timeout - we'll filter notices in detection anyway
    });
  } catch (err) {
    // Continue if wait fails
  }
}

/**
 * Step 5: Get page content and detect PHP errors
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @returns {Promise<Object>} Object with { pageContent, phpErrors }
 */
export async function getPageContentAndPHPErrors(page) {
  let phpErrors = [];
  let pageContent = null;
  try {
    if (!page.isClosed()) {
      pageContent = await page.content();
      phpErrors = detectPHPErrors(pageContent);
    }
  } catch (err) {
    console.warn('Error while getting page content or detecting PHP errors:', err);
  }
  return { pageContent, phpErrors };
}

/**
 * Step 6: Check for admin chrome elements (admin bar, menu, etc.)
 * Verifies that at least one admin UI element is present
 * @param {import('@playwright/test').Page} page - Playwright page object
 */
export async function checkAdminChrome(page) {
  const adminCheck = await page.evaluate(() => {
    return {
      hasAdminBody: document.body?.classList?.contains('wp-admin') || false,
      hasAdminBar: !!document.querySelector('#wpadminbar'),
      hasAdminMenu: !!document.querySelector('#adminmenumain'),
      hasWpBodyContent: !!document.querySelector('#wpbody-content'),
    };
  });

  // Assert that at least one admin element is present
  expect(
    adminCheck.hasAdminBody ||
    adminCheck.hasAdminBar ||
    adminCheck.hasAdminMenu ||
    adminCheck.hasWpBodyContent
  ).toBe(true);
}

/**
 * Step 7: Check authentication (ensure not redirected to login)
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {string} path - Page path for error context
 */
export async function checkAuthentication(page, path) {
  const currentUrl = page.url();
  const isLoginPage = currentUrl.includes('/wp-login.php');
  expect(isLoginPage).toBe(false);
}

/**
 * Step 8: Check for PHP errors in page content
 * @param {Array} phpErrors - Array of detected PHP errors
 * @param {boolean} allowErrors - Whether to allow PHP errors
 * @param {string} path - Page path for error context
 */
export function checkForPHPErrors(phpErrors, allowErrors, path) {
  if (!allowErrors && phpErrors.length > 0) {
    console.error('\n[PHP Errors Detected in Admin Page]');
    phpErrors.forEach((err, i) => {
      console.error(`  ${i + 1}. ${err.type.toUpperCase()}: ${err.message}`);
      if (err.file) {
        console.error(`     File: ${err.file}${err.line ? `:${err.line}` : ''}`);
      }
    });
    expect(phpErrors).toHaveLength(0);
  }
}

/**
 * Step 9: Check for JavaScript errors (console and page errors)
 * @param {Array} consoleErrors - Array of console errors
 * @param {Array} pageErrors - Array of page errors
 * @param {boolean} allowConsoleErrors - Whether to allow console errors
 * @param {boolean} allowPageErrors - Whether to allow page errors
 * @param {string} path - Page path for error context
 */
export function checkForJavaScriptErrors(consoleErrors, pageErrors, allowConsoleErrors, allowPageErrors, path) {
  if (!allowConsoleErrors && consoleErrors.length > 0) {
    console.error(`\n[JavaScript Console Errors Detected in Admin Page] (${path})`);
    consoleErrors.forEach((err, i) => {
      console.error(`  ${i + 1}. ${err.text}`);
      if (err.location) {
        console.error(`     Location: ${err.location.url}${err.location.lineNumber ? `:${err.location.lineNumber}` : ''}`);
      }
    });
    expect(consoleErrors).toHaveLength(0);
  }

  if (!allowPageErrors && pageErrors.length > 0) {
    console.error(`\n[JavaScript Page Errors Detected in Admin Page] (${path})`);
    pageErrors.forEach((err, i) => {
      console.error(`  ${i + 1}. ${err.message}`);
      if (err.stack) {
        console.error(`     Stack: ${err.stack.split('\n').slice(0, 3).join('\n     ')}`);
      }
    });
    expect(pageErrors).toHaveLength(0);
  }
}

/**
 * Step 10: Check for WordPress dashboard notices
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {string} path - Page path for whitelist matching
 * @returns {Promise<Array>} Array of dashboard notices
 */
export async function checkDashboardNotices(page, path) {
  let dashboardNotices = [];
  try {
    if (!page.isClosed()) {
      dashboardNotices = await page.evaluate(() => {
        const notices = [];
        const noticeSelectors = [
          '.notice-error',
          '.notice-warning',
          '.notice-info',
          '.notice-success',
          '.notice.notice-error',
          '.notice.notice-warning',
          '.notice.notice-info',
          '.notice.notice-success',
        ];

        noticeSelectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            const style = window.getComputedStyle(el);
            const display = style.display;
            const visibility = style.visibility;
            const opacity = style.opacity;
            const hasHiddenClass = el.classList.contains('hidden');

            const isVisible = display !== 'none' &&
                             visibility !== 'hidden' &&
                             !hasHiddenClass &&
                             opacity !== '0';

            if (!isVisible) {
              return;
            }

            const text = el.innerText.trim();
            const dismissButton = el.querySelector('.notice-dismiss');
            const noticeText = dismissButton ? text.replace(dismissButton.innerText, '').trim() : text;

            if (noticeText) {
              let type = 'unknown';
              if (el.classList.contains('notice-error')) {
                type = 'error';
              } else if (el.classList.contains('notice-warning')) {
                type = 'warning';
              } else if (el.classList.contains('notice-info')) {
                type = 'info';
              } else if (el.classList.contains('notice-success')) {
                type = 'success';
              }

              notices.push({ type, text: noticeText });
            }
          });
        });

        const uniqueNotices = [];
        const seen = new Set();
        notices.forEach(notice => {
          const key = `${notice.type}:${notice.text}`;
          if (!seen.has(key)) {
            seen.add(key);
            uniqueNotices.push(notice);
          }
        });

        return uniqueNotices;
      });
    }
  } catch (err) {
    console.warn('Error while detecting dashboard notices:', err);
  }

  // Page-specific notice whitelist
  const noticeWhitelist = {
    '/wp-admin/theme-editor.php': [
      { type: 'warning', pattern: /minified version.*stylesheet/i },
      { type: 'info', pattern: /edit and live preview CSS/i },
      { type: 'info', pattern: /[(]style[.]css[)]/i },
    ],
    '/wp-admin/plugin-editor.php': [
      { type: 'info', pattern: /\.php$/i },
    ],
    '/wp-admin/post-new.php': [
      { type: 'error', pattern: /block editor requires JavaScript/i },
    ],
    '/wp-admin/post-new.php?post_type=page': [
      { type: 'error', pattern: /block editor requires JavaScript/i },
    ],
  };

  const filteredNotices = dashboardNotices.filter(notice => {
    const pageWhitelist = noticeWhitelist[path];
    if (!pageWhitelist) {
      return true;
    }
    const isWhitelisted = pageWhitelist.some(entry => {
      const typeMatches = entry.type === notice.type || entry.type === 'unknown';
      const patternMatches = entry.pattern.test(notice.text || '');
      return typeMatches && patternMatches;
    });
    return !isWhitelisted;
  });

  const errorNotices = filteredNotices.filter(n => n.type === 'error');
  if (errorNotices.length > 0) {
    console.error(`\n[WordPress Dashboard Error Notices Detected] (${path})`);
    errorNotices.forEach((notice, i) => {
      console.error(`  ${i + 1}. ${notice.text}`);
    });
    expect(errorNotices).toHaveLength(0);
  }

  const nonErrorNotices = filteredNotices.filter(n => n.type !== 'error');
  if (nonErrorNotices.length > 0) {
    console.warn(`\n[WordPress Dashboard Notices (non-error) Detected] (${path})`);
    nonErrorNotices.forEach((notice, i) => {
      const textDisplay = notice.text || '(no text)';
      console.warn(`  ${i + 1}. [${notice.type.toUpperCase()}] ${textDisplay}`);
    });
  }

  return dashboardNotices;
}

/**
 * Step 11: Compare screenshot if needed
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {string} path - Page path
 * @param {string} pageContent - Page HTML content
 */
export async function compareScreenshotIfNeeded(page, path, pageContent) {
  if (pageContent && !page.isClosed() && process.env.SKIP_SNAPSHOTS !== '1') {
    const snapshotName = pathToSnapshotName(path);
    if (SCREENSHOT_SKIP_PATHS.some(skipPath => path.includes(skipPath))) {
      return;
    }
    await compareScreenshot(page, path, snapshotName, { waitForStabilization: true });
  }
}

/**
 * Composable test steps for WordPress public pages
 */

/**
 * Navigate to a public WordPress page and check status
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {string} url - Full URL to navigate to
 * @param {string} [waitUntil='load'] - Playwright waitUntil option
 * @param {number} [expectedStatus=200] - Expected HTTP status code
 */
export async function navigateToPage(page, url, waitUntil = 'load', expectedStatus = 200) {
  const response = await page.goto(url, { waitUntil });
  expect(response.status()).toBe(expectedStatus);
}

/**
 * Validate page title
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {string|RegExp} expectedTitle - Expected title (string or regex)
 */
export async function validatePageTitle(page, expectedTitle) {
  if (!expectedTitle) return;
  const title = await page.title();
  if (typeof expectedTitle === 'string') {
    expect(title).toContain(expectedTitle);
  } else {
    expect(title).toMatch(expectedTitle);
  }
}

/**
 * Validate body class
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {string|RegExp} expectedBodyClass - Expected body class (string or regex)
 */
export async function validateBodyClass(page, expectedBodyClass) {
  if (!expectedBodyClass) return;
  const bodyClasses = await page.evaluate(() => document.body.className);
  if (typeof expectedBodyClass === 'string') {
    expect(bodyClasses).toContain(expectedBodyClass);
  } else {
    expect(bodyClasses).toMatch(expectedBodyClass);
  }
}

/**
 * Check for PHP errors in public pages (simpler version without path context)
 * @param {Array} phpErrors - Array of detected PHP errors
 * @param {boolean} allowErrors - Whether to allow PHP errors
 */
export function checkForPHPErrorsPublic(phpErrors, allowErrors) {
  if (!allowErrors && phpErrors.length > 0) {
    console.error('\n[PHP Errors Detected]');
    phpErrors.forEach((err, i) => {
      console.error(`  ${i + 1}. ${err.type.toUpperCase()}: ${err.message}`);
      if (err.file) {
        console.error(`     File: ${err.file}${err.line ? `:${err.line}` : ''}`);
      }
    });
    expect(phpErrors).toHaveLength(0);
  }
}

/**
 * Check for JavaScript errors in public pages (simpler version without path context)
 * @param {Array} consoleErrors - Array of console errors
 * @param {Array} pageErrors - Array of page errors
 * @param {boolean} allowConsoleErrors - Whether to allow console errors
 * @param {boolean} allowPageErrors - Whether to allow page errors
 */
export function checkForJavaScriptErrorsPublic(consoleErrors, pageErrors, allowConsoleErrors, allowPageErrors) {
  if (!allowConsoleErrors && consoleErrors.length > 0) {
    expect(consoleErrors).toHaveLength(0);
  }
  if (!allowPageErrors && pageErrors.length > 0) {
    expect(pageErrors).toHaveLength(0);
  }
}

/**
 * Compare screenshot for public pages
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {string} path - Page path
 * @param {string} pageContent - Page HTML content
 * @param {boolean} allowPHPErrors - Whether PHP errors are allowed (skip screenshot if true)
 */
export async function compareScreenshotPublic(page, path, pageContent, allowPHPErrors) {
  if (process.env.SKIP_SNAPSHOTS !== '1' && !allowPHPErrors) {
    const snapshotName = pathToSnapshotName(path);
    await compareScreenshot(page, path, snapshotName, { waitForStabilization: false });
  }
}

/**
 * Simple helper to navigate to an admin page and verify basic response
 * This is a lightweight function for tests that just need to load an admin page
 * without all the comprehensive validation steps.
 *
 * For comprehensive admin page testing with error detection, use the individual
 * step functions directly (setupErrorTracking, navigateToAdminPage, etc.)
 *
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {Object} wpInstance - WordPress instance with url property
 * @param {string} path - Relative path to admin page (e.g., '/wp-admin/')
 */
export async function testWordPressAdminPage(page, wpInstance, path) {
  const url = normalizePath(wpInstance.url, path);

  // Navigate to admin page with retry logic
  const response = await navigateToAdminPage(page, url);
  if (response) {
    expect(response.status()).toBe(200);
  }

  // Wait for basic admin UI elements to confirm page loaded
  await waitForAdminUI(page);
}

/**
 * Test WordPress REST API endpoint
 *
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {Object} wpInstance - WordPress instance with url property
 * @param {string} path - Relative path to REST API endpoint (e.g., '/wp-json/wp/v2/posts')
 * @param {Object} options - Optional test options
 * @param {string} options.method - HTTP method (default: 'GET')
 * @param {Object} options.headers - Additional headers
 * @param {Object} options.body - Request body (for POST/PUT)
 * @param {number} options.expectedStatus - Expected HTTP status (default: 200)
 * @param {Function} options.validateResponse - Custom validation function
 */
export async function testWordPressRESTAPI(page, wpInstance, path, options = {}) {
  const url = normalizePath(wpInstance.url, path);
  const {
    method = 'GET',
    headers = {},
    body = null,
    expectedStatus = 200,
    validateResponse = null,
  } = options;


  // Make API request using Playwright's APIRequestContext
  // page.request is an APIRequestContext that provides get(), post(), etc.
  let response;

  const requestHeaders = {
    'Content-Type': 'application/json',
    ...headers,
  };

  switch (method.toUpperCase()) {
    case 'GET':
      response = await page.request.get(url, { headers: requestHeaders });
      break;
    case 'POST':
      response = await page.request.post(url, {
        headers: requestHeaders,
        data: body,
      });
      break;
    case 'PUT':
      response = await page.request.put(url, {
        headers: requestHeaders,
        data: body,
      });
      break;
    case 'DELETE':
      response = await page.request.delete(url, { headers: requestHeaders });
      break;
    default:
      response = await page.request.get(url, { headers: requestHeaders });
  }

  const status = response.status();
  if (status !== expectedStatus) {
    // Get error details for debugging
    const contentType = response.headers()['content-type'] || '';
    let errorBody = '';
    try {
      if (contentType.includes('json')) {
        const errorData = await response.json();
        errorBody = JSON.stringify(errorData, null, 2);
      } else {
        errorBody = await response.text();
      }
    } catch (e) {
      errorBody = `Could not read error response: ${e.message}`;
    }

    throw new Error(
      `Expected HTTP ${expectedStatus} but got ${status} for ${path}\n` +
      `Response body:\n${errorBody.substring(0, 1000)}`
    );
  }

  // Parse JSON response
  const contentType = response.headers()['content-type'] || '';
  let responseData = null;

  if (contentType.includes('json')) {
    responseData = await response.json();
  } else {
    const text = await response.text();
    responseData = text;
  }

  // Custom validation if provided
  if (validateResponse) {
    await validateResponse(responseData, response);
  }

  // Basic JSON validation if response is JSON
  if (contentType.includes('json') && method.toUpperCase() === 'GET') {
    expect(responseData).toBeTruthy();
    // WordPress REST API typically returns an object or array
    expect(typeof responseData === 'object' || Array.isArray(responseData)).toBe(true);
  }

  return {
    response,
    data: responseData,
    status: response.status(),
    contentType,
  };
}

/**
 * Test WordPress REST API endpoints in bulk
 *
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {Object} wpInstance - WordPress instance with url property
 * @param {Array<string|Object>} endpoints - Array of endpoint paths (relative to /wp-json/wp/v2) or objects with path and options
 */
export async function testWordPressRESTEndpoints(page, wpInstance, endpoints) {
  const results = [];

  for (const endpointDef of endpoints) {
    let path, options;

    if (typeof endpointDef === 'string') {
      path = endpointDef;
      options = {};
    } else {
      path = endpointDef.path;
      options = endpointDef.options || {};
    }

    // Ensure path starts with /wp-json/wp/v2
    // If path doesn't start with /wp-json/, assume it's relative to /wp-json/wp/v2
    let apiPath;
    if (path.startsWith('/wp-json/')) {
      apiPath = path;
    } else {
      const normalizedPath = path.startsWith('/') ? path : `/${path}`;
      apiPath = `/wp-json/wp/v2${normalizedPath}`;
    }

    const result = await testWordPressRESTAPI(page, wpInstance, apiPath, options);

    results.push({
      path: apiPath,
      url: normalizePath(wpInstance.url, apiPath),
      ...result,
    });
  }

  return results;
}

/**
 * Read discovery file synchronously at file load time
 * This allows us to use Playwright's forEach pattern to generate individual test() calls
 * Reference: https://playwright.dev/docs/test-parameterize
 * @returns {Object|null} Discovery data object or null if file not found
 */
export function loadDiscoveryDataSync() {
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

/**
 * Prepare admin pages to test from discovery data
 * Combines menu and submenu items into a single list for unified testing
 * Submenu items are only included in FULL_MODE
 * @param {Object} discoveryData - Discovery data from loadDiscoveryDataSync()
 * @returns {Array} Array of page items with path, title, slug, and description
 */
export function prepareAdminPagesToTest(discoveryData) {
  const allPages = [];

  // Add menu items
  if (discoveryData?.adminMenuItems) {
    for (const menuItem of discoveryData.adminMenuItems) {
      const url = new URL(menuItem.url);
      const path = url.pathname + url.search;
      allPages.push({
        path,
        title: menuItem.title,
        slug: menuItem.slug,
        description: `Admin menu: ${menuItem.title} (${menuItem.slug})`,
      });
    }
  }

  // Add submenu items (only in full mode)
  if (process.env.FULL_MODE === '1' && discoveryData?.adminSubmenuItems) {
    for (const submenuItem of discoveryData.adminSubmenuItems) {
      const submenuUrl = new URL(submenuItem.url);
      const submenuPath = submenuUrl.pathname + submenuUrl.search;
      allPages.push({
        path: submenuPath,
        title: submenuItem.title,
        slug: submenuItem.slug,
        description: `Admin submenu: ${submenuItem.title} (${submenuItem.slug})`,
      });
    }
  }

  // Filter out excluded pages
  return allPages.filter((item) => {
    // Exclude pages that trigger expected WordPress.org API connection errors
    const apiErrorPaths = [
      '/wp-admin/plugin-install.php',
      '/wp-admin/update-core.php',
    ];
    return !apiErrorPaths.includes(item.path);
  });
}

/**
 * Prepare public pages to test from discovery data
 * Combines post items, list pages, and common pages into a single list for unified testing
 * Post items are filtered: one per type in standard mode, all in FULL_MODE
 * @param {Object} discoveryData - Discovery data from loadDiscoveryDataSync()
 * @returns {Array} Array of page items with path, title, bodyClass, type, and description
 */
export function preparePublicPagesToTest(discoveryData) {
  const allPages = [];
  const isFullMode = process.env.FULL_MODE === '1';

  // Add post items (filter: one per type in standard mode, all in full mode)
  if (discoveryData?.postItems) {
    const postItemsByType = new Map();

    // Group items by post type
    for (const item of discoveryData.postItems) {
      if (!item.path) continue;

      if (!postItemsByType.has(item.postType)) {
        postItemsByType.set(item.postType, []);
      }
      postItemsByType.get(item.postType).push(item);
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

  // Add list pages (flat array, no filtering needed)
  if (discoveryData?.listPages && Array.isArray(discoveryData.listPages)) {
    allPages.push(...discoveryData.listPages);
  }

  // Add common pages (homepage, feed)
  if (discoveryData?.commonPages && Array.isArray(discoveryData.commonPages)) {
    allPages.push(...discoveryData.commonPages);
  }

  return allPages;
}

