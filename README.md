# Cross-Fit - WordPress E2E Testing Tool

A minimal end-to-end testing tool for WordPress using WordPress Playground.

Cross-Fit is intended to help answer the question "will changing (this thing) break my WordPress site?" - where "this thing" might be upgrading core, installing a new plugin, switching themes, etc.

It's designed to catch things like PHP and JS errors, especially those that might appear only on one page of a site.

## Overview

This MVP demonstrates feasibility of using WordPress Playground for E2E testing. It spins up a local WordPress instance, makes HTTP requests to it, and validates basic functionality.

## Prerequisites

- Node.js 20.18 or newer
- npm

## Setup

1. Install dependencies:
```bash
npm install
```

2. Install Playwright browsers:
```bash
npx playwright install chromium
```

## Usage

Run all tests:
```bash
npm test
```

### Test Commands
#### Loading a Blueprint

You can optionally load a WordPress Blueprint before running tests. Provide a local file path or a URL with our test runner wrapper:

```bash
# From URL (example: Theme a11y test blueprint)
npm test -- --blueprint=https://raw.githubusercontent.com/wordpress/blueprints/trunk/blueprints/theme-a11y-test/blueprint.json

# From local file
npm test -- --blueprint=./path/to/blueprint.json

# Alternatively via environment variable
WP_BLUEPRINT=./path/to/blueprint.json npm test
```

The provided blueprint is merged with our base debug step (WP_DEBUG, WP_DEBUG_DISPLAY, WP_DEBUG_LOG), which is prepended to ensure PHP errors are visible in rendered pages.

#### Installing themes and plugins, and importing content

```bash
# Import a WXR file
npm test -- --import=./path/to/export.xml
npm test -- --import=https://example.com/export.xml

# Install and activate a theme
npm test -- --theme=twentytwentyfour

# Install and activate plugins (single or multiple)
npm test -- --plugin=akismet
npm test -- --plugin=akismet,jetpack,woocommerce

# Combine all options
npm test -- --import=./export.xml --theme=twentytwentyfour --plugin=akismet,jetpack
```

#### Running All Tests

- `npm test` - Run standard tests in headless mode
- `npm run test:full` - Run expanded tests on every public and admin page
- `npm run test:ui` - Run tests with Playwright UI mode (interactive)
- `npm run test:headed` - Run tests with visible browser window

#### Debugging Options

**View WordPress Debug Log**

After tests complete, you can view the WordPress debug log to see PHP errors, warnings, and notices that occurred during the test run:

```bash
# Show the last 50 lines of the debug log
npm test -- --debug-log=50

# Show the last 200 lines
npm test -- --debug-log=200
```

The debug log is automatically captured from the WordPress instance and displayed at the end of the test run. Even without `--debug-log`, the teardown will report how many lines are in the debug log and the file path if any errors occurred.

**Note**: The debug log only contains PHP errors, warnings, and notices. Network errors (like `ECONNRESET`) and test timeouts are not logged to the WordPress debug log.

#### Running Test Subsets

Use Playwright's grep filters to run subsets by tag:

```bash
# Smoke tests (basic coverage)
npx playwright test --grep "@smoke"

# Public pages only
npx playwright test --grep "@public"

# Admin pages only
npx playwright test --grep "@admin"

# API tests (REST + RSS)
npx playwright test --grep "@api"

# Internal self-tests (error detection verification)
# Note: By default, @internal tests are excluded. To include, set env var:
INCLUDE_INTERNAL=1 npx playwright test --grep "@internal"

# WordPress functionality tests (exclude internal)
# (default behavior already excludes @internal)
npx playwright test
```

#### Running Specific Test Files

You can also run specific test files directly:

```bash
# Run a specific test file
npx playwright test tests/public-pages.spec.js

# Run tests matching a pattern
npx playwright test --grep "homepage"

# Run tests excluding certain tags
npx playwright test --grep-invert "@internal"
```

### Running with Visible Browser

By default, tests run in headless mode. To see the browser window during testing:

```bash
npm run test:headed
```

Or use the UI mode for interactive debugging:
```bash
npm run test:ui
```

## What It Does

1. Launches WordPress Playground using `@wp-playground/cli` with automatic admin login (`--login`)
2. Tests multiple page types:
   - **Public pages**: Navigates to root URL (`/`) and validates basic page properties
   - **Authenticated pages**: Tests access to `/wp-admin/` dashboard
   - **RSS feed**: Validates `/feed/` RSS feed with XML structure validation
   - **POST requests**: Tests form submissions by changing site options in `/wp-admin/options-general.php`
3. Captures JavaScript console errors and page errors across all tests
4. Validates page properties (titles, body classes, admin elements)
5. Reports results and cleans up resources

## Current Features

- ✅ Spin up WordPress Playground locally
- ✅ Test public pages (root URL)
- ✅ Test authenticated admin pages (`/wp-admin/`)
- ✅ Test RSS feed with XML validation (`/feed/`)
- ✅ Test REST API endpoints
- ✅ Test POST requests (form submissions, database changes)
- ✅ Detect JavaScript console errors
- ✅ Detect JavaScript uncaught exceptions
- ✅ Detect PHP errors (notices, warnings, fatal errors)
- ✅ Detect page errors
- ✅ Validate HTTP response status codes
- ✅ Verify page content (titles, classes, structure)

## Test Structure

Tests are organized using Playwright Test framework:

### Core Test Infrastructure

- `tests/wp-fixtures.js` - Custom fixtures providing WordPress instance for each test
- `tests/global-setup.js` - Launches WordPress Playground once for all tests
- `tests/global-teardown.js` - Cleans up WordPress Playground after all tests
- `tests/test-helpers.js` - Reusable test helper functions

### Test Categories

#### Public Pages (`@public`)
- `tests/public-pages.spec.js` - Tests for public-facing WordPress pages
  - Homepage loading
  - Multiple page validation
  - Custom page options

#### Admin Pages (`@admin`)
- `tests/admin-pages.spec.js` - Tests for authenticated WordPress admin pages
  - Admin dashboard access
  - Multiple admin pages
  - POST requests (form submissions)

#### API Tests (`@api`)
- `tests/rest-api.spec.js` - WordPress REST API endpoints
- `tests/rss-feeds.spec.js` - RSS feed validation

#### Internal Tests (`@internal`)
- `tests/console-errors.spec.js` - Verifies JavaScript error detection is working
- `tests/php-errors.spec.js` - Verifies PHP error detection is working

### Smoke Tests (`@smoke`)

Fast subset of tests that verify basic WordPress functionality:
- Homepage loads without errors (`public-pages.spec.js`)
- Admin dashboard is accessible (`admin-pages.spec.js`)
- REST API base endpoint is accessible (`rest-api.spec.js`)

Run smoke tests with: `npx playwright test --grep "@smoke"`

## Big Mistake Plugin

The test suite includes a helper plugin (`src/plugins/big-mistake.php`) that automatically installs as a must-use plugin. This plugin allows tests to trigger PHP and JavaScript errors on demand for testing error detection:

- PHP errors: Use `?trigger_php_error=notice|warning|fatal|deprecated` or `X-Trigger-PHP-Error` header
- JavaScript errors: Use `?trigger_js_error=1` or `X-Trigger-JS-Error` header

## Current Limitations

This is an MVP. Currently it:
- Does not test additional public pages (like `/about/`)
- Limited test coverage for edge cases

## Next Steps

- Add tests for additional pages (`/about/`, custom pages)
- Add more sophisticated test scenarios
- Add support for testing plugins and themes
- Improve test reporting and output


