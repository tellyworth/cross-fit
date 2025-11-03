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

Run the minimal test:
```bash
npm test
```

Or directly:
```bash
node src/test.js
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

## Current Limitations

This is an MVP. Currently it:
- Does not detect PHP errors directly (only JS/console errors)
- Does not test additional public pages (like `/about/`)
- Does not use a formal test framework
- Limited error reporting (basic console output only)

## Next Steps

- Add tests for additional pages (`/about/`, `/rss.xml`)
- Implement PHP error detection
- Improve error reporting and test output
- Consider integrating a test framework (Jest, Mocha, etc.)
- Add support for testing plugins and themes


