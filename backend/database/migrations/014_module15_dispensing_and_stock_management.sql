-- ============================================================================
-- Migration 014: Module 15 Medicine Dispensing and Stock Management
-- ============================================================================

USE hospital_management;

-- 1. Extend pharmacy_dispensations table with bill_id and idempotency_key
ALTER TABLE pharmacy_dispensations
    ADD COLUMN IF NOT EXISTS bill_id BIGINT UNSIGNED NULL AFTER prescription_id,
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100) NULL AFTER notes;

-- Add index and foreign key for bill_id if not present
SET @exist_fk_disp_bill := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pharmacy_dispensations' AND CONSTRAINT_NAME = 'fk_disp_bill'
);
SET @sql_fk_disp_bill := IF(@exist_fk_disp_bill = 0,
    'ALTER TABLE pharmacy_dispensations ADD CONSTRAINT fk_disp_bill FOREIGN KEY (bill_id) REFERENCES pharmacy_bills(id) ON DELETE SET NULL',
    'SELECT 1'
);
PREPARE stmt FROM @sql_fk_disp_bill;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add unique constraint for idempotency_key if not present
SET @exist_uq_disp_idempotency := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pharmacy_dispensations' AND INDEX_NAME = 'uq_disp_idempotency'
);
SET @sql_uq_disp_idempotency := IF(@exist_uq_disp_idempotency = 0,
    'CREATE UNIQUE INDEX uq_disp_idempotency ON pharmacy_dispensations (idempotency_key)',
    'SELECT 1'
);
PREPARE stmt FROM @sql_uq_disp_idempotency;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add index on bill_id for fast bill-to-dispensation lookup
SET @exist_idx_disp_bill := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pharmacy_dispensations' AND INDEX_NAME = 'idx_disp_bill'
);
SET @sql_idx_disp_bill := IF(@exist_idx_disp_bill = 0,
    'CREATE INDEX idx_disp_bill ON pharmacy_dispensations (bill_id)',
    'SELECT 1'
);
PREPARE stmt FROM @sql_idx_disp_bill;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

