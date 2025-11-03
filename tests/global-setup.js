import { launchWordPress } from '../src/launcher.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Global setup for Playwright tests
 * Launches WordPress Playground once to be shared across all workers
 */
async function globalSetup() {
  console.log('Global setup: Launching WordPress Playground...');

  const wpInstance = await launchWordPress();

  // Store the WordPress instance info in a file that all workers can access
  // Note: We can't serialize the server object itself, but we can store the URL
  // The server process will stay alive because the global setup process stays alive
  // until teardown, which will call stop()
  const serverInfo = {
    url: wpInstance.url,
    // Store process info if available
    server: wpInstance.server ? {
      // Try to get any serializable info from the server object
    } : null,
  };

  const serverInfoPath = path.join(__dirname, '.wp-server-info.json');
  fs.writeFileSync(serverInfoPath, JSON.stringify(serverInfo, null, 2));

  // Store the instance on the global object so teardown can access it
  // The global object persists in this process between setup and teardown
  global.wpInstance = wpInstance;

  console.log(`Global setup: WordPress ready at ${wpInstance.url}`);

  // Return a config object that teardown can use
  // Playwright passes this return value to global teardown
  return {
    wpInstance: wpInstance,
    serverInfoPath: serverInfoPath,
  };
}

export default globalSetup;

