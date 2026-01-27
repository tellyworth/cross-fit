<?php
/**
 * Plugin Name: Big Mistake
 * Description: Helper plugin for testing error detection in WordPress E2E tests; NOT FOR USE ON PRODUCTION SITES.
 * Version: 1.0.0
 * Author: Cross-Fit Testing Tool
 */

 /**
  * This plugin is intended only for use in local testing environments.
  * It is of no use outside of e2e testing and will break production sites.
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
        // Trigger a real fatal error. Breaking the page is intended.
        non_existent_function(); // phpcs:ignore
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
 * Trigger visual diff for testing screenshot comparison
 * Injects a visible element that exceeds the 2% threshold
 */
function big_mistake_trigger_visual_diff() {
  $visual_diff = isset($_GET['trigger_visual_diff']) || isset($_SERVER['HTTP_X_TRIGGER_VISUAL_DIFF']);
  if ($visual_diff) {
    $inject_visual_diff = function() {
      // Inject a small but visible element that will cause a visual diff
      // This creates a colored box that should exceed 2% threshold
      echo '<div style="position: fixed; top: 10px; right: 10px; width: 100px; height: 100px; background: #ff0000; z-index: 99999; border: 2px solid #000;"></div>';
    };
    add_action('wp_footer', $inject_visual_diff, 999);
    add_action('admin_footer', $inject_visual_diff, 999);
  }
}

add_action('init', 'big_mistake_trigger_visual_diff', 1);

/**
 * Trigger an HTTP request during page rendering for testing
 * This allows us to verify HTTP timeout errors appear in page content
 */
function big_mistake_test_http_request() {
  // Check for trigger via GET parameter
  $test_http = isset($_GET['test_http_timeout']) || isset($_SERVER['HTTP_X_TEST_HTTP_TIMEOUT']);

  if ($test_http) {
    // Make an external HTTP request that will timeout with our 0.1s timeout
    // Use a URL that isn't blocked by pre_http_request filter (not api.wordpress.org)
    // This happens during page rendering, so errors will appear in page content
    $response = wp_remote_get('https://httpbin.org/delay/1', array(
      'timeout' => 0.1,
      'connect_timeout' => 0.1,
    ));

    // The http_api_debug action will trigger an error if timeout occurs
    // We don't need to do anything else here - the action handles it
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

  // Preemptively remove ActivityPub dashboard widgets because they'll cause timeouts
  remove_meta_box( 'activitypub_blog', null, 'normal');
  remove_meta_box( 'activitypub_profile', null, 'normal');
  remove_meta_box( 'activitypub_blog_profile', null, 'normal');

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
 * Get a trimmed backtrace with big-mistake frames removed from the top
 * Formats the backtrace for logging to debug.log
 *
 * @param int $skip_frames Number of frames to skip from the top (default: auto-detect big-mistake frames)
 * @param int $limit Maximum number of frames to include (default: 15)
 * @return string Formatted backtrace string
 */
function big_mistake_get_trimmed_backtrace($skip_frames = null, $limit = 15) {
  // Include args so we can show hook names for do_action/apply_filters
  $backtrace = debug_backtrace(DEBUG_BACKTRACE_PROVIDE_OBJECT, $limit + 10);
  $big_mistake_file = __FILE__;
  $abspath = defined('ABSPATH') ? ABSPATH : '';

  // If skip_frames not specified, auto-detect: skip frames from big-mistake.php and error handler
  if ($skip_frames === null) {
    $skip_frames = 0;
    foreach ($backtrace as $frame) {
      // Skip the error handler function itself (even if file is not set)
      if (isset($frame['function']) && $frame['function'] === 'big_mistake_error_handler') {
        $skip_frames++;
        continue;
      }
      // Skip big-mistake.php files
      if (isset($frame['file']) && $frame['file'] === $big_mistake_file) {
        $skip_frames++;
        continue;
      }
      // Stop at first non-big-mistake frame
      break;
    }
  }

  // Remove the skipped frames
  $backtrace = array_slice($backtrace, $skip_frames);
  // Limit to requested number of frames
  $backtrace = array_slice($backtrace, 0, $limit);

  if (empty($backtrace)) {
    return '  (no backtrace available)';
  }

  $lines = array();
  foreach ($backtrace as $index => $frame) {
    $file = isset($frame['file']) ? $frame['file'] : 'unknown';
    $line = isset($frame['line']) ? $frame['line'] : '?';
    $function = isset($frame['function']) ? $frame['function'] : 'unknown';

    // Make file path relative for cleaner output
    if ($abspath && strpos($file, $abspath) === 0) {
      $file = str_replace($abspath, '', $file);
    }

    // For do_action and apply_filters, show the hook name (first argument)
    $function_display = $function;
    if (($function === 'do_action' || $function === 'apply_filters') && isset($frame['args'][0])) {
      $hook_name = $frame['args'][0];
      if (is_string($hook_name)) {
        $function_display = sprintf('%s(\'%s\')', $function, $hook_name);
      } else {
        $function_display = sprintf('%s(...)', $function);
      }
    } else {
      $function_display = $function . '()';
    }

    // Format: #0 file.php(123): function_name()
    $lines[] = sprintf('  #%d %s(%s): %s', $index, $file, $line, $function_display);
  }

  return implode("\n", $lines);
}

/**
 * Log PHP errors with backtraces to debug.log.
 *
 * - Respects error_reporting(), including @-suppressed errors.
 * - For errors triggered via wp_trigger_error() (E_USER_*), logs them but
 *   prevents further handling so they are not output to the page. This avoids
 *   cascading "Cannot modify header information" warnings caused by late output.
 */
function big_mistake_error_handler($errno, $errstr, $errfile, $errline, $errcontext = null) {
  // Respect @-suppression: if error_reporting() is 0, this error was silenced.
  $reporting = error_reporting();
  if (0 === $reporting) {
    return false; // Do not log or modify default behavior.
  }

  // Obey error_reporting mask generally – skip errors that are not currently reported.
  if (!($reporting & $errno)) {
    return false;
  }

  // Detect if this error was triggered via wp_trigger_error().
  $is_wp_trigger_error = false;
  $trace_for_detection = debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, 10);
  foreach ($trace_for_detection as $frame) {
    if (isset($frame['function']) && 'wp_trigger_error' === $frame['function']) {
      $is_wp_trigger_error = true;
      break;
    }
  }

  // Only log if WP_DEBUG_LOG is enabled.
  $should_log = defined('WP_DEBUG_LOG') && WP_DEBUG_LOG;
  if ($should_log) {
    // Determine if we should include backtrace.
    // Backtraces are enabled if WP_ENABLE_BACKTRACES is set, OR for fatal errors.
    // Fatal error types: E_ERROR, E_CORE_ERROR, E_COMPILE_ERROR, E_PARSE, E_RECOVERABLE_ERROR.
    // This can be easily tweaked by modifying the $fatal_error_mask below.
    $enable_backtraces = defined('WP_ENABLE_BACKTRACES') && WP_ENABLE_BACKTRACES;
    $fatal_error_mask = E_ERROR | E_CORE_ERROR | E_COMPILE_ERROR | E_PARSE | E_RECOVERABLE_ERROR;
    $is_fatal_error = (bool)($errno & $fatal_error_mask);
    $include_backtrace = $enable_backtraces || $is_fatal_error;

    $backtrace_text = '';
    if ($include_backtrace) {
      // Get trimmed backtrace (auto-detect will skip error handler and big-mistake frames).
      $backtrace = big_mistake_get_trimmed_backtrace(null, 15);
      $backtrace_text = "\nBacktrace:\n" . $backtrace;
    }

    // Format error message (with optional backtrace).
    $error_types = array(
      E_ERROR => 'E_ERROR',
      E_WARNING => 'E_WARNING',
      E_PARSE => 'E_PARSE',
      E_NOTICE => 'E_NOTICE',
      E_CORE_ERROR => 'E_CORE_ERROR',
      E_CORE_WARNING => 'E_CORE_WARNING',
      E_COMPILE_ERROR => 'E_COMPILE_ERROR',
      E_COMPILE_WARNING => 'E_COMPILE_WARNING',
      E_USER_ERROR => 'E_USER_ERROR',
      E_USER_WARNING => 'E_USER_WARNING',
      E_USER_NOTICE => 'E_USER_NOTICE',
      E_STRICT => 'E_STRICT',
      E_RECOVERABLE_ERROR => 'E_RECOVERABLE_ERROR',
      E_DEPRECATED => 'E_DEPRECATED',
      E_USER_DEPRECATED => 'E_USER_DEPRECATED',
    );

    $error_type = isset($error_types[$errno]) ? $error_types[$errno] : 'Unknown';
    // Get the current request URI to include in the error message
    $request_uri = isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : 'unknown';
    // WordPress's error_log() already adds a timestamp, so we don't include one here
    $message = sprintf(
      "PHP %s: %s in %s on line %d (Request URI: %s)%s",
      $error_type,
      $errstr,
      $errfile,
      $errline,
      $request_uri,
      $backtrace_text
    );

    error_log($message);
  }

  // For errors triggered via wp_trigger_error(), prevent further handling so they
  // are not output to the page (but we've already logged them above).
  $user_error_mask = E_USER_ERROR | E_USER_WARNING | E_USER_NOTICE | E_USER_DEPRECATED;
  if ($is_wp_trigger_error && ($errno & $user_error_mask)) {
    return true;
  }

  // For all other errors, return false to let WordPress / PHP continue as normal.
  return false;
}

// Register error handler for all error types
set_error_handler('big_mistake_error_handler', E_ALL);

/**
 * Catch failed HTTP requests (including timeouts) and surface as PHP warnings
 * http_api_debug runs for both successful responses and WP_Error
 */
add_action('http_api_debug', function($response, $context, $class, $args, $url) {
  if (is_wp_error($response)) {
    $error_message = $response->get_error_message();
    if (stripos($error_message, 'timeout') !== false || stripos($error_message, 'timed out') !== false) {
      // Get the current request URI to include in the error message
      $request_uri = isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : 'unknown';

      // Log backtrace to debug.log if WP_DEBUG_LOG is enabled
      // Note: We intentionally do NOT trigger a PHP error here to prevent error cascades
      // when testing real plugins. HTTP timeout errors are logged but not displayed in page output.
      if (defined('WP_DEBUG_LOG') && WP_DEBUG_LOG) {
        // Include backtrace only if WP_ENABLE_BACKTRACES is set (HTTP errors are warnings, not fatal)
        $backtrace_text = '';
        if (defined('WP_ENABLE_BACKTRACES') && WP_ENABLE_BACKTRACES) {
          $backtrace = big_mistake_get_trimmed_backtrace(null, 15);
          $backtrace_text = "\nBacktrace:\n" . $backtrace;
        }
        // WordPress's error_log() already adds a timestamp, so we don't include one here
        $log_message = sprintf(
          "HTTP request failed: %s (URL: %s) (Request URI: %s)%s",
          $error_message,
          $url,
          $request_uri,
          $backtrace_text
        );
        error_log($log_message);
      }
    }
  }
}, 10, 5);

/**
 * Hard-block requests to api.wordpress.org and self-requests to avoid slow update checks and protocol mismatches
 * Self-requests can cause HPE_INVALID_METHOD errors when WordPress tries HTTPS on an HTTP server
 */
function big_mistake_block_problematic_requests($preempt, $args, $url) {
  $host = parse_url($url, PHP_URL_HOST);
  if (!$host) {
    return $preempt;
  }

  // Block api.wordpress.org requests
  if (preg_match('/(^|\\.)api\\.wordpress\\.org$/i', $host)) {
    return new WP_Error('blocked_api_wordpress_org', 'Blocked api.wordpress.org during tests');
  }

  // Block self-requests (WordPress making HTTP requests to itself)
  // This prevents HPE_INVALID_METHOD errors from protocol mismatches (HTTPS client, HTTP server)
  $site_host = parse_url(get_site_url(), PHP_URL_HOST);

  // Match host (ignore port differences - localhost requests are problematic regardless)
  if ($host === $site_host || $host === '127.0.0.1' || $host === 'localhost') {
    return new WP_Error('blocked_self_request', 'Blocked self-request during tests to prevent protocol mismatches');
  }

  return $preempt;
}

add_filter('pre_http_request', 'big_mistake_block_problematic_requests', 999, 3);

/**
 * Disable WordPress update checks that run on admin pages
 * These checks can cause slow page loads when they timeout
 */
function big_mistake_disable_update_checks() {
  // Disable automatic background update checks
  remove_action('wp_update_plugins', 'wp_update_plugins');
  remove_action('wp_update_themes', 'wp_update_themes');
  remove_action('wp_version_check', 'wp_version_check');
  remove_action('wp_maybe_auto_update', 'wp_maybe_auto_update');

  // Disable update checks on admin pages
  remove_action('admin_init', '_maybe_update_core');
  remove_action('admin_init', '_maybe_update_plugins');
  remove_action('admin_init', '_maybe_update_themes');
  remove_action('admin_init', 'wp_maybe_auto_update');

  // Disable update checks on admin pages (alternative hooks)
  remove_action('load-update-core.php', 'wp_update_plugins');
  remove_action('load-update-core.php', 'wp_update_themes');
  remove_action('load-update-core.php', 'wp_version_check');

  // Disable update checks on specific admin pages
  remove_action('load-themes.php', 'wp_update_themes');
  remove_action('load-plugins.php', 'wp_update_plugins');
}

add_action('init', 'big_mistake_disable_update_checks', 1);

/**
 * Disable WordPress translation API checks
 * These checks try to connect to api.wordpress.org and cause errors when blocked
 */
function big_mistake_disable_translation_checks() {
  // Filter translations_api to return empty result without making HTTP request
  add_filter('translations_api', function($result, $requested_type, $args) {
    // Return empty result to prevent WordPress from making HTTP requests
    return array(
      'translations' => array(),
      'no_update' => array(),
    );
  }, 10, 3);
}

add_action('init', 'big_mistake_disable_translation_checks', 1);

/**
 * Disable WordPress Heartbeat API to reduce server load
 * The Heartbeat API can cause slow admin pages in resource-constrained environments
 */
function big_mistake_disable_heartbeat() {
  wp_deregister_script('heartbeat');
}

add_action('init', 'big_mistake_disable_heartbeat', 1);

// Track script enqueues using monkey patch hook (added to wp_enqueue_script() via blueprint)
// Only enabled when WP_SCRIPT_TRACKING constant is true
global $big_mistake_script_tracking;
$big_mistake_script_tracking = array();

// Hook into big_mistake_wp_enqueue_script action (added via monkey patch to wp_enqueue_script())
// This allows us to capture where each script is enqueued from without logging full backtraces
// Note: wp_enqueue_script signature is: $handle, $src, $deps, $ver, $args
// Only enabled when WP_SCRIPT_TRACKING constant is true
if (defined('WP_SCRIPT_TRACKING') && WP_SCRIPT_TRACKING) {
  add_action('big_mistake_wp_enqueue_script', function($handle, $src, $deps, $ver, $args) {
  global $pagenow;

  // Get backtrace so we can find the first non-core frame where the script was enqueued
  $backtrace = debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, 20);

  // Find the first non-WordPress-core frame (where the script was actually enqueued)
  $enqueue_location = 'unknown';
  foreach ($backtrace as $frame) {
    if (isset($frame['file'])) {
      $file = $frame['file'];

      // Skip WordPress core and this plugin
      if (strpos($file, WPINC) === false &&
          strpos($file, ABSPATH . 'wp-admin') === false &&
          strpos($file, 'big-mistake.php') === false &&
          strpos($file, 'class-wp-scripts.php') === false &&
          strpos($file, 'functions.wp-scripts.php') === false) {

        // Make path relative
        if (strpos($file, ABSPATH) === 0) {
          $file = substr($file, strlen(ABSPATH));
        }

        $line = isset($frame['line']) ? $frame['line'] : 'unknown';
        $function = isset($frame['function']) ? $frame['function'] : 'unknown';
        $class = isset($frame['class']) ? $frame['class'] . '::' : '';
        $type = isset($frame['type']) ? $frame['type'] : '';

        $enqueue_location = sprintf('%s%s%s() at %s:%s', $class, $type, $function, $file, $line);
        break;
      }
    }
  }

  // Store for later use in the final summary
  global $big_mistake_script_tracking;
  if (!isset($big_mistake_script_tracking['script_sources'])) {
    $big_mistake_script_tracking['script_sources'] = array();
  }
  if (!isset($big_mistake_script_tracking['script_sources'][$handle])) {
    $big_mistake_script_tracking['script_sources'][$handle] = $enqueue_location;
  }
  }, 10, 5);

  // Log final summary of plugin-enqueued scripts with their enqueue locations
  add_action('admin_enqueue_scripts', function($hook) {
  global $pagenow, $wp_scripts, $big_mistake_script_tracking;

  if (!isset($wp_scripts) || !is_a($wp_scripts, 'WP_Scripts')) {
    return;
  }

  // Collect all queued scripts with their enqueue locations
  $queued = array();
  foreach ($wp_scripts->queue as $handle) {
    if (isset($wp_scripts->registered[$handle])) {
      $script = $wp_scripts->registered[$handle];
      $src = $script->src;
      if ($src && !preg_match('#^(https?:)?//#', $src)) {
        $src = site_url($src);
      }

      $queued[] = array(
        'handle' => $handle,
        'src' => $src ?: '(inline)',
        'deps' => $script->deps,
        'version' => $script->ver ?: 'none',
      );
    }
  }

  // Get enqueue locations we captured from big_mistake_wp_enqueue_script hook
  $script_sources = isset($big_mistake_script_tracking['script_sources']) ? $big_mistake_script_tracking['script_sources'] : array();

  // Filter to only scripts enqueued by plugins / non-core code (i.e. those with a known, non-core location)
  $plugin_enqueued = array();
  foreach ($queued as $script) {
    $handle = $script['handle'];
    if (isset($script_sources[$handle]) && $script_sources[$handle] !== 'unknown') {
      $script['enqueued_from'] = $script_sources[$handle];
      $plugin_enqueued[] = $script;
    }
  }

  error_log(sprintf('[Big Mistake] Plugin enqueued scripts (%d) on %s:', count($plugin_enqueued), $pagenow));

  foreach ($plugin_enqueued as $index => $script) {
    error_log(sprintf(
      '  %d. handle=%s, src=%s, deps=%s, version=%s, enqueued_from=%s',
      $index + 1,
      $script['handle'],
      $script['src'],
      implode(',', $script['deps']),
      $script['version'],
      $script['enqueued_from']
    ));
  }
  }, 999);
}


/**
 * Disable WordPress compression test AJAX request
 * WordPress checks get_site_option('can_compress_scripts') in admin-footer.php
 * If it returns false, compression_test() is called. We use filters to ensure it returns true.
 */
function big_mistake_filter_can_compress_scripts($value) {
  // WordPress only calls compression_test() if get_site_option('can_compress_scripts') === false
  // Return true (or any non-false value) to prevent the test from running
  return true;
}

// Filter both the option and default option to catch all cases
// WordPress uses get_site_option() which checks both the option and default
add_filter('option_can_compress_scripts', 'big_mistake_filter_can_compress_scripts');
add_filter('default_option_can_compress_scripts', 'big_mistake_filter_can_compress_scripts');
// Also filter site option for multisite
add_filter('site_option_can_compress_scripts', 'big_mistake_filter_can_compress_scripts');
add_filter('default_site_option_can_compress_scripts', 'big_mistake_filter_can_compress_scripts');

/**
 * Generate discovery data for E2E tests.
 * Returns an array with post types, list pages, admin menu items, and submenu items.
 */
/**
 * Discover common public pages (homepage, feed, etc.)
 * Returns array with path, title, and body class
 */
function big_mistake_discover_common_pages() {
  $common_pages = array();

  // Homepage
  $home_path = '/';
  $home_title = get_bloginfo('name');
  $home_description = get_bloginfo('description');
  if ($home_description) {
    $home_title .= ' - ' . $home_description;
  }
  // Default body class for homepage (WordPress typically uses 'home blog' for blog homepage)
  $home_body_class = 'home blog';

  $common_pages[] = array(
    'path' => $home_path,
    'title' => $home_title,
    'bodyClass' => $home_body_class,
    'type' => 'homepage',
    'description' => 'Homepage',
  );

  // RSS Feed
  $feed_path = '/feed/';
  $common_pages[] = array(
    'path' => $feed_path,
    'title' => '',
    'bodyClass' => '',
    'type' => 'feed',
    'description' => 'RSS Feed',
  );

  return $common_pages;
}

function big_mistake_get_discovery_data_array() {
  return array(
    'postTypes'        => big_mistake_discover_post_types(),
    'postItems'        => big_mistake_discover_post_items(),
    'listPages'        => big_mistake_discover_list_pages(),
    'commonPages'      => big_mistake_discover_common_pages(),
    'adminMenuItems'   => big_mistake_discover_admin_menu_items(),
    'adminSubmenuItems'=> big_mistake_discover_admin_submenu_items(),
  );
}

/**
 * Write discovery data to a JSON file in wp-content.
 * This file is used by the test suite instead of a REST API endpoint.
 */
function big_mistake_write_discovery_file() {
  // Ensure WP_CONTENT_DIR is defined
  if (!defined('WP_CONTENT_DIR')) {
    return;
  }

  $file_path = WP_CONTENT_DIR . '/big-mistake-discovery.json';

  try {
    $data = big_mistake_get_discovery_data_array();

    // Use wp_json_encode for proper encoding
    $json = wp_json_encode($data, JSON_PRETTY_PRINT);
    if ($json === false) {
      return;
    }

    // Attempt to write the file
    file_put_contents($file_path, $json);
  } catch (Exception $e) {
    // Fail silently in production; tests will report if discovery fails
  } catch (Error $e) {
    // Fail silently; tests will surface issues
  }
}

// Generate discovery file on admin requests after menus and submenus are built.
add_action('admin_menu', 'big_mistake_write_discovery_file', PHP_INT_MAX);

// Also try to write it on admin_init (earlier) - menus might not be fully populated yet,
// but this ensures the file exists earlier for parallel test execution
// admin_head will update it with complete data later
add_action('admin_init', function() {
  // Only write if file doesn't exist yet (to avoid race conditions)
  $file_path = WP_CONTENT_DIR . '/big-mistake-discovery.json';
  if (!file_exists($file_path)) {
    big_mistake_write_discovery_file();
  }
}, 999);

/**
 * Discover public post types
 */
function big_mistake_discover_post_types() {
  $post_types = get_post_types(array('public' => true, 'publicly_queryable' => true), 'objects');
  $excluded_types = array(
    'attachment',
    'nav_menu_item',
    'revision',
    'wp_template',
    'wp_template_part',
    'wp_global_styles',
    'wp_navigation',
    'wp_font_family',
    'wp_font_face',
  );

  $result = array();
  foreach ($post_types as $slug => $post_type) {
    if (in_array($slug, $excluded_types, true)) {
      continue;
    }

    $rest_base = $post_type->rest_base ?? $slug;
    if (!$rest_base) {
      continue;
    }

    $result[] = array(
      'slug' => $slug,
      'name' => $post_type->label ?? $slug,
      'rest_base' => $rest_base,
      'has_archive' => $post_type->has_archive ?? false,
    );
  }

  return $result;
}

/**
 * Discover published post items for each post type
 * Returns all published items with path, title, and body class
 * Tests can filter to one per type if needed
 */
function big_mistake_discover_post_items() {
  $post_types = get_post_types(array('public' => true, 'publicly_queryable' => true), 'objects');
  $excluded_types = array(
    'attachment',
    'nav_menu_item',
    'revision',
    'wp_template',
    'wp_template_part',
    'wp_global_styles',
    'wp_navigation',
    'wp_font_family',
    'wp_font_face',
  );

  $result = array();
  foreach ($post_types as $slug => $post_type) {
    if (in_array($slug, $excluded_types, true)) {
      continue;
    }

    $rest_base = $post_type->rest_base ?? $slug;
    if (!$rest_base) {
      continue;
    }

    // Get all published items of this post type
    $posts = get_posts(array(
      'post_type' => $slug,
      'post_status' => 'publish',
      'numberposts' => -1, // Get all published posts
      'orderby' => 'date',
      'order' => 'DESC',
    ));

    foreach ($posts as $post) {
      $permalink = get_permalink($post->ID);
      $url_obj = parse_url($permalink);
      $path = isset($url_obj['path']) ? $url_obj['path'] : '/' . $post->post_name . '/';
      if (isset($url_obj['query'])) {
        $path .= '?' . $url_obj['query'];
      }

      // Construct title and body class based on WordPress conventions
      $title = $post->post_title;
      $body_class = 'single single-post postid-' . $post->ID;
      if ($slug !== 'post') {
        $body_class .= ' post-type-' . $slug;
      }

      $result[] = array(
        'path' => $path,
        'title' => $title,
        'bodyClass' => $body_class,
        'type' => 'post-item',
        'postType' => $slug,
        'postTypeName' => $post_type->label ?? $slug,
        'id' => $post->ID,
        'slug' => $post->post_name,
        'description' => ($post_type->label ?? $slug) . ' (' . $slug . '): ' . $path,
      );
    }
  }

  return $result;
}

/**
 * Discover list page types (archives, categories, tags, etc.)
 * Returns a flat array with all instances, including path, title, and body class
 */
function big_mistake_discover_list_pages() {
  $list_pages = array();

  // Discover categories (all categories, not just one)
  $categories = get_categories(array('hide_empty' => false));
  if (!empty($categories)) {
    foreach ($categories as $cat) {
      $url = get_category_link($cat->term_id);
      $url_obj = parse_url($url);
      $path = isset($url_obj['path']) ? $url_obj['path'] : '/category/' . $cat->slug . '/';
      if (isset($url_obj['query'])) {
        $path .= '?' . $url_obj['query'];
      }

      // Construct title and body class based on WordPress conventions
      $title = $cat->name;
      $body_class = 'archive category category-' . $cat->slug;

      $list_pages[] = array(
        'path' => $path,
        'title' => $title,
        'bodyClass' => $body_class,
        'type' => 'category',
        'description' => 'Category archive: ' . $cat->slug,
      );
    }
  }

  // Discover tags (all tags, not just one)
  $tags = get_tags(array('hide_empty' => false));
  if (!empty($tags)) {
    foreach ($tags as $tag) {
      $url = get_tag_link($tag->term_id);
      $url_obj = parse_url($url);
      $path = isset($url_obj['path']) ? $url_obj['path'] : '/tag/' . $tag->slug . '/';
      if (isset($url_obj['query'])) {
        $path .= '?' . $url_obj['query'];
      }

      $title = $tag->name;
      $body_class = 'archive tag tag-' . $tag->slug;

      $list_pages[] = array(
        'path' => $path,
        'title' => $title,
        'bodyClass' => $body_class,
        'type' => 'tag',
        'description' => 'Tag archive: ' . $tag->slug,
      );
    }
  }

  // Discover authors (all authors with posts, not just one)
  $authors = get_users(array(
    'capability' => 'edit_posts',
    'has_published_posts' => true,
  ));
  if (!empty($authors)) {
    foreach ($authors as $author) {
      $url = get_author_posts_url($author->ID);
      $url_obj = parse_url($url);
      $path = isset($url_obj['path']) ? $url_obj['path'] : '/author/' . $author->user_nicename . '/';
      if (isset($url_obj['query'])) {
        $path .= '?' . $url_obj['query'];
      }

      $title = $author->display_name;
      $body_class = 'archive author author-' . $author->user_nicename;

      $list_pages[] = array(
        'path' => $path,
        'title' => $title,
        'bodyClass' => $body_class,
        'type' => 'author',
        'description' => 'Author archive: ' . $author->user_nicename,
      );
    }
  }

  // Discover date archives (all unique year/month combinations from published posts)
  global $wpdb;
  $date_archives = $wpdb->get_results(
    "SELECT DISTINCT YEAR(post_date) as year, MONTH(post_date) as month
     FROM {$wpdb->posts}
     WHERE post_status = 'publish' AND post_type = 'post'
     ORDER BY year DESC, month DESC"
  );
  if (!empty($date_archives)) {
    foreach ($date_archives as $archive) {
      $url = get_month_link($archive->year, $archive->month);
      $url_obj = parse_url($url);
      $path = isset($url_obj['path']) ? $url_obj['path'] : '/' . $archive->year . '/' . sprintf('%02d', $archive->month) . '/';
      if (isset($url_obj['query'])) {
        $path .= '?' . $url_obj['query'];
      }

      // Use WordPress date format
      $date_str = date_i18n('F Y', strtotime($archive->year . '-' . sprintf('%02d', $archive->month) . '-01'));
      $title = $date_str;
      $body_class = 'archive date';

      $list_pages[] = array(
        'path' => $path,
        'title' => $title,
        'bodyClass' => $body_class,
        'type' => 'date-archive',
        'description' => 'Date archive (month): ' . $date_str,
      );
    }
  }

  // Discover custom post type archives
  $post_types = get_post_types(array('public' => true, 'has_archive' => true), 'objects');
  foreach ($post_types as $slug => $post_type) {
    if (in_array($slug, array('post', 'page'), true)) {
      continue; // Skip built-in types
    }
    $archive_url = get_post_type_archive_link($slug);
    if ($archive_url) {
      $url_obj = parse_url($archive_url);
      $path = isset($url_obj['path']) ? $url_obj['path'] : '/' . $slug . '/';
      if (isset($url_obj['query'])) {
        $path .= '?' . $url_obj['query'];
      }

      $title = ($post_type->label ?? $slug);
      $body_class = 'archive post-type-archive post-type-archive-' . $slug;

      $list_pages[] = array(
        'path' => $path,
        'title' => $title,
        'bodyClass' => $body_class,
        'type' => 'custom-post-type-archive',
        'description' => 'Custom post type archive: ' . ($post_type->label ?? $slug),
      );
    }
  }

  // Search is always available
  $search_path = '/?s=test';
  $list_pages[] = array(
    'path' => $search_path,
    'title' => 'Search Results for “test”',
    'bodyClass' => 'search',
    'type' => 'search',
    'description' => 'Search results',
  );

  return $list_pages;
}

/**
 * Discover admin menu items (top-level)
 * Note: Admin menu is only available in admin context, so we use a simpler approach
 * by checking common admin pages directly
 */
function big_mistake_discover_admin_menu_items() {
  // Set current user to admin for capability checks
  $admin_user = get_user_by('login', 'admin');
  if ($admin_user) {
    wp_set_current_user($admin_user->ID);
  } else {
    $admins = get_users(array('role' => 'administrator', 'number' => 1));
    if (!empty($admins)) {
      wp_set_current_user($admins[0]->ID);
    }
  }

  // Common admin menu items that are always available
  // We'll check if the user has access to each
  $common_menu_items = array(
    array('slug' => 'index.php', 'title' => 'Dashboard', 'cap' => 'read'),
    array('slug' => 'edit.php', 'title' => 'Posts', 'cap' => 'edit_posts'),
    array('slug' => 'upload.php', 'title' => 'Media', 'cap' => 'upload_files'),
    array('slug' => 'edit.php?post_type=page', 'title' => 'Pages', 'cap' => 'edit_pages'),
    array('slug' => 'edit-comments.php', 'title' => 'Comments', 'cap' => 'moderate_comments'),
    array('slug' => 'themes.php', 'title' => 'Appearance', 'cap' => 'switch_themes'),
    array('slug' => 'plugins.php', 'title' => 'Plugins', 'cap' => 'activate_plugins'),
    array('slug' => 'users.php', 'title' => 'Users', 'cap' => 'list_users'),
    array('slug' => 'tools.php', 'title' => 'Tools', 'cap' => 'manage_options'),
    array('slug' => 'options-general.php', 'title' => 'Settings', 'cap' => 'manage_options'),
  );

  $menu_items = array();

  foreach ($common_menu_items as $item) {
    // Check if current user has the required capability
    if (current_user_can($item['cap'])) {
      $menu_items[] = array(
        'slug' => $item['slug'],
        'title' => $item['title'],
        'url' => admin_url($item['slug']),
      );
    }
  }

  return $menu_items;
}

/**
 * Discover admin submenu items for all top-level menus.
 * Uses the global $submenu structure built by WordPress.
 *
 * @return array Array of submenu item arrays with parent, slug, title, and url.
 */
function big_mistake_discover_admin_submenu_items() {
  $submenu_items = array();

  if (!is_admin()) {
    return $submenu_items;
  }

  global $submenu;

  if (!is_array($submenu)) {
    return $submenu_items;
  }

  // Deprecated taxonomies/features that should be excluded
  // link_category is from the deprecated Links feature (removed in WP 5.0)
  $deprecated_patterns = array(
    'link_category', // Deprecated Links feature taxonomy
  );

  foreach ($submenu as $parent_slug => $items) {
    if (!is_array($items)) {
      continue;
    }

    foreach ($items as $item) {
      // $submenu structure: [0] => title, [1] => capability, [2] => menu_slug
      if (!is_array($item) || count($item) < 3) {
        continue;
      }

      $menu_slug  = $item[2];
      $menu_title = $item[0];

      // Skip deprecated taxonomies/features
      $is_deprecated = false;
      foreach ($deprecated_patterns as $pattern) {
        if (strpos($menu_slug, $pattern) !== false) {
          $is_deprecated = true;
          break;
        }
      }
      if ($is_deprecated) {
        continue;
      }

      // Extract title text (may contain HTML)
      $title_text = wp_strip_all_tags($menu_title);
      $admin_url  = admin_url($menu_slug);

      $submenu_items[] = array(
        'parent' => $parent_slug,
        'slug'   => $menu_slug,
        'title'  => $title_text,
        'url'    => $admin_url,
      );
    }
  }

  return $submenu_items;
}

/**
 * Shutdown handler to log PHP fatal errors to debug.log
 * This catches fatal errors that occur after WordPress has loaded
 */
function big_mistake_shutdown_handler() {
  $error = error_get_last();

  // Only log fatal errors (E_ERROR, E_CORE_ERROR, E_COMPILE_ERROR, E_PARSE, E_RECOVERABLE_ERROR)
  if ($error !== null && ($error['type'] & (E_ERROR | E_CORE_ERROR | E_COMPILE_ERROR | E_PARSE | E_RECOVERABLE_ERROR))) {
    $error_type = 'Unknown';
    switch ($error['type']) {
      case E_ERROR:
        $error_type = 'E_ERROR';
        break;
      case E_CORE_ERROR:
        $error_type = 'E_CORE_ERROR';
        break;
      case E_COMPILE_ERROR:
        $error_type = 'E_COMPILE_ERROR';
        break;
      case E_PARSE:
        $error_type = 'E_PARSE';
        break;
      case E_RECOVERABLE_ERROR:
        $error_type = 'E_RECOVERABLE_ERROR';
        break;
    }

    // WordPress's error_log() already adds a timestamp, so we don't include one here
    $message = sprintf(
      'PHP Fatal error (%s): %s in %s on line %d',
      $error_type,
      $error['message'],
      $error['file'],
      $error['line']
    );

    error_log($message);
  }
}
// Register shutdown handler to catch fatal errors
register_shutdown_function('big_mistake_shutdown_handler');



