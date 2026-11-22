-- ============================================================================
-- Migration 012: Module 13 Prescription Management
-- ============================================================================

USE hospital_management;

-- 1. Extend prescriptions table with status and indexes
ALTER TABLE prescriptions
    ADD COLUMN IF NOT EXISTS status ENUM('draft', 'active', 'partially_dispensed', 'dispensed', 'cancelled') NOT NULL DEFAULT 'active' AFTER general_instructions;

-- Backfill status for existing prescriptions
UPDATE prescriptions p
JOIN consultations c ON c.id = p.consultation_id
SET p.status = CASE
    WHEN c.status = 'draft' THEN 'draft'
    ELSE 'active'
END
WHERE p.status IS NULL OR p.status = '';

-- Backfill 'dispensed' for any prescriptions already having dispensations recorded
UPDATE prescriptions p
JOIN pharmacy_dispensations pd ON pd.prescription_id = p.id
SET p.status = 'dispensed'
WHERE p.status = 'active';

-- Add performance indexes if they don't exist
SET @exist_idx_rx_hosp_status := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'prescriptions' AND INDEX_NAME = 'idx_rx_hosp_status'
);
SET @sql_idx_rx_hosp_status := IF(@exist_idx_rx_hosp_status = 0, 'CREATE INDEX idx_rx_hosp_status ON prescriptions (hospital_id, status)', 'SELECT 1');
PREPARE stmt FROM @sql_idx_rx_hosp_status;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exist_idx_rx_date := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'prescriptions' AND INDEX_NAME = 'idx_rx_date'
);
SET @sql_idx_rx_date := IF(@exist_idx_rx_date = 0, 'CREATE INDEX idx_rx_date ON prescriptions (created_at)', 'SELECT 1');
PREPARE stmt FROM @sql_idx_rx_date;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exist_idx_rx_patient_status := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'prescriptions' AND INDEX_NAME = 'idx_rx_patient_status'
);
SET @sql_idx_rx_patient_status := IF(@exist_idx_rx_patient_status = 0, 'CREATE INDEX idx_rx_patient_status ON prescriptions (patient_id, status)', 'SELECT 1');
PREPARE stmt FROM @sql_idx_rx_patient_status;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Extend prescription_items table with medicine_id and dispensed_quantity
ALTER TABLE prescription_items
    ADD COLUMN IF NOT EXISTS medicine_id BIGINT UNSIGNED NULL AFTER prescription_id,
    ADD COLUMN IF NOT EXISTS dispensed_quantity INT UNSIGNED NOT NULL DEFAULT 0 AFTER quantity;

-- Backfill medicine_id on prescription_items by matching name against master_medicines
UPDATE prescription_items pi
JOIN master_medicines m ON LOWER(TRIM(m.name)) = LOWER(TRIM(pi.medicine_name))
SET pi.medicine_id = m.id
WHERE pi.medicine_id IS NULL;

-- Backfill dispensed_quantity for existing dispensed prescriptions
UPDATE prescription_items pi
JOIN prescriptions p ON p.id = pi.prescription_id
SET pi.dispensed_quantity = COALESCE(pi.quantity, 0)
WHERE p.status = 'dispensed';

-- Add foreign key constraint for medicine_id if not present
SET @exist_fk_rx_item_med := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'prescription_items' AND CONSTRAINT_NAME = 'fk_rx_item_med'
);
SET @sql_fk_rx_item_med := IF(@exist_fk_rx_item_med = 0, 'ALTER TABLE prescription_items ADD CONSTRAINT fk_rx_item_med FOREIGN KEY (medicine_id) REFERENCES master_medicines(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE stmt FROM @sql_fk_rx_item_med;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. Extend pharmacy_dispensation_items with prescription_item_id
ALTER TABLE pharmacy_dispensation_items
    ADD COLUMN IF NOT EXISTS prescription_item_id BIGINT UNSIGNED NULL AFTER dispensation_id;

SET @exist_fk_pdi_rx_item := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pharmacy_dispensation_items' AND CONSTRAINT_NAME = 'fk_pdi_rx_item'
);
SET @sql_fk_pdi_rx_item := IF(@exist_fk_pdi_rx_item = 0, 'ALTER TABLE pharmacy_dispensation_items ADD CONSTRAINT fk_pdi_rx_item FOREIGN KEY (prescription_item_id) REFERENCES prescription_items(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE stmt FROM @sql_fk_pdi_rx_item;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4. Prescription Status History Table
CREATE TABLE IF NOT EXISTS prescription_status_history (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    prescription_id BIGINT UNSIGNED NOT NULL,
    from_status VARCHAR(50) NULL,
    to_status VARCHAR(50) NOT NULL,
    changed_by BIGINT UNSIGNED NOT NULL,
    reason VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_psh_prescription
        FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON DELETE CASCADE,
    CONSTRAINT fk_psh_changed_by
        FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE RESTRICT,

    INDEX idx_psh_prescription (prescription_id),
    INDEX idx_psh_date (created_at)
);
