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
      }
    } catch (error) {
      // Log errors so we can diagnose issues (but don't fail teardown)
      console.warn(`[Global Teardown] Could not read debug log at ${debugLogPath}: ${error.message}`);
    }
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
}

export default globalTeardown;

