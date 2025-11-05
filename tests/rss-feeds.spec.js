import { test, expect } from './wp-fixtures.js';
import {
  testWordPressRSSFeed,
} from './test-helpers.js';

/**
 * @fileoverview Tests for WordPress RSS feeds
 */
test.describe('WordPress RSS Feeds', { tag: ['@api', '@feed'] }, () => {

  test('should validate RSS feed structure', async ({ page, wpInstance }) => {
    await testWordPressRSSFeed(page, wpInstance, '/feed/');
  });

  // Add more RSS feed tests here:
  // test('should validate comments RSS feed', async ({ page, wpInstance }) => {
  //   await testWordPressRSSFeed(page, wpInstance, '/comments/feed/');
  // });
});

