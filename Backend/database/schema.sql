-- UltraDownloader idempotent schema (DDL only, no seed data, no DROP).
-- Used by Backend/src/db/database.js when AUTO_IMPORT_SQL=1.
CREATE TABLE IF NOT EXISTS `websites` (
  `id` VARCHAR(64) PRIMARY KEY,
  `name` VARCHAR(191) NOT NULL,
  `domain` VARCHAR(191) NOT NULL,
  `content_mode` VARCHAR(64) NOT NULL DEFAULT 'clean_mainstream',
  `status` VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  `monthly_revenue` DOUBLE NOT NULL DEFAULT 0,
  `monthly_expense` DOUBLE NOT NULL DEFAULT 0,
  `seo_score` INT NOT NULL DEFAULT 100,
  `created_at` VARCHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS `admin_users` (
  `id` VARCHAR(64) PRIMARY KEY,
  `username` VARCHAR(100) NOT NULL UNIQUE,
  `email` VARCHAR(191) NOT NULL UNIQUE,
  `full_name` VARCHAR(191) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `pin_hash` VARCHAR(255) NOT NULL,
  `totp_secret` VARCHAR(128) NOT NULL,
  `role` VARCHAR(64) NOT NULL DEFAULT 'super_admin',
  `last_login_at` VARCHAR(64) NULL,
  `created_at` VARCHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS `ip_lockouts` (
  `ip_address` VARCHAR(64) PRIMARY KEY,
  `failed_attempts` INT NOT NULL DEFAULT 0,
  `banned_until` VARCHAR(64) NULL,
  `updated_at` VARCHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(64) PRIMARY KEY,
  `full_name` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `daily_quota` INT NOT NULL DEFAULT 500,
  `created_at` VARCHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS `user_favorites` (
  `id` VARCHAR(64) PRIMARY KEY,
  `user_id` VARCHAR(64) NOT NULL,
  `video_url` TEXT NOT NULL,
  `title` VARCHAR(500) NOT NULL,
  `thumbnail_url` TEXT NOT NULL,
  `platform_id` VARCHAR(64) NOT NULL,
  `duration_text` VARCHAR(64) NOT NULL,
  `created_at` VARCHAR(64) NOT NULL,
  INDEX `idx_fav_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS `platforms` (
  `id` VARCHAR(64) PRIMARY KEY,
  `display_name` VARCHAR(191) NOT NULL,
  `subtitle` VARCHAR(255) NOT NULL,
  `category` VARCHAR(64) NOT NULL,
  `accent_color` VARCHAR(32) NOT NULL,
  `icon_key` VARCHAR(64) NOT NULL,
  `icon_svg` LONGTEXT NULL,
  `domains_json` LONGTEXT NOT NULL,
  `example_url` VARCHAR(500) NOT NULL,
  `seo_slug` VARCHAR(191) NOT NULL,
  `is_adult` TINYINT(1) NOT NULL DEFAULT 0,
  `supports_search` TINYINT(1) NOT NULL DEFAULT 0,
  `supports_online_player` TINYINT(1) NOT NULL DEFAULT 1,
  `supports_download` TINYINT(1) NOT NULL DEFAULT 1,
  `supports_resume` TINYINT(1) NOT NULL DEFAULT 1,
  `is_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `health_status` VARCHAR(32) NOT NULL DEFAULT 'operational',
  `known_limitations` TEXT NOT NULL,
  `created_at` VARCHAR(64) NOT NULL,
  INDEX `idx_platforms_cat_enabled` (`category`, `is_enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS `ad_waterfall_zones` (
  `zone_key` VARCHAR(64) PRIMARY KEY,
  `enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `cooldown_minutes` INT NOT NULL DEFAULT 20,
  `config_json` LONGTEXT NOT NULL,
  `updated_at` VARCHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS `system_settings` (
  `setting_key` VARCHAR(64) PRIMARY KEY,
  `setting_json` LONGTEXT NOT NULL,
  `updated_at` VARCHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS `saved_vault_videos` (
  `id` VARCHAR(64) PRIMARY KEY,
  `website_id` VARCHAR(64) NOT NULL,
  `title` VARCHAR(500) NOT NULL,
  `source_url` TEXT NOT NULL,
  `stream_url` TEXT NOT NULL,
  `local_file_path` TEXT NULL,
  `thumbnail_url` TEXT NOT NULL,
  `platform_id` VARCHAR(64) NOT NULL,
  `platform_json` LONGTEXT NOT NULL,
  `category` VARCHAR(64) NOT NULL,
  `duration_text` VARCHAR(64) NOT NULL,
  `resolution_label` VARCHAR(64) NOT NULL,
  `file_size_bytes` BIGINT NOT NULL DEFAULT 0,
  `file_present_on_disk` TINYINT(1) NOT NULL DEFAULT 1,
  `is_pinned` TINYINT(1) NOT NULL DEFAULT 0,
  `is_adult` TINYINT(1) NOT NULL DEFAULT 0,
  `admin_notes` TEXT NULL,
  `saved_at` VARCHAR(64) NOT NULL,
  INDEX `idx_vault_site_saved` (`website_id`, `saved_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS `finance_ledger` (
  `id` VARCHAR(64) PRIMARY KEY,
  `website_id` VARCHAR(64) NOT NULL,
  `website_label` VARCHAR(191) NOT NULL,
  `entry_type` VARCHAR(32) NOT NULL,
  `category` VARCHAR(191) NOT NULL,
  `amount` DOUBLE NOT NULL,
  `status` VARCHAR(64) NOT NULL DEFAULT 'RECORDED',
  `entry_date` VARCHAR(32) NOT NULL,
  `notes` TEXT NULL,
  `created_at` VARCHAR(64) NOT NULL,
  INDEX `idx_ledger_site_date` (`website_id`, `entry_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS `seo_keywords` (
  `id` VARCHAR(64) PRIMARY KEY,
  `keyword` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(191) NOT NULL UNIQUE,
  `impressions` INT NOT NULL DEFAULT 0,
  `clicks` INT NOT NULL DEFAULT 0,
  `created_at` VARCHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS `encrypted_cookies` (
  `id` VARCHAR(64) PRIMARY KEY,
  `platform_label` VARCHAR(191) NOT NULL,
  `platform_id` VARCHAR(64) NOT NULL,
  `iv_hex` VARCHAR(64) NOT NULL,
  `auth_tag_hex` VARCHAR(64) NOT NULL,
  `ciphertext_hex` LONGTEXT NOT NULL,
  `masked_preview` VARCHAR(191) NOT NULL,
  `status` VARCHAR(64) NOT NULL DEFAULT 'Active',
  `updated_at` VARCHAR(64) NOT NULL,
  INDEX `idx_cookie_platform` (`platform_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS `download_jobs` (
  `id` VARCHAR(64) PRIMARY KEY,
  `requester_ip` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) NULL,
  `title` VARCHAR(512) NOT NULL,
  `file_name` VARCHAR(512) NOT NULL,
  `source_url` TEXT NOT NULL,
  `format_selector` TEXT NOT NULL,
  `stream_url` TEXT NULL,
  `local_output_path` TEXT NULL,
  `thumbnail_url` TEXT NULL,
  `platform_id` VARCHAR(64) NOT NULL,
  `quality_label` VARCHAR(64) NOT NULL,
  `format_ext` VARCHAR(16) NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `progress_pct` DOUBLE NOT NULL DEFAULT 0,
  `bytes_downloaded` BIGINT NOT NULL DEFAULT 0,
  `total_bytes` BIGINT NOT NULL DEFAULT 0,
  `speed_bps` BIGINT NOT NULL DEFAULT 0,
  `eta_seconds` INT NOT NULL DEFAULT 0,
  `error_message` TEXT NULL,
  `created_at` VARCHAR(64) NOT NULL,
  INDEX `idx_dl_ip_created` (`requester_ip`, `created_at`),
  INDEX `idx_dl_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS `share_links` (
  `short_code` VARCHAR(32) PRIMARY KEY,
  `source_url` TEXT NOT NULL,
  `title` VARCHAR(500) NOT NULL,
  `platform_id` VARCHAR(64) NOT NULL,
  `thumbnail_url` TEXT NULL,
  `duration_text` VARCHAR(64) NULL,
  `stream_url` TEXT NOT NULL,
  `views` INT NOT NULL DEFAULT 0,
  `created_at` VARCHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS `analytics_events` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `website_id` VARCHAR(64) NOT NULL,
  `event_name` VARCHAR(64) NOT NULL,
  `platform_id` VARCHAR(64) NULL,
  `meta_json` LONGTEXT NULL,
  `created_at` VARCHAR(64) NOT NULL,
  INDEX `idx_events_web_event` (`website_id`, `event_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS `security_audit_logs` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `event_type` VARCHAR(64) NOT NULL,
  `ip_address` VARCHAR(64) NOT NULL,
  `user_agent` VARCHAR(255) NULL,
  `details_text` VARCHAR(500) NULL,
  `created_at` VARCHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
