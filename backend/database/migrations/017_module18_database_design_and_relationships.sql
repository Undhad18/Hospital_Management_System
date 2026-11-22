-- ============================================================================
-- Migration 017: Module 18 Database Design and Relationships Hardening
-- ============================================================================

USE hospital_management;

-- 1. Index & Foreign Key: master_medicines.category_id -> medicine_categories.id
SET @exist_idx_mm_category := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'master_medicines' AND INDEX_NAME = 'idx_mm_category'
);
SET @sql_idx_mm_category := IF(@exist_idx_mm_category = 0,
    'CREATE INDEX idx_mm_category ON master_medicines (category_id)',
    'SELECT 1'
);
PREPARE stmt1 FROM @sql_idx_mm_category;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

SET @exist_fk_mm_category := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'master_medicines' AND CONSTRAINT_NAME = 'fk_mm_category'
);
SET @sql_fk_mm_category := IF(@exist_fk_mm_category = 0,
    'ALTER TABLE master_medicines ADD CONSTRAINT fk_mm_category FOREIGN KEY (category_id) REFERENCES medicine_categories(id) ON DELETE SET NULL',
    'SELECT 1'
);
PREPARE stmt2 FROM @sql_fk_mm_category;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- 2. Index & Foreign Key: investigation_requests.master_test_id -> master_lab_tests.id
SET @exist_idx_ir_master_test := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'investigation_requests' AND INDEX_NAME = 'idx_ir_master_test'
);
SET @sql_idx_ir_master_test := IF(@exist_idx_ir_master_test = 0,
    'CREATE INDEX idx_ir_master_test ON investigation_requests (master_test_id)',
    'SELECT 1'
);
PREPARE stmt3 FROM @sql_idx_ir_master_test;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;

SET @exist_fk_ir_master_test := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'investigation_requests' AND CONSTRAINT_NAME = 'fk_ir_master_test'
);
SET @sql_fk_ir_master_test := IF(@exist_fk_ir_master_test = 0,
    'ALTER TABLE investigation_requests ADD CONSTRAINT fk_ir_master_test FOREIGN KEY (master_test_id) REFERENCES master_lab_tests(id) ON DELETE SET NULL',
    'SELECT 1'
);
PREPARE stmt4 FROM @sql_fk_ir_master_test;
EXECUTE stmt4;
DEALLOCATE PREPARE stmt4;

-- 3. Audit Timestamp: pharmacy_dispensations.updated_at
SET @exist_col_disp_updated := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pharmacy_dispensations' AND COLUMN_NAME = 'updated_at'
);
SET @sql_col_disp_updated := IF(@exist_col_disp_updated = 0,
    'ALTER TABLE pharmacy_dispensations ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at',
    'SELECT 1'
);
PREPARE stmt5 FROM @sql_col_disp_updated;
EXECUTE stmt5;
DEALLOCATE PREPARE stmt5;
