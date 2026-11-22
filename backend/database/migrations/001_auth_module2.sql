-- Migration: 001_auth_module2.sql
-- Purpose: Add backward-compatible fields and tables for Module 2 Authentication & Access Control

-- 1. Add must_change_password and token_version to users if they do not exist
SET @col_must_change = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'must_change_password'
);

SET @sql_must_change = IF(
    @col_must_change = 0,
    'ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE AFTER status',
    'SELECT "Column must_change_password already exists"'
);
PREPARE stmt FROM @sql_must_change;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_token_version = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'token_version'
);

SET @sql_token_version = IF(
    @col_token_version = 0,
    'ALTER TABLE users ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER must_change_password',
    'SELECT "Column token_version already exists"'
);
PREPARE stmt FROM @sql_token_version;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Create otp_verifications table for OTP and password reset tokens
CREATE TABLE IF NOT EXISTS otp_verifications (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(190) NOT NULL,
    purpose ENUM('registration', 'password_reset') NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    attempts INT UNSIGNED NOT NULL DEFAULT 0,
    max_attempts INT UNSIGNED NOT NULL DEFAULT 5,
    consumed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email_purpose (email, purpose),
    INDEX idx_expires_consumed (expires_at, consumed)
);

-- 3. Create audit_logs table for administrative tracking
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    actor_id BIGINT UNSIGNED NULL,
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id BIGINT UNSIGNED NULL,
    details JSON NULL,
    ip_address VARCHAR(45) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_actor (actor_id),
    INDEX idx_action (action),
    INDEX idx_target (target_type, target_id)
);
