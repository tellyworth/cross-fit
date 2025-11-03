/**
 * Global teardown for Playwright tests
 * Stops WordPress Playground after all workers complete
 * @param {Object} wpInstance - Instance returned from globalSetup (Playwright passes this automatically)
 */
async function globalTeardown(wpInstance) {
  console.log('\n[Global Teardown] Stopping WordPress Playground...');

  // Access the WordPress instance from the parameter or global scope
  const instance = wpInstance || global.wpInstance;

  if (instance && typeof instance.stop === 'function') {
    await instance.stop();
    console.log('[Global Teardown] WordPress stopped');
  } else {
    console.log('[Global Teardown] WordPress instance not found or already stopped');
  }

  // Display captured console errors from WordPress Playground
  if (instance) {
    if (instance.errors && instance.errors.length > 0) {
      console.log('\n[WordPress Playground Console Errors]');
      instance.errors.forEach(error => {
        console.error(`  [${error.timestamp}] ${error.type}: ${error.message}`);
        if (error.stack) {
          console.error(`    ${error.stack.split('\n').join('\n    ')}`);
        }
      });
    }

    if (instance.logs && instance.logs.length > 0) {
      console.log('\n[WordPress Playground Console Warnings]');
      instance.logs.forEach(log => {
        console.warn(`  [${log.timestamp}] ${log.type}: ${log.message}`);
      });
    }

    if ((!instance.logs || instance.logs.length === 0) &&
        (!instance.errors || instance.errors.length === 0)) {
      console.log('\n[WordPress Playground] No console errors or warnings captured');
    }
  }

  // Clean up environment variable
  delete process.env.WP_PLAYGROUND_URL;
}

export default globalTeardown;

