-- Migration: 006_module7_notifications_emails.sql
-- Purpose: Schema for Module 7 Notifications, Outbox Logs, and Email Automation

-- 1. Create notifications table for outbox queue and delivery audit tracking
CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    recipient_email VARCHAR(190) NOT NULL,
    recipient_user_id BIGINT UNSIGNED NULL,
    hospital_id BIGINT UNSIGNED NULL,
    appointment_id BIGINT UNSIGNED NULL,
    notification_type VARCHAR(60) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    body_text TEXT NOT NULL,
    body_html MEDIUMTEXT NULL,
    status ENUM('pending', 'processing', 'sent', 'failed') NOT NULL DEFAULT 'pending',
    attempts INT UNSIGNED NOT NULL DEFAULT 0,
    max_attempts INT UNSIGNED NOT NULL DEFAULT 3,
    last_attempt_at DATETIME NULL,
    sent_at DATETIME NULL,
    failed_at DATETIME NULL,
    next_retry_at DATETIME NULL,
    provider_message_id VARCHAR(120) NULL,
    error_message VARCHAR(500) NULL,
    idempotency_key VARCHAR(190) UNIQUE NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_notification_user FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_notification_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE SET NULL,
    CONSTRAINT fk_notification_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
    INDEX idx_status_retry (status, next_retry_at),
    INDEX idx_recipient_email (recipient_email),
    INDEX idx_notification_appointment (appointment_id),
    INDEX idx_notification_hospital (hospital_id),
    INDEX idx_created_at (created_at)
);

-- 2. Add reminder_sent_at column to appointments table if not exists
SET @col_reminder_sent = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'appointments'
      AND COLUMN_NAME = 'reminder_sent_at'
);

SET @sql_reminder_sent = IF(
    @col_reminder_sent = 0,
    'ALTER TABLE appointments ADD COLUMN reminder_sent_at DATETIME NULL AFTER status_changed_by',
    'SELECT "Column reminder_sent_at already exists"'
);
PREPARE stmt_reminder FROM @sql_reminder_sent;
EXECUTE stmt_reminder;
DEALLOCATE PREPARE stmt_reminder;
