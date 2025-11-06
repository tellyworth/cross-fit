<?php
/**
 * Plugin Name: Big Mistake
 * Description: Helper plugin for testing error detection in WordPress E2E tests
 * Version: 1.0.0
 * Author: Cross-Fit Testing Tool
 */

/**
 * Trigger PHP errors based on request parameters or headers
 */
function big_mistake_trigger_errors() {
  // Check for trigger via GET parameter
  $php_error = isset($_GET['trigger_php_error']) ? $_GET['trigger_php_error'] : null;

  // Check for trigger via X- header (preferred for testing)
  if (!$php_error && isset($_SERVER['HTTP_X_TRIGGER_PHP_ERROR'])) {
    $php_error = $_SERVER['HTTP_X_TRIGGER_PHP_ERROR'];
  }

  // Check for JS error trigger
  $js_error = isset($_GET['trigger_js_error']) || isset($_SERVER['HTTP_X_TRIGGER_JS_ERROR']);

  // Trigger PHP errors
  if ($php_error) {
    switch (strtolower($php_error)) {
      case 'notice':
        // Access undefined variable to trigger PHP notice
        $undefined_var = $non_existent_variable;
        break;

      case 'warning':
        // Trigger PHP warning
        $file = file_get_contents('/non/existent/file.txt');
        break;

      case 'fatal':
        // Trigger fatal error (but wrap in try/catch to avoid breaking page completely)
        // Actually, we can't really trigger a fatal error without breaking the page
        // So we'll use a parse error or undefined function call
        trigger_error('Big Mistake: Fatal error simulation', E_USER_ERROR);
        break;

      case 'deprecated':
        // Trigger deprecated warning
        trigger_error('Big Mistake: Deprecated function call', E_USER_DEPRECATED);
        break;

      default:
        // Default to notice
        $undefined_var = $non_existent_variable;
    }
  }

  // Trigger JavaScript errors in wp_head
  if ($js_error) {
    add_action('wp_head', function() {
      $js_error_type = isset($_GET['js_error_type']) ? $_GET['js_error_type'] : 'console';
      if (isset($_SERVER['HTTP_X_TRIGGER_JS_ERROR_TYPE'])) {
        $js_error_type = $_SERVER['HTTP_X_TRIGGER_JS_ERROR_TYPE'];
      }

      switch (strtolower($js_error_type)) {
        case 'console':
          // Output console.error via script tag
          echo '<script>console.error("Big Mistake: Intentional console error for testing");</script>';
          break;

        case 'exception':
          // Output uncaught exception
          echo '<script>throw new Error("Big Mistake: Intentional uncaught exception for testing");</script>';
          break;

        default:
          echo '<script>console.error("Big Mistake: Intentional console error for testing");</script>';
      }
    });
  }
}

// Hook early to catch all errors
add_action('init', 'big_mistake_trigger_errors', 1);

/**
 * Trigger an HTTP request during page rendering for testing
 * This allows us to verify HTTP timeout errors appear in page content
 */
function big_mistake_test_http_request() {
  // Check for trigger via GET parameter
  $test_http = isset($_GET['test_http_timeout']) || isset($_SERVER['HTTP_X_TEST_HTTP_TIMEOUT']);

  if ($test_http) {
    // Make an external HTTP request that will timeout with our 0.1s timeout
    // This happens during page rendering, so errors will appear in page content
    $response = wp_remote_get('https://api.wordpress.org/core/version-check/1.7/', array(
      'timeout' => 0.1,
      'connect_timeout' => 0.1,
    ));

    // The http_response filter will trigger an error if timeout occurs
    // We don't need to do anything else here - the filter handles it
  }
}

add_action('wp_head', 'big_mistake_test_http_request', 1);


/**
 * Disable dashboard widgets that fetch external RSS feeds
 * This prevents slow server-side timeouts when fetching wordpress.org feeds
 */
function big_mistake_disable_external_feeds() {
  // Remove dashboard widgets that fetch external RSS feeds
  // These widgets cause slow timeouts in Playground environments
  remove_meta_box('dashboard_primary', 'dashboard', 'side'); // WordPress News
  remove_meta_box('dashboard_secondary', 'dashboard', 'side'); // Other WordPress News
  remove_meta_box('dashboard_plugins', 'dashboard', 'normal'); // Plugins feed
}

add_action('wp_dashboard_setup', 'big_mistake_disable_external_feeds', 999);

/**
 * Reduce HTTP timeouts for external requests to fail fast
 * When requests timeout, they will trigger PHP errors
 */
function big_mistake_reduce_http_timeout($args, $url) {
  $site_host = parse_url(get_site_url(), PHP_URL_HOST);
  $request_host = parse_url($url, PHP_URL_HOST);

  if ($request_host && $request_host !== $site_host) {
    $args['timeout'] = 0.1;
    $args['connect_timeout'] = 0.1;
  }

  return $args;
}

add_filter('http_request_args', 'big_mistake_reduce_http_timeout', 999, 2);


/**
 * Catch failed HTTP requests (including timeouts) and surface as PHP warnings
 * http_api_debug runs for both successful responses and WP_Error
 */
add_action('http_api_debug', function($response, $context, $class, $args, $url) {
  if (is_wp_error($response)) {
    $error_message = $response->get_error_message();
    if (stripos($error_message, 'timeout') !== false || stripos($error_message, 'timed out') !== false) {
      trigger_error(
        sprintf('HTTP request failed: %s (URL: %s)', $error_message, $url),
        E_USER_WARNING
      );
    }
  }
}, 10, 5);

