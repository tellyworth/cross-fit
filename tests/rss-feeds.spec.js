import { test, expect } from './wp-fixtures.js';
import {
  testWordPressRSSFeed,
} from './test-helpers.js';

test.describe('WordPress RSS Feeds', () => {

  test('should validate RSS feed structure', async ({ page, wpInstance }) => {
    const feedBaseUrl = wpInstance.url.replace(/\/$/, '');
    await testWordPressRSSFeed(page, `${feedBaseUrl}/feed/`);
  });

  // Add more RSS feed tests here:
  // test('should validate comments RSS feed', async ({ page, wpInstance }) => {
  //   const feedBaseUrl = wpInstance.url.replace(/\/$/, '');
  //   await testWordPressRSSFeed(page, `${feedBaseUrl}/comments/feed/`);
  // });
});

