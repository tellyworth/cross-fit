import { test, expect } from './wp-fixtures.js';

test.describe('WordPress E2E Tests', () => {

  test('should load public homepage without errors', async ({ page, wpInstance }) => {
    // Track JavaScript console errors
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push({
          text: msg.text(),
          location: msg.location(),
        });
      }
    });

    // Track page errors
    const pageErrors = [];
    page.on('pageerror', (error) => {
      pageErrors.push({
        message: error.message,
        stack: error.stack,
      });
    });

    // Navigate to root URL
    const response = await page.goto(wpInstance.url);

    // Check HTTP response
    expect(response.status()).toBe(200);

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Get page title
    const title = await page.title();
    expect(title).toBeTruthy();
    console.log(`Page title: "${title}"`);

    // Get body classes
    const bodyClasses = await page.evaluate(() => {
      return document.body.className;
    });
    expect(bodyClasses).toBeTruthy();
    console.log(`Body classes: "${bodyClasses}"`);

    // Check for errors
    expect(consoleErrors).toHaveLength(0);
    expect(pageErrors).toHaveLength(0);
  });

  test('should access authenticated admin dashboard', async ({ page, wpInstance }) => {
    // Navigate to /wp-admin/ (should be authenticated via --login flag)
    const baseUrl = wpInstance.url.replace(/\/$/, '');
    const adminResponse = await page.goto(`${baseUrl}/wp-admin/`);

    expect(adminResponse.status()).toBe(200);

    // Wait for admin page to load
    await page.waitForLoadState('networkidle');

    // Check if we can access admin (should see admin dashboard elements)
    const adminTitle = await page.title();
    console.log(`Admin page title: "${adminTitle}"`);

    // Check for admin-specific elements
    const hasAdminBody = await page.evaluate(() => {
      return document.body.classList.contains('wp-admin') ||
             document.body.id === 'wpadminbar' ||
             document.querySelector('#wpadminbar') !== null ||
             document.querySelector('#adminmenumain') !== null;
    });

    // Check if we're redirected to login (would mean authentication failed)
    const currentUrl = page.url();
    const isLoginPage = currentUrl.includes('/wp-login.php');

    expect(isLoginPage).toBe(false);
    expect(hasAdminBody || adminTitle.includes('Dashboard') || adminTitle.includes('WordPress')).toBe(true);
  });

  test('should validate RSS feed structure', async ({ page, wpInstance }) => {
    // Navigate to RSS feed
    const feedBaseUrl = wpInstance.url.replace(/\/$/, '');
    const feedUrl = `${feedBaseUrl}/feed/`;

    const feedResponse = await page.goto(feedUrl, { waitUntil: 'networkidle' });

    expect(feedResponse.status()).toBe(200);

    // Get response content type
    const contentType = feedResponse.headers()['content-type'] || '';
    console.log(`Content-Type: ${contentType}`);

    // Validate RSS feed using browser's DOMParser
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

    if (feedValidation.titleText) {
      console.log(`Channel title: "${feedValidation.titleText}"`);
    }

    // Check content type
    expect(
      contentType.includes('xml') ||
      contentType.includes('rss') ||
      contentType.includes('atom')
    ).toBe(true);
  });

  test('should successfully submit POST request to change site options', async ({ page, wpInstance }) => {
    // Navigate to General Settings page
    const optionsBaseUrl = wpInstance.url.replace(/\/$/, '');
    const optionsUrl = `${optionsBaseUrl}/wp-admin/options-general.php`;

    const optionsResponse = await page.goto(optionsUrl, { waitUntil: 'networkidle' });

    expect(optionsResponse.status()).toBe(200);

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Verify we're on the options page
    await expect(page.locator('#blogname')).toBeVisible({ timeout: 5000 });

    // Get current site title value
    const currentTitle = await page.inputValue('#blogname');
    console.log(`Current site title: "${currentTitle}"`);

    // Generate a new test title
    const newTitle = `Test Site ${Date.now()}`;
    console.log(`Changing site title to: "${newTitle}"`);

    // Fill in the new title
    await page.fill('#blogname', newTitle);

    // Submit the form
    await page.click('#submit');

    // Wait for form submission and page reload
    await page.waitForLoadState('networkidle');

    // Wait a moment for the save to complete
    await page.waitForTimeout(1000);

    // Check if the change was saved by reading the value again
    const savedTitle = await page.inputValue('#blogname');
    console.log(`Saved site title: "${savedTitle}"`);

    expect(savedTitle).toBe(newTitle);
  });
});

