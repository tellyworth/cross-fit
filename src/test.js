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
    const adminResponse = await page.goto(`${wpInstance.url}/wp-admin/`);

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


