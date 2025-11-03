import { chromium } from 'playwright';
import { launchWordPress } from './launcher.js';

/**
 * Minimal test script for WordPress E2E testing
 */
async function runTests() {
  console.log('Starting WordPress Playground...');
  const wpInstance = await launchWordPress();

  console.log(`WordPress running at: ${wpInstance.url}`);

  let browser;
  try {
    // Launch browser
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

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

    console.log('Navigating to root URL...');
    const response = await page.goto(wpInstance.url);

    // Check HTTP response
    console.log(`Response status: ${response.status()}`);
    if (response.status() !== 200) {
      console.error(`⚠️  Unexpected status code: ${response.status()}`);
    }

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Get page title
    const title = await page.title();
    console.log(`Page title: "${title}"`);

    // Get body classes
    const bodyClasses = await page.evaluate(() => {
      return document.body.className;
    });
    console.log(`Body classes: "${bodyClasses}"`);

    // Report JavaScript console errors
    if (consoleErrors.length > 0) {
      console.error(`\n⚠️  Found ${consoleErrors.length} JavaScript console error(s):`);
      consoleErrors.forEach((error, index) => {
        console.error(`  ${index + 1}. ${error.text}`);
        if (error.location) {
          console.error(`     at ${error.location.url}:${error.location.lineNumber}`);
        }
      });
    } else {
      console.log('✓ No JavaScript console errors detected');
    }

    // Report page errors
    if (pageErrors.length > 0) {
      console.error(`\n⚠️  Found ${pageErrors.length} page error(s):`);
      pageErrors.forEach((error, index) => {
        console.error(`  ${index + 1}. ${error.message}`);
      });
    } else {
      console.log('✓ No page errors detected');
    }

    // Basic validation
    console.log('\n=== Public Page Test Results ===');
    if (response.status() === 200 && title && !consoleErrors.length && !pageErrors.length) {
      console.log('✓ All basic checks passed');
    } else {
      console.log('✗ Some checks failed');
    }

    // Test authenticated request to /wp-admin/
    // Note: WordPress Playground is started with --login flag, so user should be auto-logged in
    console.log('\n=== Testing Authenticated Request ===');

    // Navigate directly to /wp-admin/ (should be authenticated via --login flag)
    console.log('Navigating to /wp-admin/ (with auto-login from --login flag)...');
    // Remove trailing slash from base URL if present, then add path
    const baseUrl = wpInstance.url.replace(/\/$/, '');
    const adminResponse = await page.goto(`${baseUrl}/wp-admin/`);

    console.log(`Admin page status: ${adminResponse.status()}`);

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

    if (isLoginPage) {
      console.log('⚠️  Redirected to login page - authentication may have failed');
      console.log(`   Current URL: ${currentUrl}`);
    } else if (hasAdminBody || adminTitle.includes('Dashboard') || adminTitle.includes('WordPress')) {
      console.log('✓ Successfully accessed /wp-admin/ (authenticated)');
    } else {
      console.log('⚠️  Admin access unclear - admin elements not definitively detected');
    }

    // Check for errors on admin page (errors are already tracked by listeners set up earlier)
    // Any new errors will have been added to consoleErrors and pageErrors arrays
    const adminPageErrorCount = consoleErrors.length + pageErrors.length;
    console.log(`✓ Admin page check complete (${adminPageErrorCount} total errors tracked so far)`);

    // Test POST request - change site option
    console.log('\n=== Testing POST Request ===');

    // Navigate to General Settings page
    console.log('Navigating to General Settings (options-general.php)...');
    // Remove trailing slash from base URL if present, then add path (reuse baseUrl from above)
    const optionsBaseUrl = wpInstance.url.replace(/\/$/, '');
    const optionsUrl = `${optionsBaseUrl}/wp-admin/options-general.php`;
    console.log(`Full options URL: ${optionsUrl}`);

    const optionsResponse = await page.goto(optionsUrl, { waitUntil: 'networkidle' });

    const optionsPageUrl = page.url();
    console.log(`Response status: ${optionsResponse.status()}`);
    console.log(`Final URL after navigation: ${optionsPageUrl}`);

    if (optionsResponse.status() === 404) {
      throw new Error(`Options page returned 404. Tried: ${optionsUrl}, ended up at: ${optionsPageUrl}`);
    }

    // Verify we're on the options page by checking for the form
    try {
      await page.waitForSelector('#blogname', { timeout: 5000 });
      console.log('✓ Found options form - on the correct page');
    } catch (error) {
      throw new Error(`Could not find options form on page. Current URL: ${optionsPageUrl}`);
    }

    // Get current site title value
    const currentTitle = await page.inputValue('#blogname');
    console.log(`Current site title: "${currentTitle}"`);

    // Generate a new test title
    const newTitle = `Test Site ${Date.now()}`;
    console.log(`Changing site title to: "${newTitle}"`);

    // Fill in the new title
    await page.fill('#blogname', newTitle);

    // Submit the form
    console.log('Submitting form...');
    await page.click('#submit');

    // Wait for form submission and page reload
    await page.waitForLoadState('networkidle');

    // Wait a moment for the save to complete
    await page.waitForTimeout(1000);

    // Check if the change was saved by reading the value again
    const savedTitle = await page.inputValue('#blogname');
    console.log(`Saved site title: "${savedTitle}"`);

    if (savedTitle === newTitle) {
      console.log('✓ POST request successful - site option changed in database');
    } else {
      console.log(`⚠️  POST request may have failed - expected "${newTitle}" but got "${savedTitle}"`);
    }

    // Check for any errors after POST
    const postErrorCount = consoleErrors.length + pageErrors.length;
    console.log(`✓ POST request test complete (${postErrorCount} total errors tracked so far)`);

  } catch (error) {
    console.error('Error during testing:', error);
    throw error;
  } finally {
    // Cleanup
    if (browser) {
      await browser.close();
    }
    console.log('\nStopping WordPress Playground...');
    await wpInstance.stop();
    console.log('Done!');
  }
}

// Run the tests
runTests().catch((error) => {
  console.error('Test execution failed:', error);
  process.exit(1);
});


