import { test, expect } from './wp-fixtures.js';
import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * @fileoverview Internal test to verify visual diff failure mechanism works
 * @internal
 *
 * This test uses a committed baseline snapshot to verify that screenshot
 * comparison correctly fails when visual changes exceed the threshold.
 *
 * The baseline snapshot is stored in tests/snapshots/visual-diff-baseline-{platform}.png
 * and committed to version control. The test copies it to where Playwright expects it,
 * then loads the homepage with a visual diff trigger that should cause the comparison to fail.
 *
 * To create/update the baseline:
 *   1. Temporarily comment out the visual diff trigger in this test
 *   2. Run: INCLUDE_INTERNAL=1 npm test -- --capture
 *   3. Copy the generated snapshot from test-snapshots/visual-diff-baseline-{platform}.png
 *      to tests/snapshots/visual-diff-baseline-{platform}.png
 *   4. Restore the visual diff trigger in this test
 */
test.describe('Visual Diff Failure Test', { tag: '@internal' }, () => {

  test('should fail when visual diff exceeds threshold', async ({ page, wpInstance }) => {
    const platform = os.platform() === 'darwin' ? 'darwin' : os.platform() === 'win32' ? 'win32' : 'linux';
    const snapshotsDir = join(__dirname, 'snapshots');
    const committedSnapshot = join(snapshotsDir, `visual-diff-baseline-${platform}.png`);
    // Playwright automatically adds platform suffix to snapshot names
    // When we call toHaveScreenshot('visual-diff-baseline.png'), Playwright looks for
    // 'visual-diff-baseline-darwin.png' (or -win32.png, -linux.png)
    const testSnapshotsDir = join(__dirname, '..', 'test-snapshots');
    const expectedSnapshot = join(testSnapshotsDir, `visual-diff-baseline-${platform}.png`);

    // Ensure directories exist
    if (!existsSync(snapshotsDir)) {
      mkdirSync(snapshotsDir, { recursive: true });
    }
    if (!existsSync(testSnapshotsDir)) {
      mkdirSync(testSnapshotsDir, { recursive: true });
    }

    // If baseline doesn't exist, create it (without visual diff trigger)
    if (!existsSync(committedSnapshot)) {
      // Load homepage without visual diff trigger to create baseline
      await page.goto(wpInstance.url);
      await page.waitForLoadState('networkidle');

      // Take screenshot and save to committed location
      const screenshot = await page.screenshot({ fullPage: true });
      const fs = await import('fs/promises');
      await fs.writeFile(committedSnapshot, screenshot);

      // Also save to expected location for Playwright (with platform suffix)
      await fs.writeFile(expectedSnapshot, screenshot);

      test.skip(true, 'Baseline snapshot created. Run test again to verify visual diff failure.');
      return;
    }

    // Copy committed snapshot to expected location
    // Playwright automatically adds platform suffix when resolving snapshot names
    // When we call toHaveScreenshot('visual-diff-baseline.png'), Playwright looks for
    // 'visual-diff-baseline-darwin.png' (or -win32.png, -linux.png) based on the platform
    copyFileSync(committedSnapshot, expectedSnapshot);

    // Load homepage with visual diff trigger - this should fail comparison
    // against the committed baseline snapshot
    await page.goto(wpInstance.url, {
      headers: {
        'X-Trigger-Visual-Diff': '1',
      },
    });
    await page.waitForLoadState('networkidle');

    // This should fail because the red box injected by big-mistake.php
    // exceeds the 2% threshold compared to the committed baseline
    await expect(page).toHaveScreenshot('visual-diff-baseline.png', {
      fullPage: true,
    });
  });
});

