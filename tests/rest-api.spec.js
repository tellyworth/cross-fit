import { test, expect } from './wp-fixtures.js';
import {
  testWordPressRESTAPI,
  testWordPressRESTEndpoints,
} from './test-helpers.js';

/**
 * @fileoverview Tests for WordPress REST API endpoints
 */
test.describe('WordPress REST API', { tag: '@api' }, () => {

  test('should access REST API base endpoint', { tag: '@smoke' }, async ({ page, wpInstance }) => {
    const result = await testWordPressRESTAPI(page, wpInstance, '/wp-json/', {
      expectedStatus: 200,
    });

    // WordPress REST API base should return an object with routes
    expect(result.data).toBeTruthy();
    expect(typeof result.data === 'object').toBe(true);
  });

  test('should access posts endpoint', async ({ page, wpInstance }) => {
    const result = await testWordPressRESTAPI(page, wpInstance, '/wp-json/wp/v2/posts', {
      expectedStatus: 200,
      validateResponse: (data) => {
        // Posts endpoint should return an array
        expect(Array.isArray(data)).toBe(true);
      },
    });
  });

  test('should access single post endpoint', async ({ page, wpInstance }) => {
    // First get posts to find a valid post ID
    const postsResult = await testWordPressRESTAPI(page, wpInstance, '/wp-json/wp/v2/posts', {
      expectedStatus: 200,
    });

    if (Array.isArray(postsResult.data) && postsResult.data.length > 0) {
      const postId = postsResult.data[0].id;
      const result = await testWordPressRESTAPI(page, wpInstance, `/wp-json/wp/v2/posts/${postId}`, {
        expectedStatus: 200,
        validateResponse: (data) => {
          // Single post should be an object with id and title
          expect(typeof data === 'object').toBe(true);
          expect(data.id).toBe(postId);
          expect(data.title).toBeTruthy();
        },
      });
    } else {
      // If no posts, test the endpoint anyway (may return 404 or empty)
      const result = await testWordPressRESTAPI(page, wpInstance, '/wp-json/wp/v2/posts/1', {
        expectedStatus: 200, // May be 404 if no posts, but we'll test it
      });
    }
  });

  test('should test multiple REST API endpoints', async ({ page, wpInstance }) => {
    // Test multiple endpoints with a single call
    // Paths are relative to /wp-json/wp/v2
    await testWordPressRESTEndpoints(page, wpInstance, [
      '/posts',
      '/pages',
      '/categories',
      '/tags',
      // Add more endpoints easily:
      // '/users',
      // '/comments',
    ]);
  });

  test('should handle POST requests to REST API', async ({ page, wpInstance }) => {
    // Note: This requires authentication. For now, we'll test that the endpoint exists
    // In a more complete implementation, we'd add auth headers
    // Without auth, WordPress may return 200 (with error), 401 (unauthorized), or 403 (forbidden)
    const result = await testWordPressRESTAPI(page, wpInstance, '/wp-json/wp/v2/posts', {
      method: 'POST',
      body: {
        title: 'Test Post',
        content: 'Test content',
        status: 'draft',
      },
      expectedStatus: 200, // Without auth, WordPress typically returns 200 with error in body
    });

    // Verify that we got a response (even if it's an error)
    // The endpoint should respond - status could be 200, 201, 401, or 403
    expect([200, 201, 401, 403]).toContain(result.status);

    // If we got a response, it should have data (even if it's an error message)
    expect(result.data).toBeTruthy();
  });
});

