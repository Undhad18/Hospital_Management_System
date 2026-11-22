-- Migration: 005_module6_appointment_scheduling.sql
-- Purpose: Schema for Module 6 Appointment Booking, Doctor Schedules, Follow-ups, and Queue Management

-- 1. Modify appointments status enum to support all 8 lifecycle statuses
ALTER TABLE appointments
    MODIFY COLUMN status ENUM('pending', 'confirmed', 'rejected', 'in_waiting', 'in_progress', 'completed', 'cancelled', 'admitted') NOT NULL DEFAULT 'pending';

-- 2. Add scheduling, lifecycle and triage columns to appointments table
SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'appointment_type'
);
SET @sql_cmd = IF(@col_exists = 0,
    "ALTER TABLE appointments ADD COLUMN appointment_type ENUM('routine_checkup', 'consultation', 'follow_up', 'emergency') NOT NULL DEFAULT 'consultation' AFTER appointment_time",
    "SELECT 1"
);
PREPARE stmt FROM @sql_cmd; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'appointment_mode'
);
SET @sql_cmd = IF(@col_exists = 0,
    "ALTER TABLE appointments ADD COLUMN appointment_mode ENUM('in_person', 'video_consultation') NOT NULL DEFAULT 'in_person' AFTER appointment_type",
    "SELECT 1"
);
PREPARE stmt FROM @sql_cmd; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'start_time'
);
SET @sql_cmd = IF(@col_exists = 0,
    "ALTER TABLE appointments ADD COLUMN start_time TIME NULL AFTER appointment_mode, ADD COLUMN end_time TIME NULL AFTER start_time",
    "SELECT 1"
);
PREPARE stmt FROM @sql_cmd; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'follow_up_to_id'
);
SET @sql_cmd = IF(@col_exists = 0,
    "ALTER TABLE appointments ADD COLUMN follow_up_to_id BIGINT UNSIGNED NULL AFTER bill_id, ADD CONSTRAINT fk_appointment_follow_up FOREIGN KEY (follow_up_to_id) REFERENCES appointments(id) ON DELETE SET NULL",
    "SELECT 1"
);
PREPARE stmt FROM @sql_cmd; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'queue_number'
);
SET @sql_cmd = IF(@col_exists = 0,
    "ALTER TABLE appointments ADD COLUMN queue_number VARCHAR(20) NULL AFTER follow_up_to_id",
    "SELECT 1"
);
PREPARE stmt FROM @sql_cmd; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'check_in_time'
);
SET @sql_cmd = IF(@col_exists = 0,
    "ALTER TABLE appointments ADD COLUMN check_in_time DATETIME NULL AFTER queue_number, ADD COLUMN checked_in_by BIGINT UNSIGNED NULL AFTER check_in_time, ADD CONSTRAINT fk_appointment_checked_in_by FOREIGN KEY (checked_in_by) REFERENCES users(id) ON DELETE SET NULL",
    "SELECT 1"
);
PREPARE stmt FROM @sql_cmd; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'rejection_reason'
);
SET @sql_cmd = IF(@col_exists = 0,
    "ALTER TABLE appointments ADD COLUMN rejection_reason VARCHAR(255) NULL AFTER checked_in_by",
    "SELECT 1"
);
PREPARE stmt FROM @sql_cmd; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'cancellation_reason'
);
SET @sql_cmd = IF(@col_exists = 0,
    "ALTER TABLE appointments ADD COLUMN cancellation_reason VARCHAR(255) NULL AFTER rejection_reason, ADD COLUMN cancelled_by BIGINT UNSIGNED NULL AFTER cancellation_reason, ADD CONSTRAINT fk_appointment_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL",
    "SELECT 1"
);
PREPARE stmt FROM @sql_cmd; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'status_changed_by'
);
SET @sql_cmd = IF(@col_exists = 0,
    "ALTER TABLE appointments ADD COLUMN status_changed_by BIGINT UNSIGNED NULL AFTER cancelled_by, ADD CONSTRAINT fk_appointment_status_changed_by FOREIGN KEY (status_changed_by) REFERENCES users(id) ON DELETE SET NULL",
    "SELECT 1"
);
PREPARE stmt FROM @sql_cmd; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'booked_by_staff_id'
);
SET @sql_cmd = IF(@col_exists = 0,
    "ALTER TABLE appointments ADD COLUMN booked_by_staff_id BIGINT UNSIGNED NULL AFTER status_changed_by, ADD CONSTRAINT fk_appointment_booked_by_staff FOREIGN KEY (booked_by_staff_id) REFERENCES users(id) ON DELETE SET NULL",
    "SELECT 1"
);
PREPARE stmt FROM @sql_cmd; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Create doctor_schedules table (Lesson 6.2)
CREATE TABLE IF NOT EXISTS doctor_schedules (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    doctor_id BIGINT UNSIGNED NOT NULL,
    hospital_id BIGINT UNSIGNED NOT NULL,
    day_of_week ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday') NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    slot_duration_minutes INT UNSIGNED NOT NULL DEFAULT 30,
    break_start TIME NULL,
    break_end TIME NULL,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_schedule_doctor FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_schedule_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE,
    UNIQUE KEY uq_doctor_day (doctor_id, day_of_week),
    INDEX idx_schedule_doctor (doctor_id),
    INDEX idx_schedule_hospital (hospital_id)
);

-- 4. Create doctor_leaves table (Lesson 6.2)
CREATE TABLE IF NOT EXISTS doctor_leaves (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    doctor_id BIGINT UNSIGNED NOT NULL,
    leave_date DATE NOT NULL,
    reason VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_leave_doctor FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_doctor_leave (doctor_id, leave_date),
    INDEX idx_leave_doctor_date (doctor_id, leave_date)
);
