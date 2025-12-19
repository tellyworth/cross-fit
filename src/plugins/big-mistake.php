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
        non_existent_function();
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
}

add_action('init', 'big_mistake_disable_update_checks', 1);

/**
 * Disable WordPress Heartbeat API to reduce server load
 * The Heartbeat API can cause slow admin pages in resource-constrained environments
 */
function big_mistake_disable_heartbeat() {
  wp_deregister_script('heartbeat');
}

add_action('init', 'big_mistake_disable_heartbeat', 1);

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
function big_mistake_get_discovery_data_array() {
  return array(
    'postTypes'        => big_mistake_discover_post_types(),
    'listPages'        => big_mistake_discover_list_pages(),
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
 * Discover list page types (archives, categories, tags, etc.)
 */
function big_mistake_discover_list_pages() {
  $list_pages = array(
    'categories' => array(),
    'tags' => array(),
    'authors' => array(),
    'dateArchives' => array(),
    'customPostTypeArchives' => array(),
    'search' => null,
  );

  // Discover categories
  $categories = get_categories(array('hide_empty' => false, 'number' => 1));
  if (!empty($categories)) {
    foreach ($categories as $cat) {
      $list_pages['categories'][] = array(
        'id' => $cat->term_id,
        'slug' => $cat->slug,
        'url' => get_category_link($cat->term_id),
      );
    }
  }

  // Discover tags
  $tags = get_tags(array('hide_empty' => false, 'number' => 1));
  if (!empty($tags)) {
    foreach ($tags as $tag) {
      $list_pages['tags'][] = array(
        'id' => $tag->term_id,
        'slug' => $tag->slug,
        'url' => get_tag_link($tag->term_id),
      );
    }
  }

  // Discover authors (avoid deprecated 'who' parameter; use capability instead)
  $authors = get_users(array(
    'capability' => 'edit_posts',
    'number' => 1,
  ));
  if (!empty($authors)) {
    foreach ($authors as $author) {
      $list_pages['authors'][] = array(
        'id' => $author->ID,
        'slug' => $author->user_nicename,
        'url' => get_author_posts_url($author->ID),
      );
    }
  }

  // Discover date archives (from most recent post)
  $recent_post = get_posts(array('numberposts' => 1, 'post_status' => 'publish'));
  if (!empty($recent_post)) {
    // Use get_post_time() directly with format strings to respect WordPress timezone settings
    // Second parameter false = use site timezone (not GMT)
    $year = get_post_time('Y', false, $recent_post[0]);
    $month = get_post_time('m', false, $recent_post[0]);
    if ($year && $month) {
      $list_pages['dateArchives'][] = array(
        'year' => $year,
        'month' => $month,
        'url' => get_month_link($year, $month),
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
      $list_pages['customPostTypeArchives'][] = array(
        'slug' => $slug,
        'name' => $post_type->label ?? $slug,
        'url' => $archive_url,
      );
    }
  }

  // Search is always available
  $list_pages['search'] = array(
    'url' => home_url('/?s=test'),
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

    $message = sprintf(
      '[%s] PHP Fatal error (%s): %s in %s on line %d',
      date('Y-m-d H:i:s'),
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



