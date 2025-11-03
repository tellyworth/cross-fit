import { runCLI } from '@wp-playground/cli';

/**
 * Normalize URL to always use 127.0.0.1 instead of localhost
 * This prevents CORS issues when WordPress generates URLs with one
 * while the browser navigates to the other
 */
function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);
    // Always use 127.0.0.1 instead of localhost for consistency
    if (urlObj.hostname === 'localhost') {
      urlObj.hostname = '127.0.0.1';
    }
    return urlObj.toString();
  } catch (error) {
    // If URL parsing fails, try simple string replacement
    return url.replace(/localhost/g, '127.0.0.1');
  }
}

/**
 * Launches WordPress Playground using @wp-playground/cli JavaScript API
 * Returns an object with methods to start/stop the instance
 */
export async function launchWordPress() {
  console.log('Starting WordPress Playground...');

  const cliServer = await runCLI({
    command: 'server',
    php: '8.3',
    wp: 'latest',
    login: true,
  });

  // Get the server URL from the CLI server instance
  // Based on available properties: ['playground', 'server', 'serverUrl', 'workerThreadCount']
  // The serverUrl property contains the actual server URL (e.g., http://127.0.0.1:58978)
  let serverUrl = cliServer.serverUrl ||
                  cliServer.url ||
                  cliServer.absoluteUrl ||
                  (cliServer.requestHandler && cliServer.requestHandler.absoluteUrl);

  if (!serverUrl) {
    // If we still don't have a URL, log available properties for debugging
    console.log('Warning: Could not find server URL. Available properties:', Object.keys(cliServer));
    throw new Error('Could not determine server URL from CLI server instance');
  }

  // Normalize URL to always use 127.0.0.1 (prevents CORS issues)
  serverUrl = normalizeUrl(serverUrl);

  console.log(`✓ Server is ready at ${serverUrl}`);

  return {
    url: serverUrl,
    server: cliServer,
    stop: async () => {
      if (cliServer && typeof cliServer.stop === 'function') {
        await cliServer.stop();
      } else if (cliServer && typeof cliServer.close === 'function') {
        await cliServer.close();
      }
    },
  };
}

