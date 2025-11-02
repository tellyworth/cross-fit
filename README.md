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

1. Launches WordPress Playground using `@wp-playground/cli`
2. Navigates to the root URL using Playwright
3. Captures JavaScript console errors
4. Validates basic page properties (title, body classes)
5. Reports results and cleans up

## Current Limitations

This is an MVP. Currently it:
- Only tests the root URL (`/`)
- Does not test authenticated routes
- Does not perform POST requests
- Does not detect PHP errors directly

## Next Steps

- Add tests for additional pages (`/about/`, `/rss.xml`)
- Implement authenticated requests to `/wp-admin/`
- Add POST request testing
- Improve error detection (PHP errors, network errors)


