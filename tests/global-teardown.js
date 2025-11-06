import { readDebugLog } from './test-helpers.js';

/**
 * Global teardown for Playwright tests
 * Stops WordPress Playground after all workers complete
 * @param {Object} wpInstance - Instance returned from globalSetup (Playwright passes this automatically)
 */
async function globalTeardown(wpInstance) {
  console.log('\n[Global Teardown] Stopping WordPress Playground...');

  // Access the WordPress instance from the parameter (Playwright passes return value from globalSetup)
  const instance = wpInstance || global.wpInstance;

  // Output debug log if requested via CLI argument (--debug-log=n)
  const debugLogLines = process.env.WP_DEBUG_LOG_LINES;
  if (debugLogLines) {
    const lines = parseInt(debugLogLines, 10);
    if (!isNaN(lines) && lines > 0) {
      const debugLogPath = instance?.debugLogPath || process.env.WP_PLAYGROUND_DEBUG_LOG;
      const logInstance = debugLogPath ? { debugLogPath } : null;

      if (logInstance) {
        const logContent = await readDebugLog(logInstance, { limit: lines });
        if (logContent) {
          console.log(`\n[Debug Log - Last ${lines} lines]:`);
          console.log(logContent);
        }
      }
    }
  }

  if (instance && typeof instance.stop === 'function') {
    await instance.stop();
    console.log('[Global Teardown] WordPress stopped');
  } else {
    console.log('[Global Teardown] WordPress instance not found or already stopped');
  }

  // Clean up environment variables
  delete process.env.WP_PLAYGROUND_URL;
  delete process.env.WP_PLAYGROUND_DEBUG_LOG;
  delete process.env.WP_DEBUG_LOG_LINES;
}

export default globalTeardown;

