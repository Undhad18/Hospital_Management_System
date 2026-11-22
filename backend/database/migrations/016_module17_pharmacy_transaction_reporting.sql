-- ============================================================================
-- Migration 016: Module 17 Pharmacy Transaction History and Reporting Indexes
-- ============================================================================

USE hospital_management;

-- Safe composite indexes for reporting queries

-- 1. Pharmacy Bills: hospital_id + created_at
SET @exist_idx_pb_hosp_created := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pharmacy_bills' AND INDEX_NAME = 'idx_pb_hosp_created'
);
SET @sql_idx_pb_hosp_created := IF(@exist_idx_pb_hosp_created = 0,
    'CREATE INDEX idx_pb_hosp_created ON pharmacy_bills (hospital_id, created_at)',
    'SELECT 1'
);
PREPARE stmt1 FROM @sql_idx_pb_hosp_created;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

-- 2. Pharmacy Payments: hospital_id + created_at
SET @exist_idx_ppay_hosp_created := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pharmacy_payments' AND INDEX_NAME = 'idx_ppay_hosp_created'
);
SET @sql_idx_ppay_hosp_created := IF(@exist_idx_ppay_hosp_created = 0,
    'CREATE INDEX idx_ppay_hosp_created ON pharmacy_payments (hospital_id, created_at)',
    'SELECT 1'
);
PREPARE stmt2 FROM @sql_idx_ppay_hosp_created;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- 3. Pharmacy Refunds: hospital_id + created_at
SET @exist_idx_pref_hosp_created := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pharmacy_refunds' AND INDEX_NAME = 'idx_pref_hosp_created'
);
SET @sql_idx_pref_hosp_created := IF(@exist_idx_pref_hosp_created = 0,
    'CREATE INDEX idx_pref_hosp_created ON pharmacy_refunds (hospital_id, created_at)',
    'SELECT 1'
);
PREPARE stmt3 FROM @sql_idx_pref_hosp_created;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;

-- 4. Medicine Batches: hospital_id + purchase_date
SET @exist_idx_mb_hosp_pdate := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'medicine_batches' AND INDEX_NAME = 'idx_mb_hosp_pdate'
);
SET @sql_idx_mb_hosp_pdate := IF(@exist_idx_mb_hosp_pdate = 0,
    'CREATE INDEX idx_mb_hosp_pdate ON medicine_batches (hospital_id, purchase_date)',
    'SELECT 1'
);
PREPARE stmt4 FROM @sql_idx_mb_hosp_pdate;
EXECUTE stmt4;
DEALLOCATE PREPARE stmt4;

-- 5. Stock Movements: hospital_id + created_at
SET @exist_idx_sm_hosp_created := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_movements' AND INDEX_NAME = 'idx_sm_hosp_created'
);
SET @sql_idx_sm_hosp_created := IF(@exist_idx_sm_hosp_created = 0,
    'CREATE INDEX idx_sm_hosp_created ON stock_movements (hospital_id, created_at)',
    'SELECT 1'
);
PREPARE stmt5 FROM @sql_idx_sm_hosp_created;
EXECUTE stmt5;
DEALLOCATE PREPARE stmt5;

