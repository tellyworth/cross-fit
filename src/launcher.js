import { runCLI } from '@wp-playground/cli';
import { readFileSync, mkdtempSync, existsSync, copyFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve, basename } from 'path';
import { tmpdir } from 'os';

/**
 * Parse WordPress Site Health data from a text file
 * @param {string} filePath - Path to the site health text file
 * @returns {Object|null} Parsed site health data or null if file cannot be read
 */
function parseSiteHealthFile(filePath) {
  try {
    // Resolve file path (handle relative paths)
    const resolvedPath = resolve(filePath);
    if (!existsSync(resolvedPath)) {
      console.warn(`Warning: Site health file not found: ${resolvedPath}`);
      return null;
    }

    const content = readFileSync(resolvedPath, 'utf8');
    const data = {
      wpVersion: null,
      phpVersion: null,
      theme: null,
      plugins: [],
      options: {},
    };

    // Parse sections
    // Handle leading backtick if present (strip it)
    const cleanContent = content.trim().startsWith('`') ? content.trim().slice(1).trim() : content;
    const sections = cleanContent.split(/^###\s+/m);

    for (const section of sections) {
      if (!section.trim()) continue;

      const lines = section.split('\n');
      const sectionNameRaw = lines[0].trim().replace(/\s*###\s*$/, '');
      // Extract base section name (remove count in parentheses like "(11)")
      const sectionName = sectionNameRaw.split(' ')[0];

      // Parse wp-core section
      if (sectionName === 'wp-core') {
        for (const line of lines.slice(1)) {
          const match = line.match(/^(\w+):\s*(.+)$/);
          if (match) {
            const key = match[1];
            const value = match[2].trim();

            if (key === 'version') {
              data.wpVersion = value;
            } else if (key === 'permalink') {
              data.options.permalink_structure = value;
            } else if (key === 'blog_public') {
              data.options.blog_public = value === '1' ? '1' : '0';
            } else if (key === 'default_comment_status') {
              data.options.default_comment_status = value;
            }
          }
        }
      }

      // Parse wp-server section
      if (sectionName === 'wp-server') {
        for (const line of lines.slice(1)) {
          const match = line.match(/^php_version:\s*(.+)$/);
          if (match) {
            // Extract major.minor version (e.g., "8.3.29 64bit" -> "8.3")
            const versionStr = match[1].trim();
            const versionMatch = versionStr.match(/^(\d+\.\d+)/);
            if (versionMatch) {
              data.phpVersion = versionMatch[1];
            }
          }
        }
      }

      // Parse wp-active-theme section
      if (sectionName === 'wp-active-theme') {
        let themeName = null;
        let themeVersion = null;

        for (const line of lines.slice(1)) {
          const match = line.match(/^(\w+):\s*(.+)$/);
          if (match) {
            const key = match[1];
            const value = match[2].trim();

            if (key === 'name') {
              // Extract slug from name like "Twenty Twenty-One (twentytwentyone)"
              const slugMatch = value.match(/\(([^)]+)\)$/);
              if (slugMatch) {
                themeName = slugMatch[1];
              } else {
                // Fallback: use name as-is, lowercased and spaces replaced
                themeName = value.toLowerCase().replace(/\s+/g, '-');
              }
            } else if (key === 'version') {
              themeVersion = value;
            }
          }
        }

        if (themeName) {
          data.theme = themeVersion ? `${themeName}@${themeVersion}` : themeName;
        }
      }

      // Parse wp-plugins-active section
      if (sectionName === 'wp-plugins-active') {
        for (const line of lines.slice(1)) {
          if (!line.trim()) continue;

          // Format: "Plugin Name: version: X.Y.Z, author: ..." or "Plugin Name: Subtitle: version: X.Y.Z, ..."
          // Find "version:" and extract everything before it as plugin name, and after it as version
          const versionIndex = line.indexOf('version:');
          if (versionIndex === -1) continue;

          const pluginNamePart = line.substring(0, versionIndex).trim();
          // Remove trailing colon if present
          const pluginName = pluginNamePart.replace(/\s*:\s*$/, '');

          // Extract version (everything after "version:" until comma or end)
          const versionPart = line.substring(versionIndex + 'version:'.length).trim();
          const versionMatch = versionPart.match(/^([^,]+)/);
          if (!versionMatch) continue;

          const pluginVersion = versionMatch[1].trim();

          // Extract slug from plugin name
          // For wordpress.org plugins, we need the slug, not the display name
          // Try to extract from format like "ActivityPub" or "Akismet Anti-spam: Spam Protection"
          // Use the first part before any colon as the base name
          let pluginSlug = pluginName.split(':')[0].trim().toLowerCase().replace(/\s+/g, '-');

          // Common plugin slug mappings (MVP: handle a few common ones)
          const slugMap = {
            'akismet-anti-spam': 'akismet',
            'crowdsignal-forms': 'crowdsignal-forms',
            'crowdsignal-polls-&-ratings': 'polldaddy',
            'gravatar-enhanced': 'gravatar-enhanced',
            'page-optimize': 'page-optimize',
            'layout-grid': 'layout-grid',
            'activitypub': 'activitypub',
            'coblocks': 'coblocks',
            'gutenberg': 'gutenberg',
            'jetpack': 'jetpack',
            'underminer': 'underminer',
          };

          if (slugMap[pluginSlug]) {
            pluginSlug = slugMap[pluginSlug];
          }

          const pluginSpec = pluginVersion ? `${pluginSlug}@${pluginVersion}` : pluginSlug;
          data.plugins.push(pluginSpec);
        }
      }
    }

    return data;
  } catch (error) {
    console.warn(`Warning: Could not parse site health file ${filePath}:`, error.message);
    return null;
  }
}

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

/**
 * Build blueprint steps from CLI arguments
 * Returns an array of blueprint steps
 * @param {string} tempDir - Path to the temp directory mounted to /wordpress in VFS
 */
function buildCliBlueprintSteps(tempDir) {
  const steps = [];

  // Handle WXR import
  const importArg = process.env.WP_IMPORT;
  if (importArg) {
    // Determine if it's a URL or local file path
    const isUrl = /^https?:\/\//i.test(importArg);
    if (isUrl) {
      steps.push({
        step: 'importWxr',
        file: {
          resource: 'url',
          url: importArg,
        },
      });
    } else {
      // Local file path - read the file and provide as literal resource
      try {
        const filePath = resolve(importArg);
        if (!existsSync(filePath)) {
          console.warn(`Warning: WXR file not found: ${filePath}`);
        } else {
          const fileContent = readFileSync(filePath, 'utf8');
          const fileName = basename(filePath) || 'import.wxr';
          steps.push({
            step: 'importWxr',
            file: {
              resource: 'literal',
              name: fileName,
              contents: fileContent,
            },
          });
        }
      } catch (error) {
        console.warn(`Warning: Could not read WXR file ${importArg}:`, error.message);
      }
    }
  }

  // Handle theme installation and activation
  const themeArg = process.env.WP_THEME;
  if (themeArg) {
    const themeResource = resolveThemeOrPluginResource(themeArg, 'theme', tempDir);
    if (themeResource) {
      steps.push({
        step: 'installTheme',
        themeData: themeResource,
        options: {
          activate: true,
        },
      });
    } else {
      console.warn(`Warning: Could not resolve theme resource: ${themeArg}`);
    }
  }

  // Handle plugin installation and activation (comma-separated)
  const pluginsArg = process.env.WP_PLUGINS;
  if (pluginsArg) {
    const pluginSlugs = pluginsArg.split(',').map(s => s.trim()).filter(s => s);
    for (const pluginSlug of pluginSlugs) {
      const pluginResource = resolveThemeOrPluginResource(pluginSlug, 'plugin', tempDir);
      if (pluginResource) {
        steps.push({
          step: 'installPlugin',
          pluginData: pluginResource,
          options: {
            activate: true,
          },
        });
      } else {
        console.warn(`Warning: Could not resolve plugin resource: ${pluginSlug}`);
      }
    }
  }

  return steps;
}

/**
 * Resolve a theme or plugin resource from a slug, URL, or local file path
 * For local files, copies them to the temp directory which is mounted to /wordpress in VFS
 * @param {string} arg - The slug, URL, or file path (may include @version for wordpress.org resources)
 * @param {string} type - Either 'theme' or 'plugin' to determine wordpress.org resource type
 * @param {string} tempDir - Path to the temp directory mounted to /wordpress in VFS
 * @returns {Object|null} Resource object for use in installTheme/installPlugin steps, or null if invalid
 */
function resolveThemeOrPluginResource(arg, type, tempDir) {
  // Check if it's a URL
  if (/^https?:\/\//i.test(arg)) {
    return {
      resource: 'url',
      url: arg,
    };
  }

  // Check if it's a local file path
  try {
    const filePath = resolve(arg);
    if (existsSync(filePath)) {
      // Validate tempDir exists
      if (!tempDir || !existsSync(tempDir)) {
        throw new Error(`Temp directory does not exist: ${tempDir}`);
      }

      // Ensure tmp directory exists in the temp dir
      const tmpDir = join(tempDir, 'tmp');
      if (!existsSync(tmpDir)) {
        mkdirSync(tmpDir, { recursive: true });
      }

      // Copy file to temp directory with unique name
      // Use timestamp + random to avoid collisions
      const fileName = basename(filePath) || `${type}.zip`;
      const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const destPath = join(tmpDir, `${uniqueId}-${fileName}`);
      copyFileSync(filePath, destPath);

      // Reference via VFS (tempDir is mounted to /wordpress)
      // VFS paths always use forward slashes
      const vfsPath = `/wordpress/tmp/${basename(destPath)}`;
      return {
        resource: 'vfs',
        path: vfsPath,
      };
    }
  } catch (error) {
    // If it's a file not found error, treat as wordpress.org slug (expected behavior)
    if (error.code === 'ENOENT') {
      // File doesn't exist, treat as wordpress.org slug - fall through
    } else {
      // For other errors (permission, disk full, etc.), log and return null
      console.warn(`Warning: Could not copy ${type} file ${arg} to temp directory:`, error.message);
      return null;
    }
  }

  // Treat as wordpress.org slug - parse version if present
  // Only parse version for wordpress.org resources (not URLs or local paths)
  // Workaround: When version is specified, use URLReference with direct download URL
  // instead of CorePluginReference/CoreThemeReference (version field not working)
  const versionMatch = arg.match(/^(.+?)@(.+)$/);

  if (versionMatch) {
    // Version specified: construct direct download URL
    const slug = versionMatch[1];
    const version = versionMatch[2];
    const downloadPath = type === 'theme' ? 'theme' : 'plugin';
    const downloadUrl = `https://downloads.wordpress.org/${downloadPath}/${slug}.${version}.zip`;
    return {
      resource: 'url',
      url: downloadUrl,
    };
  } else {
    // No version specified: use wordpress.org resource (CorePluginReference/CoreThemeReference)
    const resourceType = type === 'theme' ? 'wordpress.org/themes' : 'wordpress.org/plugins';
    return {
      resource: resourceType,
      slug: arg,
    };
  }
}

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
    // Parse site health file if provided
    const siteHealthPath = process.env.WP_SITE_HEALTH;
    let siteHealthData = null;
    if (siteHealthPath) {
      siteHealthData = parseSiteHealthFile(siteHealthPath);
      if (siteHealthData) {
        console.log(`✓ Parsed site health data from ${siteHealthPath}`);
        console.log(`  - Plugins found: ${siteHealthData.plugins.length}`);

        // Override environment variables with site health data
        if (siteHealthData.wpVersion && !process.env.WP_WP_VERSION) {
          process.env.WP_WP_VERSION = siteHealthData.wpVersion;
        }
        if (siteHealthData.theme && !process.env.WP_THEME) {
          process.env.WP_THEME = siteHealthData.theme;
        }
        if (siteHealthData.plugins.length > 0 && !process.env.WP_PLUGINS) {
          process.env.WP_PLUGINS = siteHealthData.plugins.join(',');
          console.log(`  - Set WP_PLUGINS: ${process.env.WP_PLUGINS}`);
        }
      }
    }

    // Resolve optional user-provided blueprint
    const blueprintArg = extractBlueprintArgFromProcess();
    const userBlueprint = await resolveBlueprintFromArg(blueprintArg);

    // Base blueprint: enable WordPress debug constants
    // WP_DEBUG_LOG can be:
    //   - true: uses default path wp-content/debug.log (relative to ABSPATH)
    //   - string: absolute file path to log file
    // Since we mount /wordpress to our temp dir, we use an explicit absolute path
    // to ensure WordPress writes to our mounted location
    const debugLogVfsPath = '/wordpress/wp-content/debug.log';
    const baseSteps = [
      {
        step: 'defineWpConfigConsts',
        consts: {
          WP_DEBUG: true,
          WP_DEBUG_DISPLAY: true,
          WP_DEBUG_LOG: debugLogVfsPath, // Explicit absolute path in VFS that maps to our temp dir
          // Disable automatic updates to avoid external requests
          AUTOMATIC_UPDATER_DISABLED: true,
          WP_AUTO_UPDATE_CORE: false,
        },
      },
      {
        step: 'setSiteOptions',
        options: {
          // Disable compression test to prevent non-critical AJAX requests during tests
          // This prevents wp-compression-test requests that often get aborted
          can_compress_scripts: false,
        },
      },
      {
        step: 'runPHP',
        code: `<?php
// Write startup header to debug.log
$log_path = '/wordpress/wp-content/debug.log';
$log_dir = dirname($log_path);

// Ensure directory exists
if (!file_exists($log_dir)) {
  mkdir($log_dir, 0755, true);
}

// Write startup header to debug log
$timestamp = date('Y-m-d H:i:s');
$header = "WordPress Playground started at {$timestamp}" . PHP_EOL;
file_put_contents($log_path, $header, FILE_APPEND | LOCK_EX);
`,
      },
    ];


    // Build steps from CLI arguments (import, theme, plugins)
    const cliSteps = buildCliBlueprintSteps(ourTempDir);

    // Add site health options as blueprint steps
    const siteHealthSteps = [];
    if (siteHealthData && siteHealthData.options) {
      const optionsToSet = {};
      if (siteHealthData.options.permalink_structure) {
        optionsToSet.permalink_structure = siteHealthData.options.permalink_structure;
      }
      if (siteHealthData.options.blog_public !== undefined) {
        optionsToSet.blog_public = siteHealthData.options.blog_public;
      }
      if (siteHealthData.options.default_comment_status) {
        optionsToSet.default_comment_status = siteHealthData.options.default_comment_status;
      }

      if (Object.keys(optionsToSet).length > 0) {
        siteHealthSteps.push({
          step: 'setSiteOptions',
          options: optionsToSet,
        });
      }
    }

    // Combine all steps: base steps first, then CLI steps, then site health steps, then user blueprint steps
    const allSteps = [...baseSteps, ...cliSteps, ...siteHealthSteps];
    if (userBlueprint && Array.isArray(userBlueprint.steps)) {
      allSteps.push(...userBlueprint.steps);
    }

    const finalBlueprint = { steps: allSteps };

    // Get WordPress version from environment variable, default to 'latest'
    const wpVersion = process.env.WP_WP_VERSION || 'latest';

    // Get PHP version from site health data or default to '8.3'
    const phpVersion = (siteHealthData && siteHealthData.phpVersion) || '8.3';

    // Mount our temp directory to /wordpress before installation
    // This ensures WordPress files (including debug.log) are stored in our known directory
    cliServer = await runCLI({
      command: 'server',
      php: phpVersion,
      wp: wpVersion,
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

    // Log WordPress version
    if (process.env.WP_WP_VERSION) {
      console.log(`✓ Will use WordPress version: ${process.env.WP_WP_VERSION}`);
    }

    // Log PHP version
    if (siteHealthData && siteHealthData.phpVersion) {
      console.log(`✓ Will use PHP version: ${siteHealthData.phpVersion}`);
    }

    // Log site health configuration
    if (siteHealthData) {
      if (siteHealthData.theme) {
        console.log(`✓ Will install and activate theme from site health: ${siteHealthData.theme}`);
      }
      if (siteHealthData.plugins.length > 0) {
        console.log(`✓ Will install and activate plugins from site health: ${siteHealthData.plugins.join(', ')}`);
      }
      if (Object.keys(siteHealthData.options).length > 0) {
        console.log(`✓ Will set options from site health: ${Object.keys(siteHealthData.options).join(', ')}`);
      }
    }

    // Log CLI argument actions
    if (process.env.WP_IMPORT) {
      console.log(`✓ Will import WXR file: ${process.env.WP_IMPORT}`);
    }
    if (process.env.WP_THEME) {
      console.log(`✓ Will install and activate theme: ${process.env.WP_THEME}`);
    }
    if (process.env.WP_PLUGINS) {
      const plugins = process.env.WP_PLUGINS.split(',').map(s => s.trim()).filter(s => s);
      console.log(`✓ Will install and activate plugins: ${plugins.join(', ')}`);
    }

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

  // Install Big Mistake plugin as a must-use plugin by copying it into wp-content/mu-plugins
  // mu-plugins are loaded automatically on every request
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const pluginSourcePath = join(__dirname, 'plugins', 'big-mistake.php');

    const muPluginsDir = join(ourTempDir, 'wp-content', 'mu-plugins');
    if (!existsSync(muPluginsDir)) {
      mkdirSync(muPluginsDir, { recursive: true });
    }

    const pluginDestPath = join(muPluginsDir, 'big-mistake.php');
    copyFileSync(pluginSourcePath, pluginDestPath);
    console.log('✓ Installed Big Mistake plugin as must-use plugin');
  } catch (error) {
    console.warn('Warning: Failed to install Big Mistake plugin:', error.message);
  }

  // Set up console.debug override: only output in debug mode
  const isDebugMode = process.env.DEBUG === '1';
  const originalDebug = console.debug;
  console.debug = (...args) => {
    if (isDebugMode) {
      originalDebug(...args);
    }
    // In non-debug mode, console.debug is a no-op (silent)
  };

  // Listen for errors from the HTTP server
  // The server property is a Node.js HTTP Server which extends EventEmitter
  // It emits 'error' events when server errors occur (port binding, etc.)
  // It emits 'clientError' events for client connection errors
  // ECONNRESET/EPIPE are expected when tests navigate away before assets finish loading
  if (cliServer.server && typeof cliServer.server.on === 'function') {
    cliServer.server.on('error', (error) => {
      console.error('[WordPress Playground Server Error]', error);
    });

    cliServer.server.on('clientError', (error, socket) => {
      // ECONNRESET and EPIPE are common during tests when pages navigate away
      // before assets finish loading - these are expected and not real errors
      // Use debug() for these, error() for all other client errors
      const isExpectedError = error.code === 'ECONNRESET' || error.code === 'EPIPE';

      if (isExpectedError) {
        console.debug('[WordPress Playground Client Error]', error);
      } else {
        console.error('[WordPress Playground Client Error]', error);
      }
    });
  }

  // Note: The playground RemoteAPI doesn't expose the worker thread directly
  // Worker thread errors (PHP execution errors, etc.) are handled internally
  // by Playground and don't surface through the RemoteAPI interface
  // We rely on PHP error detection in rendered page content (WP_DEBUG_DISPLAY)

  // Store the debug log path for teardown
  const debugLogPath = `${ourTempDir}/wp-content/debug.log`;

  return {
    url: serverUrl,
    server: cliServer,
    // Since we mounted /wordpress to our temp dir, debug.log is directly in wp-content
    debugLogPath: debugLogPath,
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

