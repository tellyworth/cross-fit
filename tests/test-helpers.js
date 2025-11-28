import { expect } from '@playwright/test';
import { readFileSync, existsSync } from 'fs';

/**
 * Reusable test helpers for WordPress E2E testing
 * Following Playwright's recommended patterns
 */

/**
 * Normalize URL - handles full URLs or relative paths
 * @param {string} baseUrl - Base URL from wpInstance
 * @param {string} path - Relative path (e.g., '/wp-admin/') or full URL
 * @returns {string} Full URL
 */
function normalizePath(baseUrl, path) {
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
    waitUntil = 'load', // Allow override for tests that need networkidle
  } = options;

  // Track errors - set up listeners before navigation
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push({
        text: msg.text(),
        location: msg.location(),
      });
    }
  });

  page.on('pageerror', (error) => {
    pageErrors.push({
      message: error.message,
      stack: error.stack,
    });
  });

  // Navigate and check response
  // Use 'load' by default for faster tests (networkidle waits 500ms for no activity)
  // Some tests may need 'networkidle' to capture errors that occur during network activity
  const response = await page.goto(url, { waitUntil });

  expect(response.status()).toBe(expectedStatus);

  // Detect PHP errors in page content (when WP_DEBUG_DISPLAY is enabled)
  const pageContent = await page.content();
  const phpErrors = detectPHPErrors(pageContent);

  // Validate title if specified
  if (expectedTitle) {
    const title = await page.title();
    if (typeof expectedTitle === 'string') {
      expect(title).toContain(expectedTitle);
    } else {
      expect(title).toMatch(expectedTitle);
    }
  }

  // Validate body class if specified
  if (expectedBodyClass) {
    const bodyClasses = await page.evaluate(() => document.body.className);
    if (typeof expectedBodyClass === 'string') {
      expect(bodyClasses).toContain(expectedBodyClass);
    } else {
      expect(bodyClasses).toMatch(expectedBodyClass);
    }
  }

  // Check for errors (unless explicitly allowed)
  if (!allowConsoleErrors) {
    expect(consoleErrors).toHaveLength(0);
  }

  if (!allowPageErrors) {
    expect(pageErrors).toHaveLength(0);
  }

  // Check for PHP errors (unless explicitly allowed via options)
  if (!allowPHPErrors && phpErrors.length > 0) {
    console.error('\n[PHP Errors Detected]');
    phpErrors.forEach((err, i) => {
      console.error(`  ${i + 1}. ${err.type.toUpperCase()}: ${err.message}`);
      if (err.file) {
        console.error(`     File: ${err.file}${err.line ? `:${err.line}` : ''}`);
      }
    });
    expect(phpErrors).toHaveLength(0);
  }

  // Return test results for additional assertions if needed
  return {
    response,
    consoleErrors,
    pageErrors,
    phpErrors,
    title: await page.title(),
    bodyClasses: await page.evaluate(() => document.body.className),
  };
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
  console.log(`[DEBUG] Fetching post types from: ${url}`);
  console.log(`[DEBUG] Base URL object - host: ${urlObj.host}, hostname: ${urlObj.hostname}, port: ${urlObj.port}`);

  const fetchOptions = {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'cross-fit-test-tool/1.0',
      'Host': urlObj.host, // Set Host header explicitly
    },
    redirect: 'manual', // Handle redirects manually to debug
  };

  console.log(`[DEBUG] Post types fetch options:`, JSON.stringify(fetchOptions, null, 2));

  let response;
  try {
    response = await fetch(url, fetchOptions);
    console.log(`[DEBUG] Post types response status: ${response.status} ${response.statusText}`);
    console.log(`[DEBUG] Post types response URL: ${response.url}`);
    console.log(`[DEBUG] Post types response headers:`, Object.fromEntries(response.headers.entries()));

    // Handle redirect manually to see what's happening
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      console.log(`[DEBUG] Post types redirect location header: ${location}`);
      console.log(`[DEBUG] Post types all response headers:`, Array.from(response.headers.entries()));

      if (location) {
        // Resolve relative URLs
        const redirectUrl = location.startsWith('http') ? location : new URL(location, baseUrl).toString();
        console.log(`[DEBUG] Post types following redirect to: ${redirectUrl}`);

        // Try with trailing slash if redirect is to same path
        let redirectUrlToTry = redirectUrl;
        if (redirectUrl === url && !url.endsWith('/')) {
          redirectUrlToTry = url + '/';
          console.log(`[DEBUG] Post types trying with trailing slash: ${redirectUrlToTry}`);
        }

        // Only follow one redirect to avoid loops
        const redirectResponse = await fetch(redirectUrlToTry, { ...fetchOptions, redirect: 'manual' });
        console.log(`[DEBUG] Post types after redirect status: ${redirectResponse.status}`);
        console.log(`[DEBUG] Post types after redirect URL: ${redirectResponse.url}`);
        console.log(`[DEBUG] Post types after redirect headers:`, Object.fromEntries(redirectResponse.headers.entries()));

        if (redirectResponse.status >= 300 && redirectResponse.status < 400) {
          const redirectLocation = redirectResponse.headers.get('location');
          console.error(`[DEBUG] Post types redirect loop detected! Redirected to: ${redirectLocation}`);
          throw new Error(`Redirect loop detected: ${url} -> ${redirectUrlToTry} -> ${redirectLocation}`);
        }

        response = redirectResponse;
      }
    }
  } catch (error) {
    console.error(`[DEBUG] Post types fetch error:`, error);
    console.error(`[DEBUG] Error name: ${error.name}, message: ${error.message}`);
    if (error.cause) {
      console.error(`[DEBUG] Error cause:`, error.cause);
    }
    throw error;
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Could not read response body');
    console.error(`[DEBUG] Post types response not OK. Status: ${response.status}, Final URL: ${response.url}, Body: ${errorText.substring(0, 200)}`);
    throw new Error(`Failed to fetch post types: HTTP ${response.status} ${response.statusText}`);
  }

  let data;
  try {
    data = await response.json();
    console.log(`[DEBUG] Post types data keys: ${Object.keys(data).join(', ')}`);
  } catch (error) {
    console.error(`[DEBUG] Post types JSON parse error:`, error);
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

  console.log(`[DEBUG] Discovered ${postTypes.length} post types: ${postTypes.map(pt => pt.slug).join(', ')}`);
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
  console.log('[DEBUG] Discovering post types via /wp-json/big-mistake/v1/discovery');
  try {
    const result = await testWordPressRESTAPI(page, wpInstance, '/wp-json/big-mistake/v1/discovery', {
      expectedStatus: 200,
    });

    console.log('[DEBUG] Discovery endpoint returned successfully');
    // Return post types from discovery endpoint (already filtered)
    return result.data?.postTypes || [];
  } catch (error) {
    console.error('[DEBUG] Error discovering post types:', error.message);
    if (error.message.includes('Response body:')) {
      console.error('[DEBUG] Full error:', error.message);
    }
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

      // Continue fetching while we get full pages
      while (data.length === perPage) {
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
        } else {
          break;
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
    console.log(`[DEBUG] Fetching categories from: ${url}`);
    const fetchOptions = {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'cross-fit-test-tool/1.0',
      },
      redirect: 'follow',
    };
    console.log(`[DEBUG] Categories fetch options:`, JSON.stringify(fetchOptions, null, 2));
    const response = await fetch(url, fetchOptions);
    console.log(`[DEBUG] Categories response status: ${response.status}, final URL: ${response.url}`);
    console.log(`[DEBUG] Categories response headers:`, Object.fromEntries(response.headers.entries()));
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
    console.error(`[DEBUG] Categories fetch error:`, error);
    throw error;
  }

  // Discover tags
  try {
    const url = `${base}/wp-json/wp/v2/tags?per_page=1&hide_empty=false`;
    console.log(`[DEBUG] Fetching tags from: ${url}`);
    const response = await fetch(url, { redirect: 'follow' });
    console.log(`[DEBUG] Tags response status: ${response.status}, final URL: ${response.url}`);
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
    console.error(`[DEBUG] Tags fetch error:`, error);
    throw error;
  }

  // Discover authors
  try {
    const url = `${base}/wp-json/wp/v2/users?per_page=1`;
    console.log(`[DEBUG] Fetching authors from: ${url}`);
    const response = await fetch(url, { redirect: 'follow' });
    console.log(`[DEBUG] Authors response status: ${response.status}, final URL: ${response.url}`);
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
    console.error(`[DEBUG] Authors fetch error:`, error);
    throw error;
  }

  // Discover date archives
  try {
    const url = `${base}/wp-json/wp/v2/posts?per_page=1&status=publish`;
    console.log(`[DEBUG] Fetching posts for date archives from: ${url}`);
    const response = await fetch(url, { redirect: 'follow' });
    console.log(`[DEBUG] Posts response status: ${response.status}, final URL: ${response.url}`);
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
    console.error(`[DEBUG] Date archives fetch error:`, error);
    throw error;
  }

  // Discover custom post type archives
  try {
    const url = `${base}/wp-json/wp/v2/types`;
    console.log(`[DEBUG] Fetching types for CPT archives from: ${url}`);
    const response = await fetch(url, { redirect: 'follow' });
    console.log(`[DEBUG] Types response status: ${response.status}, final URL: ${response.url}`);
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
    console.error(`[DEBUG] CPT archives fetch error:`, error);
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
  console.log('[DEBUG] Discovering list pages via /wp-json/big-mistake/v1/discovery');
  try {
    // Use Big Mistake plugin's discovery endpoint
    const result = await testWordPressRESTAPI(page, wpInstance, '/wp-json/big-mistake/v1/discovery', {
      expectedStatus: 200,
    });

    console.log('[DEBUG] Discovery endpoint returned successfully for list pages');

  // Return list pages from discovery endpoint (already formatted)
  const listPages = result.data?.listPages || {
    categories: [],
    tags: [],
    authors: [],
    dateArchives: [],
    customPostTypeArchives: [],
    search: null,
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
    listPages.search = {
      url: listPages.search.url,
    };
  }

    return listPages;
  } catch (error) {
    console.error('[DEBUG] Error discovering list pages:', error.message);
    if (error.message.includes('Response body:')) {
      console.error('[DEBUG] Full error:', error.message);
    }
    throw error;
  }
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
    throw new Error('Page object is required for admin menu discovery via REST API');
  }

  console.log('[DEBUG] Discovering admin menu items via /wp-json/big-mistake/v1/discovery');
  try {
    const result = await testWordPressRESTAPI(page, wpInstance, '/wp-json/big-mistake/v1/discovery', {
      expectedStatus: 200,
    });

    console.log('[DEBUG] Discovery endpoint returned successfully for admin menu');
    // Return admin menu items from discovery endpoint (already formatted)
    return result.data?.adminMenuItems || [];
  } catch (error) {
    console.error('[DEBUG] Error discovering admin menu items:', error.message);
    if (error.message.includes('Response body:')) {
      console.error('[DEBUG] Full error:', error.message);
    }
    throw error;
  }
}

/**
 * Discover WordPress admin submenu items for a given parent menu
 * Uses PHP execution to access $GLOBALS['submenu']
 *
 * @param {Object} wpInstance - WordPress instance with server property
 * @param {string} parentSlug - Parent menu slug
 * @returns {Promise<Array<Object>>} Array of submenu item objects with slug, title, and URL
 */
export async function discoverAdminSubmenuItems(wpInstance, parentSlug) {
  // Get server from global instance if not available in wpInstance
  const server = wpInstance?.server?.playground || global.wpInstance?.server?.playground;
  if (!server) {
    throw new Error('WordPress instance server not available for PHP execution');
  }

  try {
    // Escape the parentSlug for use in PHP code
    const escapedSlug = parentSlug.replace(/'/g, "\\'");

    const result = await server.run({
      code: `<?php
        require_once '/wordpress/wp-load.php';

        // Get the admin submenu structure
        global $submenu;

        $submenuItems = array();

        if (is_array($submenu) && isset($submenu['${escapedSlug}'])) {
          foreach ($submenu['${escapedSlug}'] as $item) {
            // $submenu structure: [0] => title, [1] => capability, [2] => menu_slug
            if (is_array($item) && count($item) >= 3) {
              $menuSlug = $item[2];
              $menuTitle = $item[0];

              // Extract title text (may contain HTML)
              $titleText = strip_tags($menuTitle);

              // Build admin URL
              $adminUrl = admin_url($menuSlug);

              $submenuItems[] = array(
                'slug' => $menuSlug,
                'title' => $titleText,
                'url' => $adminUrl,
                'parent' => '${escapedSlug}',
              );
            }
          }
        }

        return json_encode($submenuItems);
      `,
    });

    // Parse the JSON result
    const resultText = typeof result === 'string' ? result : (result?.text || result?.body?.text || '[]');
    const submenuItems = JSON.parse(resultText);

    return Array.isArray(submenuItems) ? submenuItems : [];
  } catch (error) {
    console.warn(`Warning: Could not discover admin submenu items for ${parentSlug}:`, error.message);
    return [];
  }
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
 * Test authenticated WordPress admin page
 *
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {Object} wpInstance - WordPress instance with url property
 * @param {string} path - Relative path to admin page (e.g., '/wp-admin/')
 * @param {Object} options - Optional test options
 */
export async function testWordPressAdminPage(page, wpInstance, path, options = {}) {
  const url = normalizePath(wpInstance.url, path);

  // Check if page is already closed
  if (page.isClosed()) {
    throw new Error('Page was closed before navigation');
  }


  // For admin pages, use 'commit' to start navigation quickly, then wait for elements
  // Admin pages have heavy JS that can delay DOMContentLoaded indefinitely
  // We wait for actual UI elements instead of DOMContentLoaded
  let response;
  /**
   * Helper to navigate with retry logic.
   * @param {object} page - Playwright page object
   * @param {string} url - URL to navigate to
   * @param {number} [retryDelayMs=500] - Delay before retrying navigation (default: 500ms, empirically chosen for WP admin JS load)
   * @returns {Promise<Response>} - Playwright Response object
   */
  async function navigateWithRetry(page, url, retryDelayMs = 500, navigationTimeout = 30000) {
    try {
      // Use 'commit' which waits for navigation to start (much faster)
      return await page.goto(url, { waitUntil: 'commit', timeout: navigationTimeout });
    } catch (e) {
      if (page.isClosed()) {
        throw new Error('Page was closed during navigation');
      }
      if (String(e.message || '').includes('ERR_ABORTED') || String(e.message || '').includes('Target page')) {
        // Wait a bit and retry
        await page.waitForTimeout(retryDelayMs);
        if (page.isClosed()) {
          throw new Error('Page was closed after navigation error');
        }
        try {
          return await page.goto(url, { waitUntil: 'commit', timeout: navigationTimeout });
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
  }

  // Use helper with default retry delay (configurable)
  response = await navigateWithRetry(page, url);
  if (response) {
    expect(response.status()).toBe(200);
  }

  // Wait for admin UI elements to confirm page is ready
  // This is more reliable than waiting for DOMContentLoaded since admin JS is heavy
  // External dashboard feed widgets are disabled via plugin to prevent server-side timeouts
  await Promise.race([
    page.waitForSelector('#wpadminbar', { timeout: 5000 }),
    page.waitForSelector('#adminmenumain', { timeout: 5000 }),
    page.waitForSelector('body.wp-admin', { timeout: 5000 }),
    page.waitForSelector('#wpbody-content', { timeout: 5000 }),
  ]).catch(() => {
    // If none found, continue - we'll check below
  });

  // Detect PHP errors in page content (when WP_DEBUG_DISPLAY is enabled)
  let phpErrors = [];
  try {
    if (!page.isClosed()) {
      const pageContent = await page.content();
      phpErrors = detectPHPErrors(pageContent);
    }
  } catch (err) {
    // frame may have been replaced; log error for debugging
    console.warn('Error while getting page content or detecting PHP errors:', err);
  }

  // Check for admin-specific elements
  const adminCheck = await page.evaluate(() => {
    return {
      hasAdminBody: document.body.classList.contains('wp-admin'),
      hasAdminBar: !!document.querySelector('#wpadminbar'),
      hasAdminMenu: !!document.querySelector('#adminmenumain'),
      hasWpBodyContent: !!document.querySelector('#wpbody-content'),
    };
  });

  // Check if redirected to login (would mean authentication failed)
  const currentUrl = page.url();
  const isLoginPage = currentUrl.includes('/wp-login.php');

  expect(isLoginPage).toBe(false);
  expect(
    adminCheck.hasAdminBody ||
    adminCheck.hasAdminBar ||
    adminCheck.hasAdminMenu ||
    adminCheck.hasWpBodyContent
  ).toBe(true);

  // Check for PHP errors (unless explicitly allowed)
  const allowPHPErrors = options.allowPHPErrors || false;
  if (!allowPHPErrors && phpErrors.length > 0) {
    console.error('\n[PHP Errors Detected in Admin Page]');
    phpErrors.forEach((err, i) => {
      console.error(`  ${i + 1}. ${err.type.toUpperCase()}: ${err.message}`);
      if (err.file) {
        console.error(`     File: ${err.file}${err.line ? `:${err.line}` : ''}`);
      }
    });
    expect(phpErrors).toHaveLength(0);
  }

  return {
    response,
    adminCheck,
    isAuthenticated: !isLoginPage,
    phpErrors,
  };
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

  console.log(`[DEBUG] Making REST API request: ${method} ${url}`);

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

