import { test as base } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * WordPress Playground fixture for Playwright Test
 * Provides access to the shared WordPress instance launched in global setup
 */
export const test = base.extend({
  wpInstance: async ({}, use) => {
    // Read the WordPress server info from global setup
    const serverInfoPath = path.join(__dirname, '.wp-server-info.json');

    if (!fs.existsSync(serverInfoPath)) {
      throw new Error('WordPress server info not found. Ensure global setup has run.');
    }

    const serverInfo = JSON.parse(fs.readFileSync(serverInfoPath, 'utf-8'));

    // Create a minimal wpInstance object that provides the URL
    // The actual server is managed by global setup/teardown
    const wpInstance = {
      url: serverInfo.url,
      // Stop is a no-op since global teardown handles cleanup
      stop: async () => {
        // No-op - cleanup is handled in global teardown
      },
    };

    // Provide to test
    await use(wpInstance);
  },
});

export { expect } from '@playwright/test';

