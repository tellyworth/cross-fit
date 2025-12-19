#!/usr/bin/env node
import { spawn } from 'node:child_process';

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

  // Forward all other options to Playwright (e.g., --grep, --grep-invert, etc.)
  // Filter out --capture from passthrough
  const forwardedArgs = passthrough.filter(arg => arg !== '--capture');

  if (hasCaptureFlag) {
    // Map --capture to Playwright's --update-snapshots flag
    forwardedArgs.push('--update-snapshots');
    console.log('[Baseline] Capture mode enabled - will update screenshot snapshots');
  }
  for (const [key, value] of Object.entries(options)) {
      // Skip custom options that we handle ourselves
      if (key !== 'blueprint' && key !== 'debugLog' && key !== 'debug-log' &&
          key !== 'import' && key !== 'theme' && key !== 'plugin' &&
          key !== 'wpversion' && key !== 'wp-version' &&
          key !== 'full' && key !== 'fullMode' && key !== 'debug' && key !== 'capture') {
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


