import { expect } from '@playwright/test';

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
  const phpErrorPatterns = [
    // PHP Fatal errors
    /Fatal\s+error:\s*([^\n]+)/gi,
    // PHP Parse errors
    /Parse\s+error:\s*([^\n]+)/gi,
    // PHP Warnings
    /Warning:\s*([^\n]+)/gi,
    // PHP Notices
    /Notice:\s*([^\n]+)/gi,
    // PHP Deprecated warnings
    /Deprecated:\s*([^\n]+)/gi,
    // PHP Strict errors
    /Strict\s+(?:Standards\s+)?(?:Warning|Error|Notice):\s*([^\n]+)/gi,
    // PHP Errors with file locations
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
 * Determine PHP error type from error text
 * @param {string} errorText - Raw error text
 * @returns {string} Error type (fatal, parse, warning, notice, etc.)
 */
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
  const response = await page.goto(url, { waitUntil: 'networkidle' });

  expect(response.status()).toBe(expectedStatus);

  // Wait for page to fully load
  await page.waitForLoadState('networkidle');

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
  const response = await page.goto(feedUrl, { waitUntil: 'networkidle' });

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

  // Navigate to the page - use 'commit' to wait for navigation to start
  // This is faster and more reliable than waiting for DOMContentLoaded
  const response = await page.goto(url, { waitUntil: 'commit' });

  expect(response.status()).toBe(200);

  // Wait for specific admin elements - this is more reliable than waiting for load events
  // Admin pages load JavaScript after DOMContentLoaded, so we wait for actual UI elements
  // Use a longer timeout to account for slower pages
  await Promise.race([
    page.waitForSelector('#wpadminbar', { timeout: 15000 }),
    page.waitForSelector('#adminmenumain', { timeout: 15000 }),
    page.waitForSelector('body.wp-admin', { timeout: 15000 }),
    page.waitForSelector('#wpbody-content', { timeout: 15000 }),
  ]).catch(() => {
    // If none found, continue - we'll check below
  });

  // Detect PHP errors in page content (when WP_DEBUG_DISPLAY is enabled)
  const pageContent = await page.content();
  const phpErrors = detectPHPErrors(pageContent);

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

