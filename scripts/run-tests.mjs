#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Simple argparse: supports --key=value and --key value forms
function parseArgs(argv) {
  const args = [];
  const kv = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        const key = a.slice(2, eq);
        const value = a.slice(eq + 1);
        kv[key] = value;
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        kv[a.slice(2)] = argv[i + 1];
        i += 1;
      } else {
        // flag without value; pass through
        args.push(a);
      }
    } else {
      args.push(a);
    }
  }
  return { passthrough: args, options: kv };
}

async function main() {
  const { passthrough, options } = parseArgs(process.argv.slice(2));

  // Map known options to env vars and strip from passthrough
  const env = { ...process.env };

  // Check for flag-style options in passthrough (e.g., --upgrade-all without value)
  if (passthrough.includes('--upgrade-all')) {
    env.WP_UPGRADE_ALL = '1';
    // Remove from passthrough so it doesn't get forwarded to Playwright
  }

  if (options.blueprint) {
    env.WP_BLUEPRINT = options.blueprint;
    // Do not forward --blueprint to Playwright
  }

  if (options.debugLog || options['debug-log']) {
    env.WP_DEBUG_LOG_LINES = options.debugLog || options['debug-log'];
    // Do not forward --debug-log to Playwright
  }

  if (options.import) {
    env.WP_IMPORT = options.import;
    // Do not forward --import to Playwright
  }

  if (options.theme) {
    env.WP_THEME = options.theme;
    // Do not forward --theme to Playwright
  }

  if (options.plugin) {
    env.WP_PLUGINS = options.plugin;
    // Do not forward --plugin to Playwright
  }

  if (options.wpversion || options['wp-version']) {
    env.WP_WP_VERSION = options.wpversion || options['wp-version'];
    // Do not forward --wpversion to Playwright
  }

  if (options['site-health'] || options.siteHealth) {
    env.WP_SITE_HEALTH = options['site-health'] || options.siteHealth;
    // Do not forward --site-health to Playwright
  }

  if (options['upgrade-all'] || options.upgradeAll) {
    env.WP_UPGRADE_ALL = '1';
    // Do not forward --upgrade-all to Playwright
  }

  // Handle FULL_MODE flag
  if (options.full || options.fullMode || process.env.FULL_MODE === '1') {
    env.FULL_MODE = '1';
    // Do not forward --full to Playwright
  }

  // Handle DEBUG flag
  if (options.debug || process.env.DEBUG === '1') {
    env.DEBUG = '1';
    // Do not forward --debug to Playwright
  }

  // Handle CAPTURE flag - map to Playwright's --update-snapshots
  // Check both options (--capture=value) and passthrough (--capture as flag) BEFORE filtering
  const hasCaptureFlag = options.capture || passthrough.includes('--capture') || process.env.CAPTURE === '1';

  // Handle CLEAR_SNAPSHOTS flag - delete test-snapshots directory and skip screenshot comparison
  // Check for flag in multiple formats: --clear-snapshots, clear-snapshots=1, or in passthrough
  const hasClearSnapshotsFlag = options['clear-snapshots'] || passthrough.includes('--clear-snapshots') ||
                                 options.clearSnapshots || process.env.CLEAR_SNAPSHOTS === '1';
  if (hasClearSnapshotsFlag) {
    const projectRoot = join(__dirname, '..');
    const snapshotsDir = join(projectRoot, 'test-snapshots');
    if (existsSync(snapshotsDir)) {
      try {
        rmSync(snapshotsDir, { recursive: true, force: true });
        console.log(`[Baseline] Cleared snapshots directory: ${snapshotsDir}`);
      } catch (error) {
        console.warn(`[Baseline] Failed to clear snapshots directory: ${error.message}`);
      }
    }
    // Skip screenshot comparison after clearing
    env.SKIP_SNAPSHOTS = '1';
  }

  // Handle SKIP_SNAPSHOTS flag - skip screenshot comparison entirely
  const hasSkipSnapshotsFlag = options['skip-snapshots'] || passthrough.includes('--skip-snapshots') ||
                                options.skipSnapshots || process.env.SKIP_SNAPSHOTS === '1';
  if (hasSkipSnapshotsFlag) {
    env.SKIP_SNAPSHOTS = '1';
  }

  // Handle SCREENSHOT_THRESHOLD - set pixel difference threshold (0-1)
  // Default is 0.02 (2%) as set in playwright.config.js
  // Only set env var if explicitly provided via CLI, otherwise use config default
  const screenshotThreshold = options['screenshot-threshold'] || options.screenshotThreshold ||
                              options.threshold || process.env.SCREENSHOT_THRESHOLD;

  if (screenshotThreshold) {
    const thresholdValue = parseFloat(screenshotThreshold);
    if (isNaN(thresholdValue) || thresholdValue < 0 || thresholdValue > 1) {
      console.warn(`[Baseline] Invalid screenshot threshold: ${screenshotThreshold}. Must be between 0 and 1. Using default 0.02.`);
    } else {
      env.SCREENSHOT_THRESHOLD = thresholdValue.toString();
    }
  }
  // If not provided, don't set env var - let playwright.config.js default (0.02) be used

  // Print single consolidated message about snapshot mode
  const thresholdMsg = screenshotThreshold ? ` (threshold: ${(parseFloat(screenshotThreshold) * 100).toFixed(1)}%)` : '';
  if (hasClearSnapshotsFlag) {
    console.log('[Baseline] Cleared snapshots, screenshot comparison disabled');
  } else if (hasSkipSnapshotsFlag) {
    console.log('[Baseline] Screenshot comparison disabled');
  } else if (hasCaptureFlag) {
    console.log(`[Baseline] Creating/updating snapshots${thresholdMsg}`);
  } else {
    // Only show comparison message if snapshots directory exists
    const projectRoot = join(__dirname, '..');
    const snapshotsDir = join(projectRoot, 'test-snapshots');
    if (existsSync(snapshotsDir)) {
      console.log(`[Baseline] Comparing against snapshots${thresholdMsg}`);
    }
    // If no snapshots exist, silently skip (no message needed)
  }

  // Forward all other options to Playwright (e.g., --grep, --grep-invert, etc.)
  // Filter out snapshot-related flags and upgrade-all from passthrough
  const forwardedArgs = passthrough.filter(arg =>
    arg !== '--capture' &&
    arg !== '--clear-snapshots' &&
    arg !== '--skip-snapshots' &&
    arg !== '--upgrade-all'
  );

  if (hasCaptureFlag) {
    // Set CAPTURE env var so test helpers know we're in capture mode
    env.CAPTURE = '1';
    // Map --capture to Playwright's --update-snapshots flag
    forwardedArgs.push('--update-snapshots');
    console.log('[Baseline] Capture mode enabled - will update screenshot snapshots');
  }
  for (const [key, value] of Object.entries(options)) {
      // Skip custom options that we handle ourselves
      if (key !== 'blueprint' && key !== 'debugLog' && key !== 'debug-log' &&
          key !== 'import' && key !== 'theme' && key !== 'plugin' &&
          key !== 'wpversion' && key !== 'wp-version' &&
          key !== 'site-health' && key !== 'siteHealth' &&
          key !== 'upgrade-all' && key !== 'upgradeAll' &&
          key !== 'full' && key !== 'fullMode' && key !== 'debug' &&
          key !== 'capture' && key !== 'clear-snapshots' && key !== 'clearSnapshots' &&
          key !== 'skip-snapshots' && key !== 'skipSnapshots' &&
          key !== 'screenshot-threshold' && key !== 'screenshotThreshold' && key !== 'threshold') {
        forwardedArgs.push(`--${key}=${value}`);
      }
  }

  // Future options (examples, not implemented):
  // if (options.plugins) env.WP_PLUGINS = options.plugins;
  // if (options.baseline) env.BASELINE = '1';

  const pwArgs = ['playwright', 'test', ...forwardedArgs];

  const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', pwArgs, {
    stdio: 'inherit',
    env,
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code ?? 1);
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


