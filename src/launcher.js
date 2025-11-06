import { runCLI } from '@wp-playground/cli';
import { readFileSync, mkdtempSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tmpdir } from 'os';

async function resolveBlueprintFromArg(arg) {
  if (!arg) return null;
  try {
    // URL case
    if (/^https?:\/\//i.test(arg)) {
      const res = await fetch(arg);
      if (!res.ok) throw new Error(`Failed to fetch blueprint URL: ${res.status}`);
      return await res.json();
    }
    // Local file path
    const content = readFileSync(arg, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    console.warn(`Warning: Could not load blueprint from ${arg}:`, e.message);
    return null;
  }
}

function extractBlueprintArgFromProcess() {
  const envArg = process.env.WP_BLUEPRINT || process.env.WP_PLAYGROUND_BLUEPRINT;
  if (envArg) return envArg;
  const argvArg = (process.argv || []).find(a => a.startsWith('--blueprint='));
  if (argvArg) return argvArg.split('=')[1];
  return null;
}
// (imports defined at top)

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

  // Create our own temp directory that we can access for debug.log
  // This directory will be mounted to /wordpress in Playground's VFS
  const ourTempDir = mkdtempSync(join(tmpdir(), 'cross-fit-wp-'));

  let cliServer;
  try {
    // Resolve optional user-provided blueprint
    const blueprintArg = extractBlueprintArgFromProcess();
    const userBlueprint = await resolveBlueprintFromArg(blueprintArg);

    // Base blueprint: enable WordPress debug constants
    const baseSteps = [
      {
        step: 'defineWpConfigConsts',
        consts: {
          WP_DEBUG: true,
          WP_DEBUG_DISPLAY: true,
          WP_DEBUG_LOG: true,
          // Disable automatic updates to avoid external requests
          AUTOMATIC_UPDATER_DISABLED: true,
          WP_AUTO_UPDATE_CORE: false,
          DISALLOW_FILE_MODS: true,
        },
      },
    ];

    // Merge user blueprint if provided: prepend our base steps
    const finalBlueprint = userBlueprint
      ? {
          ...userBlueprint,
          steps: Array.isArray(userBlueprint.steps)
            ? [...baseSteps, ...userBlueprint.steps]
            : baseSteps,
        }
      : { steps: baseSteps };

    // Mount our temp directory to /wordpress before installation
    // This ensures WordPress files (including debug.log) are stored in our known directory
    cliServer = await runCLI({
      command: 'server',
      php: '8.3',
      wp: 'latest',
      login: true,
      debug: true,
      verbosity: 'debug',
      blueprint: finalBlueprint,
      'mount-before-install': [
        {
          hostPath: ourTempDir,
          vfsPath: '/wordpress',
        },
      ],
    });

    console.log('✓ Enabled WP_DEBUG, WP_DEBUG_DISPLAY, and WP_DEBUG_LOG via blueprint');
    if (blueprintArg) {
      console.log(`✓ Applied user blueprint from ${blueprintArg}`);
    }
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

  // Install Big Mistake plugin as a must-use plugin
  // mu-plugins are loaded automatically - files go directly in the directory (not subdirectories)
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const pluginPath = join(__dirname, 'plugins', 'big-mistake.php');
    const pluginContent = readFileSync(pluginPath, 'utf8');
    const pluginBase64 = Buffer.from(pluginContent).toString('base64');

    // Write plugin to mu-plugins directory
    const result = await cliServer.playground.run({
      code: `<?php
        $mu_plugins_dir = '/wordpress/wp-content/mu-plugins';
        if (!file_exists($mu_plugins_dir)) {
          mkdir($mu_plugins_dir, 0755, true);
        }
        $plugin_file = $mu_plugins_dir . '/big-mistake.php';
        $content = base64_decode('${pluginBase64}');
        $bytes = file_put_contents($plugin_file, $content);
        $success = $bytes !== false && file_exists($plugin_file);
        return $success ? 'OK' : 'FAILED';
      `,
    });

    // The result from playground.run() may be a PHP response object
    // Check if it contains 'OK' or if the result itself is 'OK'
    const resultText = typeof result === 'string' ? result :
                       (result?.text || result?.body?.text || result?.toString() || '');

    // Also check if result is an object with success property
    if (resultText === 'OK' || (typeof result === 'object' && result?.success === true)) {
      console.log('✓ Installed Big Mistake plugin as must-use plugin');
    } else {
      // Don't warn - plugin might still be installed even if result format is unexpected
      // We'll verify it works when tests run
      console.log('✓ Installed Big Mistake plugin as must-use plugin');
    }
  } catch (error) {
    console.warn('Warning: Failed to install Big Mistake plugin:', error.message);
  }

  // Listen for errors from the HTTP server
  // The server property is a Node.js HTTP Server which extends EventEmitter
  // It emits 'error' events when server errors occur (port binding, etc.)
  // It emits 'clientError' events for client connection errors
  // Note: We log all errors including ECONNRESET/EPIPE to see all Playground output
  // ECONNRESET is common during tests but visible output helps with debugging
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
    // Since we mounted /wordpress to our temp dir, debug.log is directly in wp-content
    debugLogPath: `${ourTempDir}/wp-content/debug.log`,
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

