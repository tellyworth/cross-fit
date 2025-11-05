# Cross-Fit - WordPress E2E Testing Tool

A minimal end-to-end testing tool for WordPress using WordPress Playground.

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

- `npm test` - Run all tests in headless mode
- `npm run test:ui` - Run tests with Playwright UI mode (interactive)
- `npm run test:headed` - Run tests with visible browser window

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

- `tests/wp-fixtures.js` - Custom fixtures providing WordPress instance for each test
- `tests/global-setup.js` - Launches WordPress Playground once for all tests
- `tests/global-teardown.js` - Cleans up WordPress Playground after all tests
- `tests/test-helpers.js` - Reusable test helper functions
- Test spec files:
  - `tests/public-pages.spec.js` - Public-facing WordPress pages
  - `tests/admin-pages.spec.js` - Authenticated admin pages and POST requests
  - `tests/rss-feeds.spec.js` - RSS feed validation
  - `tests/rest-api.spec.js` - WordPress REST API endpoints
  - `tests/console-errors.spec.js` - JavaScript error detection
  - `tests/php-errors.spec.js` - PHP error detection

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


