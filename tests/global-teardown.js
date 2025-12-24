import { readDebugLog } from './test-helpers.js';

/**
 * Global teardown for Playwright tests
 * Stops WordPress Playground after all workers complete
 * @param {Object} wpInstance - Instance returned from globalSetup (Playwright passes this automatically)
 */
async function globalTeardown(wpInstance) {
  console.log('\n[Global Teardown] Stopping WordPress Playground...');

  // Playwright doesn't reliably pass the return value from globalSetup to globalTeardown
  // Instead, it sometimes passes the config object. We rely on global.wpInstance which
  // we set in globalSetup and persists in the same process.
  // Check if wpInstance parameter is actually our WordPress instance (has stop method)
  const instance = (wpInstance && typeof wpInstance.stop === 'function')
    ? wpInstance
    : global.wpInstance;

  // Try to stop the instance first (if it's still running)
  if (instance && typeof instance.stop === 'function') {
    try {
      await instance.stop();
      console.log('[Global Teardown] WordPress stopped');
    } catch (error) {
      console.log('[Global Teardown] Error stopping WordPress (may already be stopped):', error.message);
    }
  } else {
    console.log('[Global Teardown] WordPress instance not found or already stopped');
  }

  // Always check and report debug log status
  // Check multiple sources for the debug log path (in case instance crashed)
  // Note: process.env persists even if instance crashes, so this should always work
  const debugLogPath = instance?.debugLogPath ||
                        process.env.WP_PLAYGROUND_DEBUG_LOG ||
                        global.wpInstance?.debugLogPath;

  if (debugLogPath) {
    try {
      const { existsSync, readFileSync } = await import('fs');
      if (existsSync(debugLogPath)) {
        const logContent = readFileSync(debugLogPath, 'utf8');
        const lines = logContent.split('\n').filter(line => line.trim());
        if (lines.length > 0) {
          console.log(`[Global Teardown] Debug log contains ${lines.length} line(s) at: ${debugLogPath}`);
        }
      } else {
        // Log when file doesn't exist so we know the path was checked
        console.log(`[Global Teardown] Debug log file does not exist at: ${debugLogPath}`);
      }
    } catch (error) {
      // Log errors so we can diagnose issues (but don't fail teardown)
      console.warn(`[Global Teardown] Could not read debug log at ${debugLogPath}: ${error.message}`);
    }
  } else {
    // Log when debug log path is not available
    console.log(`[Global Teardown] Debug log path not available (instance may have crashed before setup completed)`);
  }

  // Output debug log content if requested via CLI argument (--debug-log=n)
  const debugLogLines = process.env.WP_DEBUG_LOG_LINES;
  if (debugLogLines) {
    const lines = parseInt(debugLogLines, 10);
    if (!isNaN(lines) && lines > 0 && debugLogPath) {
      try {
        const logInstance = { debugLogPath };
        const logContent = await readDebugLog(logInstance, { limit: lines });
        if (logContent) {
          console.log(`\n[Debug Log - Last ${lines} lines]:`);
          console.log('='.repeat(80));
          console.log(logContent);
          console.log('='.repeat(80));
        }
      } catch (error) {
        console.error(`[Global Teardown] Error reading debug log:`, error.message);
      }
    }
  }

  // Clean up environment variables
  delete process.env.WP_PLAYGROUND_URL;
  delete process.env.WP_PLAYGROUND_DEBUG_LOG;
  delete process.env.WP_DEBUG_LOG_LINES;

  // Clean up empty test-snapshots directory (similar to how test-results is handled)
  // Only remove if it's empty to avoid accidental deletion of snapshots
  if (process.env.SKIP_SNAPSHOTS !== '1') {
    try {
      const { existsSync, readdirSync, rmdirSync } = await import('fs');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');

      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const snapshotsDir = join(__dirname, '..', 'test-snapshots');

      if (existsSync(snapshotsDir)) {
        const files = readdirSync(snapshotsDir);
        if (files.length === 0) {
          rmdirSync(snapshotsDir);
        }
      }
    } catch (error) {
      // Silently fail - cleanup is not critical
    }
  }
}

export default globalTeardown;

