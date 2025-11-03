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

  let cliServer;
  try {
    // Use a blueprint to enable WordPress debug constants
    // Reference: https://wordpress.github.io/wordpress-playground/blueprints/steps#defineWpConfigConsts
    // Note: verbose: 'debug' will output debug info, but we can't easily capture it from runCLI
    // The runCLI API doesn't expose stderr/stdout streams directly
    cliServer = await runCLI({
      command: 'server',
      php: '8.3',
      wp: 'latest',
      login: true,
      debug: true,
      verbosity: 'debug', // Use verbosity instead of verbose
      blueprint: {
        steps: [
          {
            step: 'defineWpConfigConsts',
            consts: {
              WP_DEBUG: true,
              WP_DEBUG_DISPLAY: true,
              WP_DEBUG_LOG: true,
            },
          },
        ],
      },
    });

    console.log('✓ Enabled WP_DEBUG, WP_DEBUG_DISPLAY, and WP_DEBUG_LOG via blueprint');
  } catch (error) {
    throw error;
  }

  // Get the server URL from the CLI server instance
  // Based on available properties: ['playground', 'server', 'serverUrl', 'workerThreadCount']
  // The serverUrl property contains the actual server URL (e.g., http://127.0.0.1:58978)
  let serverUrl = cliServer.serverUrl ||
                  cliServer.url ||
                  cliServer.absoluteUrl ||
                  (cliServer.requestHandler && cliServer.requestHandler.absoluteUrl);

  if (!serverUrl) {
    // If we still don't have a URL, log available properties for debugging
    const availableProps = Object.keys(cliServer);
    console.log('Warning: Could not find server URL. Available properties:', availableProps);
    throw new Error('Could not determine server URL from CLI server instance');
  }

  // Normalize URL to always use 127.0.0.1 (prevents CORS issues)
  serverUrl = normalizeUrl(serverUrl);

  console.log(`✓ Server is ready at ${serverUrl}`);

  // Listen for errors from the HTTP server
  // The server property is a Node.js HTTP Server which extends EventEmitter
  // It emits 'error' events when server errors occur (port binding, etc.)
  // It emits 'clientError' events for client connection errors
  if (cliServer.server && typeof cliServer.server.on === 'function') {
    cliServer.server.on('error', (error) => {
      console.error('[WordPress Playground Server Error]', error);
    });

    cliServer.server.on('clientError', (error, socket) => {
      console.error('[WordPress Playground Client Error]', error);
    });
  }

  // Note: The playground RemoteAPI doesn't expose the worker thread directly
  // Worker thread errors (PHP execution errors, etc.) are handled internally
  // by Playground and don't surface through the RemoteAPI interface
  // We rely on PHP error detection in rendered page content (WP_DEBUG_DISPLAY)

  return {
    url: serverUrl,
    server: cliServer,
    stop: async () => {
      try {
        // Try to stop the server - it may have a stop method or need cleanup via server property
        if (cliServer && typeof cliServer.stop === 'function') {
          await cliServer.stop();
        } else if (cliServer && typeof cliServer.close === 'function') {
          await cliServer.close();
        } else if (cliServer.server && typeof cliServer.server.close === 'function') {
          await cliServer.server.close();
        } else if (cliServer.server && typeof cliServer.server.stop === 'function') {
          await cliServer.server.stop();
        }
      } catch (error) {
        console.error('Error stopping server:', error);
      }
    },
  };
}

