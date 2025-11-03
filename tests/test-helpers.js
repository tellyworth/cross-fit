import { expect } from '@playwright/test';

/**
 * Reusable test helpers for WordPress E2E testing
 * Following Playwright's recommended patterns
 */

/**
 * Test a WordPress page URL with standard checks:
 * - HTTP response status
 * - JavaScript console errors
 * - Page errors
 * - Optional title/body class validation
 *
 * @param {Object} params
 * @param {import('@playwright/test').Page} params.page - Playwright page object
 * @param {string} params.url - Full URL to test
 * @param {Object} params.options - Optional test options
 * @param {number} params.options.expectedStatus - Expected HTTP status (default: 200)
 * @param {string|RegExp} params.options.expectedTitle - Expected page title (optional)
 * @param {string|RegExp} params.options.expectedBodyClass - Expected body class (optional)
 * @param {boolean} params.options.allowConsoleErrors - Allow console errors (default: false)
 * @param {boolean} params.options.allowPageErrors - Allow page errors (default: false)
 * @param {string} params.options.description - Description for test.step (optional)
 */
export async function testWordPressPage(page, url, options = {}) {
  const {
    expectedStatus = 200,
    expectedTitle = null,
    expectedBodyClass = null,
    allowConsoleErrors = false,
    allowPageErrors = false,
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

  // Return test results for additional assertions if needed
  return {
    response,
    consoleErrors,
    pageErrors,
    title: await page.title(),
    bodyClasses: await page.evaluate(() => document.body.className),
  };
}

/**
 * Test multiple WordPress pages with a single call
 * Useful for testing a list of URLs with standard checks
 *
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {string} baseUrl - Base URL of WordPress instance
 * @param {Array<string|Object>} pages - Array of page paths or objects with path and options
 * @param {Object} defaultOptions - Default options applied to all pages
 */
export async function testWordPressPages(page, baseUrl, pages, defaultOptions = {}) {
  const base = baseUrl.replace(/\/$/, '');
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

    const url = `${base}${path.startsWith('/') ? '' : '/'}${path}`;
    const mergedOptions = { ...defaultOptions, ...options };

    const result = await testWordPressPage(page, url, {
      ...mergedOptions,
      description: `Testing: ${path}`,
    });

    results.push({
      path,
      url,
      ...result,
    });
  }

  return results;
}

/**
 * Test WordPress RSS feed with XML validation
 *
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {string} feedUrl - Full URL to RSS feed
 * @param {Object} options - Optional test options
 */
export async function testWordPressRSSFeed(page, feedUrl, options = {}) {
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
 * @param {string} url - Full URL to admin page
 * @param {Object} options - Optional test options
 */
export async function testWordPressAdminPage(page, url, options = {}) {
  // Admin pages have continuous network activity (heartbeat, auto-save, etc.)
  // Use 'domcontentloaded' instead of 'networkidle' to avoid timeouts
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });

  expect(response.status()).toBe(200);

  // Wait for a specific admin element to ensure page is loaded
  // Try multiple selectors as different admin pages have different elements
  try {
    // Wait for any admin element to be visible
    await Promise.race([
      page.waitForSelector('#wpadminbar', { timeout: 5000 }).catch(() => null),
      page.waitForSelector('#adminmenumain', { timeout: 5000 }).catch(() => null),
      page.waitForSelector('body.wp-admin', { timeout: 5000 }).catch(() => null),
      page.waitForSelector('#wpbody-content', { timeout: 5000 }).catch(() => null),
    ]);
  } catch (error) {
    // If no admin element found, continue and check below
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

  return {
    response,
    adminCheck,
    isAuthenticated: !isLoginPage,
  };
}

/**
 * Test WordPress REST API endpoint
 *
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {string} url - Full URL to REST API endpoint
 * @param {Object} options - Optional test options
 * @param {string} options.method - HTTP method (default: 'GET')
 * @param {Object} options.headers - Additional headers
 * @param {Object} options.body - Request body (for POST/PUT)
 * @param {number} options.expectedStatus - Expected HTTP status (default: 200)
 * @param {Function} options.validateResponse - Custom validation function
 */
export async function testWordPressRESTAPI(page, url, options = {}) {
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
 * @param {string} baseUrl - Base URL of WordPress instance
 * @param {Array<string|Object>} endpoints - Array of endpoint paths or objects with path and options
 */
export async function testWordPressRESTEndpoints(page, baseUrl, endpoints) {
  const base = baseUrl.replace(/\/$/, '');
  const apiBase = `${base}/wp-json/wp/v2`;
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

    // Ensure path starts with /
    const fullPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${apiBase}${fullPath}`;

    const result = await testWordPressRESTAPI(page, url, options);

    results.push({
      path: fullPath,
      url,
      ...result,
    });
  }

  return results;
}

