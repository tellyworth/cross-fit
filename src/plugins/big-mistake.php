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

