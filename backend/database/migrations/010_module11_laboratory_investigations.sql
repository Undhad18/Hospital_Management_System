-- ============================================================================
-- Migration 010: Module 11 Laboratory and Investigation Management
-- ============================================================================

USE hospital_management;

-- 1. Extend master_lab_tests table
ALTER TABLE master_lab_tests
    ADD COLUMN IF NOT EXISTS test_code VARCHAR(50) NULL AFTER id,
    ADD COLUMN IF NOT EXISTS description TEXT NULL AFTER sample_type,
    ADD COLUMN IF NOT EXISTS instructions TEXT NULL AFTER description,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

-- Backfill existing test codes if null
UPDATE master_lab_tests SET test_code = 'CBC-001' WHERE id = 1 AND (test_code IS NULL OR test_code = '');
UPDATE master_lab_tests SET test_code = 'FBS-002' WHERE id = 2 AND (test_code IS NULL OR test_code = '');
UPDATE master_lab_tests SET test_code = 'PPBS-003' WHERE id = 3 AND (test_code IS NULL OR test_code = '');
UPDATE master_lab_tests SET test_code = 'HBA1C-004' WHERE id = 4 AND (test_code IS NULL OR test_code = '');
UPDATE master_lab_tests SET test_code = 'LIPID-005' WHERE id = 5 AND (test_code IS NULL OR test_code = '');
UPDATE master_lab_tests SET test_code = 'LFT-006' WHERE id = 6 AND (test_code IS NULL OR test_code = '');
UPDATE master_lab_tests SET test_code = 'KFT-007' WHERE id = 7 AND (test_code IS NULL OR test_code = '');
UPDATE master_lab_tests SET test_code = 'TSH-008' WHERE id = 8 AND (test_code IS NULL OR test_code = '');
UPDATE master_lab_tests SET test_code = 'URINE-009' WHERE id = 9 AND (test_code IS NULL OR test_code = '');
UPDATE master_lab_tests SET test_code = 'ELYTE-010' WHERE id = 10 AND (test_code IS NULL OR test_code = '');
UPDATE master_lab_tests SET test_code = 'CXR-011' WHERE id = 11 AND (test_code IS NULL OR test_code = '');
UPDATE master_lab_tests SET test_code = 'ECG-012' WHERE id = 12 AND (test_code IS NULL OR test_code = '');
UPDATE master_lab_tests SET test_code = 'USG-013' WHERE id = 13 AND (test_code IS NULL OR test_code = '');
UPDATE master_lab_tests SET test_code = 'TROP-014' WHERE id = 14 AND (test_code IS NULL OR test_code = '');
UPDATE master_lab_tests SET test_code = 'URIC-015' WHERE id = 15 AND (test_code IS NULL OR test_code = '');

-- Fill any other rows with a fallback unique code
UPDATE master_lab_tests
SET test_code = CONCAT('TEST-', LPAD(id, 4, '0'))
WHERE test_code IS NULL OR test_code = '';

-- Ensure test_code is unique
ALTER TABLE master_lab_tests
    ADD UNIQUE INDEX IF NOT EXISTS uq_master_test_code (test_code);

-- 2. Create hospital_lab_tests table (Assigning Laboratory Tests to Hospitals + Pricing)
CREATE TABLE IF NOT EXISTS hospital_lab_tests (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hospital_id BIGINT UNSIGNED NOT NULL,
    master_test_id BIGINT UNSIGNED NOT NULL,
    price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_hlt_hospital
        FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT,
    CONSTRAINT fk_hlt_master_test
        FOREIGN KEY (master_test_id) REFERENCES master_lab_tests(id) ON DELETE RESTRICT,
    CONSTRAINT uq_hospital_master_test
        UNIQUE (hospital_id, master_test_id),

    INDEX idx_hlt_hospital_status (hospital_id, status),
    INDEX idx_hlt_master_test (master_test_id)
);

-- 3. Extend investigation_requests for order tracking, snapshot pricing, and optional appointments/consultations
ALTER TABLE investigation_requests
    MODIFY consultation_id BIGINT UNSIGNED NULL,
    MODIFY appointment_id BIGINT UNSIGNED NULL,
    ADD COLUMN IF NOT EXISTS order_number VARCHAR(50) NULL AFTER id,
    ADD COLUMN IF NOT EXISTS master_test_id BIGINT UNSIGNED NULL AFTER hospital_id,
    ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER clinical_notes,
    ADD COLUMN IF NOT EXISTS payment_status ENUM('unpaid', 'paid', 'waived', 'refunded') NOT NULL DEFAULT 'unpaid' AFTER price,
    ADD COLUMN IF NOT EXISTS sample_collected_at DATETIME NULL AFTER status,
    ADD COLUMN IF NOT EXISTS completed_at DATETIME NULL AFTER sample_collected_at,
    ADD COLUMN IF NOT EXISTS cancelled_at DATETIME NULL AFTER completed_at,
    ADD COLUMN IF NOT EXISTS cancellation_reason VARCHAR(255) NULL AFTER cancelled_at;

-- Backfill order_number for existing records
UPDATE investigation_requests
SET order_number = CONCAT('LAB-', DATE_FORMAT(created_at, '%Y%m%d'), '-', LPAD(id, 4, '0'))
WHERE order_number IS NULL OR order_number = '';

-- Ensure order_number is unique
ALTER TABLE investigation_requests
    ADD UNIQUE INDEX IF NOT EXISTS uq_inv_order_number (order_number);

-- 4. Create lab_reports table for secure file linking, hashing, and versioning
CREATE TABLE IF NOT EXISTS lab_reports (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT UNSIGNED NOT NULL,
    patient_id BIGINT UNSIGNED NOT NULL,
    hospital_id BIGINT UNSIGNED NOT NULL,
    report_number VARCHAR(50) NOT NULL UNIQUE,
    storage_key VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_size INT UNSIGNED NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_hash VARCHAR(64) NOT NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    uploaded_by BIGINT UNSIGNED NOT NULL,
    status ENUM('final', 'preliminary', 'amended') NOT NULL DEFAULT 'final',
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_report_order
        FOREIGN KEY (order_id) REFERENCES investigation_requests(id) ON DELETE RESTRICT,
    CONSTRAINT fk_report_patient
        FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_report_hospital
        FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT,
    CONSTRAINT fk_report_uploaded_by
        FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT,

    INDEX idx_report_order (order_id),
    INDEX idx_report_patient (patient_id),
    INDEX idx_report_hospital (hospital_id),
    INDEX idx_report_hash (order_id, file_hash)
);

-- 5. Create lab_payments table for payment receipt tracking
CREATE TABLE IF NOT EXISTS lab_payments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT UNSIGNED NOT NULL,
    patient_id BIGINT UNSIGNED NOT NULL,
    hospital_id BIGINT UNSIGNED NOT NULL,
    receipt_number VARCHAR(50) NOT NULL UNIQUE,
    amount DECIMAL(10, 2) NOT NULL,
    payment_method ENUM('cash', 'upi', 'card') NOT NULL DEFAULT 'cash',
    transaction_reference VARCHAR(100) NULL,
    payment_status ENUM('paid', 'refunded') NOT NULL DEFAULT 'paid',
    collected_by BIGINT UNSIGNED NOT NULL,
    notes VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_lab_pay_order
        FOREIGN KEY (order_id) REFERENCES investigation_requests(id) ON DELETE RESTRICT,
    CONSTRAINT fk_lab_pay_patient
        FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_lab_pay_hospital
        FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT,
    CONSTRAINT fk_lab_pay_collected_by
        FOREIGN KEY (collected_by) REFERENCES users(id) ON DELETE RESTRICT,

    INDEX idx_lab_pay_order (order_id),
    INDEX idx_lab_pay_patient (patient_id),
    INDEX idx_lab_pay_hospital (hospital_id)
);
