/**
 * Global teardown for Playwright tests
 * Stops WordPress Playground after all workers complete
 * @param {Object} wpInstance - Instance returned from globalSetup (Playwright passes this automatically)
 */
async function globalTeardown(wpInstance) {
  console.log('Global teardown: Stopping WordPress Playground...');

  // Access the WordPress instance from the parameter or global scope
  const instance = wpInstance || global.wpInstance;

  if (instance && typeof instance.stop === 'function') {
    await instance.stop();
    console.log('Global teardown: WordPress stopped');
  } else {
    console.log('Global teardown: WordPress instance not found or already stopped');
  }

  // Clean up environment variable
  delete process.env.WP_PLAYGROUND_URL;
}

export default globalTeardown;

