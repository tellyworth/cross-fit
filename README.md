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

#### Running All Tests

- `npm test` - Run all tests in headless mode
- `npm run test:ui` - Run tests with Playwright UI mode (interactive)
- `npm run test:headed` - Run tests with visible browser window

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


