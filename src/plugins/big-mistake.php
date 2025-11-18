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
 * Hard-block requests to api.wordpress.org to avoid slow update checks entirely
 */
function big_mistake_block_api_wordpress_org($preempt, $args, $url) {
  $host = parse_url($url, PHP_URL_HOST);
  if ($host && preg_match('/(^|\\.)api\\.wordpress\\.org$/i', $host)) {
    return new WP_Error('blocked_api_wordpress_org', 'Blocked api.wordpress.org during tests');
  }
  return $preempt;
}

add_filter('pre_http_request', 'big_mistake_block_api_wordpress_org', 999, 3);

/**
 * Register REST API endpoint for test discovery data
 * Provides post types, list pages, and admin menu items for E2E testing
 */
function big_mistake_register_discovery_endpoint() {
  register_rest_route('big-mistake/v1', '/discovery', array(
    'methods' => 'GET',
    'callback' => 'big_mistake_get_discovery_data',
    'permission_callback' => '__return_true', // Public endpoint for testing
  ));
}
add_action('rest_api_init', 'big_mistake_register_discovery_endpoint');

/**
 * Get all discovery data for E2E tests
 */
function big_mistake_get_discovery_data() {
  $data = array(
    'postTypes' => big_mistake_discover_post_types(),
    'listPages' => big_mistake_discover_list_pages(),
    'adminMenuItems' => big_mistake_discover_admin_menu_items(),
  );

  return new WP_REST_Response($data, 200);
}

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

  // Discover authors
  $authors = get_users(array('who' => 'authors', 'number' => 1));
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
    $post_date = get_post_time('Y-m-d', false, $recent_post[0]);
    if ($post_date) {
      $year = date('Y', strtotime($post_date));
      $month = date('m', strtotime($post_date));
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
 * Discover admin menu items
 */
function big_mistake_discover_admin_menu_items() {
  global $menu, $submenu;

  // Ensure we're in admin context
  if (!defined('WP_ADMIN')) {
    define('WP_ADMIN', true);
  }

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

  // Initialize menu arrays
  $menu = array();
  $submenu = array();

  // Load admin menu
  require_once ABSPATH . 'wp-admin/includes/menu.php';

  // Trigger admin menu hooks
  do_action('admin_menu');
  do_action('admin_init');

  $menu_items = array();

  if (is_array($menu) && !empty($menu)) {
    foreach ($menu as $item) {
      if (!is_array($item) || count($item) < 3) {
        continue;
      }

      $menu_slug = $item[2];
      $menu_title = $item[0];

      // Skip separators
      if (empty($menu_slug) || $menu_slug === 'separator' || strpos($menu_slug, 'separator') !== false) {
        continue;
      }

      // Extract title text (may contain HTML)
      $title_text = wp_strip_all_tags($menu_title);

      // Build admin URL
      $admin_url = admin_url($menu_slug);

      $menu_items[] = array(
        'slug' => $menu_slug,
        'title' => $title_text,
        'url' => $admin_url,
      );
    }
  }

  return $menu_items;
}


