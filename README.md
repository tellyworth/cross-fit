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
- `npm run test:old` - Run the old script-based test (for reference)

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
- ✅ Test POST requests (form submissions, database changes)
- ✅ Detect JavaScript console errors
- ✅ Detect page errors
- ✅ Validate HTTP response status codes
- ✅ Verify page content (titles, classes, structure)

## Test Structure

Tests are organized using Playwright Test framework:

- `tests/wp-fixtures.js` - Custom fixtures providing WordPress instance for each test
- `tests/wordpress.spec.js` - Test suite with all test cases:
  - Public homepage test
  - Admin dashboard authentication test
  - RSS feed validation test
  - POST request test (changing site options)

## Current Limitations

This is an MVP. Currently it:
- Does not detect PHP errors directly (only JS/console errors)
- Does not test additional public pages (like `/about/`)
- Limited error reporting (basic console output only)

## Next Steps

- Add tests for additional pages (`/about/`, custom pages)
- Implement PHP error detection
- Add more sophisticated test scenarios
- Add support for testing plugins and themes
- Improve test reporting and output


