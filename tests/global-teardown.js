/**
 * Global teardown for Playwright tests
 * Stops WordPress Playground after all workers complete
 * @param {Object} config - Config returned from globalSetup
 */
async function globalTeardown(config) {
  console.log('Global teardown: Stopping WordPress Playground...');

  // Access the WordPress instance from global scope (same process as setup)
  // Or use the config passed from setup
  const wpInstance = global.wpInstance || config?.wpInstance;

  if (wpInstance && typeof wpInstance.stop === 'function') {
    await wpInstance.stop();
    console.log('Global teardown: WordPress stopped');
  } else {
    console.log('Global teardown: WordPress instance not found or already stopped');
  }

  // Clean up the server info file
  const fs = await import('fs');
  const path = await import('path');
  const { fileURLToPath } = await import('url');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const serverInfoPath = config?.serverInfoPath || path.join(__dirname, '.wp-server-info.json');

  if (fs.existsSync(serverInfoPath)) {
    fs.unlinkSync(serverInfoPath);
  }
}

export default globalTeardown;

