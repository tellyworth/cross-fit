import { spawn } from 'child_process';
import { setTimeout as setTimeoutPromise } from 'timers/promises';
import http from 'http';

/**
 * Check if a URL is responding
 */
async function isUrlReady(url, timeout = 5000) {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    const req = http.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || 80,
        path: urlObj.pathname || '/',
        method: 'HEAD',
        timeout,
      },
      (res) => {
        resolve(res.statusCode === 200 || res.statusCode === 302 || res.statusCode === 301);
      }
    );

    req.on('error', () => {
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

/**
 * Wait for server to be ready by polling the URL
 */
async function waitForServer(url, maxAttempts = 30, interval = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    const ready = await isUrlReady(url);
    if (ready) {
      return true;
    }
    await setTimeoutPromise(interval);
  }
  return false;
}

/**
 * Launches WordPress Playground using @wp-playground/cli
 * Returns an object with methods to start/stop the instance
 */
export async function launchWordPress() {
  const cliProcess = spawn('npx', ['@wp-playground/cli@latest', 'server'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });

  let serverUrl = null;
  const outputBuffer = [];

  // Capture output to find server URL
  cliProcess.stdout.on('data', (data) => {
    const text = data.toString();
    outputBuffer.push(text);
    process.stdout.write(text);

    // Look for URL patterns in output
    const urlMatch = text.match(/http[s]?:\/\/[^\s]+/);
    if (urlMatch && !serverUrl) {
      serverUrl = urlMatch[0];
    }
  });

  cliProcess.stderr.on('data', (data) => {
    const text = data.toString();
    outputBuffer.push(text);
    process.stderr.write(text);

    // Also check stderr for URLs
    const urlMatch = text.match(/http[s]?:\/\/[^\s]+/);
    if (urlMatch && !serverUrl) {
      serverUrl = urlMatch[0];
    }
  });

  // Check if process exits early (error)
  cliProcess.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`\n⚠️  WordPress Playground process exited with code ${code}`);
      console.error('Output:', outputBuffer.join(''));
    }
  });

  // Default to localhost:9400 if we can't find URL in output
  // This is a common default for WordPress Playground
  if (!serverUrl) {
    serverUrl = 'http://localhost:9400';
  }

  console.log(`Waiting for server to be ready at ${serverUrl}...`);

  // Wait for server to actually be ready by polling
  const ready = await waitForServer(serverUrl, 30, 1000);

  if (!ready) {
    throw new Error(
      `Server at ${serverUrl} did not become ready within 30 seconds. ` +
      `Process may have failed. Check output above for errors.`
    );
  }

  console.log(`✓ Server is ready at ${serverUrl}`);

  return {
    url: serverUrl,
    process: cliProcess,
    stop: async () => {
      cliProcess.kill();
      await new Promise((resolve) => {
        let resolved = false;
        const resolveOnce = () => {
          if (!resolved) {
            resolved = true;
            resolve();
          }
        };

        // Force kill after 5 seconds if it doesn't exit
        const timeoutId = globalThis.setTimeout(() => {
          if (!cliProcess.killed) {
            cliProcess.kill('SIGKILL');
          }
          resolveOnce();
        }, 5000);

        // Handle normal exit
        cliProcess.on('exit', () => {
          globalThis.clearTimeout(timeoutId);
          resolveOnce();
        });
      });
    },
  };
}

