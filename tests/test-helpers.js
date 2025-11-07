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
    console.error(`[readDebugLog] Error reading debug log at "${wpInstance?.debugLogPath}":`, e);
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
  async function navigateWithRetry(page, url, retryDelayMs = 500) {
    try {
      // Use 'commit' which waits for navigation to start (much faster)
      return await page.goto(url, { waitUntil: 'commit', timeout: 30000 });
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
          return await page.goto(url, { waitUntil: 'commit', timeout: 30000 });
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

  expect(response.status()).toBe(expectedStatus);

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

