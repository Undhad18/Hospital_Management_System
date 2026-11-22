-- ============================================================================
-- Migration 011: Module 12 Medicine Category and Inventory Management
-- ============================================================================

USE hospital_management;

-- 1. Medicine Categories Table
CREATE TABLE IF NOT EXISTS medicine_categories (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hospital_id BIGINT UNSIGNED NULL,
    name VARCHAR(120) NOT NULL,
    description TEXT NULL,
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_med_cat_hosp_name UNIQUE (hospital_id, name),
    CONSTRAINT fk_med_cat_hosp FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE,
    INDEX idx_med_cat_status (status)
);

-- 2. Seed Default Standard Global Medicine Categories
INSERT IGNORE INTO medicine_categories (hospital_id, name, description, status) VALUES
(NULL, 'Analgesics / Antipyretics', 'Pain relievers and fever reducing medications', 'active'),
(NULL, 'Antibiotics', 'Antimicrobial and bacterial infection treatments', 'active'),
(NULL, 'Antidiabetic', 'Blood glucose lowering and insulin management agents', 'active'),
(NULL, 'Cardiovascular / Statins', 'Cholesterol, lipid lowering, and cardiac health agents', 'active'),
(NULL, 'Antihypertensive', 'Blood pressure management medications', 'active'),
(NULL, 'Gastrointestinal / PPI', 'Proton pump inhibitors and gastric acid reducers', 'active'),
(NULL, 'Antihistamines / Allergy', 'Anti-allergy and histamine blocking drugs', 'active'),
(NULL, 'NSAIDs / Pain Relief', 'Non-steroidal anti-inflammatory drugs', 'active'),
(NULL, 'Electrolytes', 'Oral rehydration and mineral replenishment formulations', 'active'),
(NULL, 'Respiratory / Bronchodilator', 'Airway opening and asthma management medications', 'active'),
(NULL, 'Respiratory / Antitussive', 'Cough suppressants and expectorants', 'active'),
(NULL, 'Vitamins & Supplements', 'Essential micronutrients and nutritional support', 'active'),
(NULL, 'Dermatological', 'Topical ointments, antiseptics, and skin preparations', 'active');

-- 3. Suppliers Table
CREATE TABLE IF NOT EXISTS suppliers (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hospital_id BIGINT UNSIGNED NULL,
    name VARCHAR(150) NOT NULL,
    contact_person VARCHAR(120) NULL,
    phone VARCHAR(30) NULL,
    email VARCHAR(150) NULL,
    address TEXT NULL,
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_supplier_hosp_name UNIQUE (hospital_id, name),
    CONSTRAINT fk_supplier_hosp FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE,
    INDEX idx_supplier_status (status)
);

-- Seed Initial Verified Pharmaceutical Suppliers
INSERT IGNORE INTO suppliers (hospital_id, name, contact_person, phone, email, address, status) VALUES
(NULL, 'Apex Pharma Distribution Ltd.', 'Rajesh Verma', '+91-9876543210', 'orders@apexpharma.com', 'Plot 45, MIDC Industrial Area, Mumbai', 'active'),
(NULL, 'MedLife Healthcare Wholesale', 'Anita Sharma', '+91-9822334455', 'supply@medlifehealthcare.com', '88 Pharma Park, Sector 18, Gurugram', 'active'),
(NULL, 'CareGlobal LifeSciences', 'David Miller', '+1-555-019-8822', 'contracts@careglobal.com', '700 Biomedical Blvd, Boston, MA', 'active');

-- 4. Extend master_medicines
ALTER TABLE master_medicines
    ADD COLUMN IF NOT EXISTS sku VARCHAR(50) NULL AFTER id,
    ADD COLUMN IF NOT EXISTS category_id BIGINT UNSIGNED NULL AFTER category,
    ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER strength,
    ADD COLUMN IF NOT EXISTS sale_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER purchase_price,
    ADD COLUMN IF NOT EXISTS max_discount_percent DECIMAL(5, 2) NOT NULL DEFAULT 0.00 AFTER sale_price,
    ADD COLUMN IF NOT EXISTS min_stock_alert_level INT UNSIGNED NOT NULL DEFAULT 15 AFTER max_discount_percent,
    ADD COLUMN IF NOT EXISTS description TEXT NULL AFTER min_stock_alert_level,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

-- Populate SKUs for existing 15 master medicines if empty
UPDATE master_medicines SET sku = 'MED-PARA-500', purchase_price = 1.20, sale_price = 2.50, min_stock_alert_level = 50, max_discount_percent = 10.00 WHERE id = 1 AND (sku IS NULL OR sku = '');
UPDATE master_medicines SET sku = 'MED-PARA-650', purchase_price = 1.80, sale_price = 3.50, min_stock_alert_level = 50, max_discount_percent = 10.00 WHERE id = 2 AND (sku IS NULL OR sku = '');
UPDATE master_medicines SET sku = 'MED-AMOX-500', purchase_price = 4.50, sale_price = 8.00, min_stock_alert_level = 30, max_discount_percent = 5.00 WHERE id = 3 AND (sku IS NULL OR sku = '');
UPDATE master_medicines SET sku = 'MED-AUGM-625', purchase_price = 12.00, sale_price = 22.00, min_stock_alert_level = 25, max_discount_percent = 5.00 WHERE id = 4 AND (sku IS NULL OR sku = '');
UPDATE master_medicines SET sku = 'MED-METF-500', purchase_price = 2.10, sale_price = 4.50, min_stock_alert_level = 40, max_discount_percent = 10.00 WHERE id = 5 AND (sku IS NULL OR sku = '');
UPDATE master_medicines SET sku = 'MED-ATOR-10', purchase_price = 5.00, sale_price = 10.00, min_stock_alert_level = 30, max_discount_percent = 10.00 WHERE id = 6 AND (sku IS NULL OR sku = '');
UPDATE master_medicines SET sku = 'MED-AMLO-5', purchase_price = 2.00, sale_price = 4.00, min_stock_alert_level = 30, max_discount_percent = 10.00 WHERE id = 7 AND (sku IS NULL OR sku = '');
UPDATE master_medicines SET sku = 'MED-PANT-40', purchase_price = 4.00, sale_price = 8.50, min_stock_alert_level = 35, max_discount_percent = 8.00 WHERE id = 8 AND (sku IS NULL OR sku = '');
UPDATE master_medicines SET sku = 'MED-OMEP-20', purchase_price = 3.50, sale_price = 7.00, min_stock_alert_level = 30, max_discount_percent = 8.00 WHERE id = 9 AND (sku IS NULL OR sku = '');
UPDATE master_medicines SET sku = 'MED-AZIT-500', purchase_price = 14.00, sale_price = 25.00, min_stock_alert_level = 20, max_discount_percent = 5.00 WHERE id = 10 AND (sku IS NULL OR sku = '');
UPDATE master_medicines SET sku = 'MED-CETR-10', purchase_price = 1.50, sale_price = 3.50, min_stock_alert_level = 40, max_discount_percent = 10.00 WHERE id = 11 AND (sku IS NULL OR sku = '');
UPDATE master_medicines SET sku = 'MED-IBUP-400', purchase_price = 2.50, sale_price = 5.00, min_stock_alert_level = 35, max_discount_percent = 10.00 WHERE id = 12 AND (sku IS NULL OR sku = '');
UPDATE master_medicines SET sku = 'MED-ORS-21G', purchase_price = 8.00, sale_price = 15.00, min_stock_alert_level = 40, max_discount_percent = 5.00 WHERE id = 13 AND (sku IS NULL OR sku = '');
UPDATE master_medicines SET sku = 'MED-SALB-100', purchase_price = 85.00, sale_price = 130.00, min_stock_alert_level = 15, max_discount_percent = 5.00 WHERE id = 14 AND (sku IS NULL OR sku = '');
UPDATE master_medicines SET sku = 'MED-COUG-100', purchase_price = 45.00, sale_price = 75.00, min_stock_alert_level = 20, max_discount_percent = 5.00 WHERE id = 15 AND (sku IS NULL OR sku = '');

-- Fallback SKU generator for any custom records
UPDATE master_medicines
SET sku = CONCAT('MED-', LPAD(id, 4, '0'))
WHERE sku IS NULL OR sku = '';

-- Backfill category_id by matching category names
UPDATE master_medicines m
JOIN medicine_categories c ON c.name = m.category AND c.hospital_id IS NULL
SET m.category_id = c.id
WHERE m.category_id IS NULL;

-- 5. Hospital Medicines (Formulary)
CREATE TABLE IF NOT EXISTS hospital_medicines (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hospital_id BIGINT UNSIGNED NOT NULL,
    master_medicine_id BIGINT UNSIGNED NOT NULL,
    sale_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    max_discount_percent DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    min_stock_alert_level INT UNSIGNED NOT NULL DEFAULT 15,
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_hosp_master_med UNIQUE (hospital_id, master_medicine_id),
    CONSTRAINT fk_hm_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE,
    CONSTRAINT fk_hm_master_med FOREIGN KEY (master_medicine_id) REFERENCES master_medicines(id) ON DELETE RESTRICT,
    INDEX idx_hm_hosp_status (hospital_id, status)
);

-- Seed hospital_medicines formulary for Hospital 1 and 2 from master_medicines
INSERT IGNORE INTO hospital_medicines (hospital_id, master_medicine_id, sale_price, max_discount_percent, min_stock_alert_level, status)
SELECT 1, id, sale_price, max_discount_percent, min_stock_alert_level, 'active' FROM master_medicines;

INSERT IGNORE INTO hospital_medicines (hospital_id, master_medicine_id, sale_price, max_discount_percent, min_stock_alert_level, status)
SELECT 2, id, sale_price, max_discount_percent, min_stock_alert_level, 'active' FROM master_medicines;

-- 6. Medicine Batches
CREATE TABLE IF NOT EXISTS medicine_batches (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hospital_id BIGINT UNSIGNED NOT NULL,
    medicine_id BIGINT UNSIGNED NOT NULL,
    supplier_id BIGINT UNSIGNED NULL,
    batch_number VARCHAR(80) NOT NULL,
    purchase_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    purchase_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    sale_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    initial_quantity INT UNSIGNED NOT NULL DEFAULT 0,
    current_quantity INT UNSIGNED NOT NULL DEFAULT 0,
    status ENUM('active', 'quarantined', 'depleted', 'expired', 'recalled') NOT NULL DEFAULT 'active',
    received_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_hosp_med_batch UNIQUE (hospital_id, medicine_id, batch_number),
    CONSTRAINT fk_mb_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT,
    CONSTRAINT fk_mb_medicine FOREIGN KEY (medicine_id) REFERENCES master_medicines(id) ON DELETE RESTRICT,
    CONSTRAINT fk_mb_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
    CONSTRAINT fk_mb_received_by FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_mb_expiry (hospital_id, expiry_date),
    INDEX idx_mb_status_qty (hospital_id, status, current_quantity)
);

-- 7. Stock Movements Ledger
CREATE TABLE IF NOT EXISTS stock_movements (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hospital_id BIGINT UNSIGNED NOT NULL,
    batch_id BIGINT UNSIGNED NOT NULL,
    medicine_id BIGINT UNSIGNED NOT NULL,
    movement_type ENUM('initial_receipt', 'purchase', 'dispense', 'adjustment_add', 'adjustment_sub', 'return', 'write_off_expired', 'write_off_damaged') NOT NULL,
    quantity_change INT NOT NULL,
    remaining_batch_quantity INT UNSIGNED NOT NULL,
    reference_type VARCHAR(50) NULL,
    reference_id VARCHAR(100) NULL,
    reason VARCHAR(255) NULL,
    performed_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sm_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT,
    CONSTRAINT fk_sm_batch FOREIGN KEY (batch_id) REFERENCES medicine_batches(id) ON DELETE RESTRICT,
    CONSTRAINT fk_sm_medicine FOREIGN KEY (medicine_id) REFERENCES master_medicines(id) ON DELETE RESTRICT,
    CONSTRAINT fk_sm_performed_by FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_sm_hosp_med (hospital_id, medicine_id),
    INDEX idx_sm_batch (batch_id),
    INDEX idx_sm_date (created_at)
);

-- 8. Pharmacy Dispensations & Items
CREATE TABLE IF NOT EXISTS pharmacy_dispensations (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    dispensation_number VARCHAR(50) NOT NULL UNIQUE,
    hospital_id BIGINT UNSIGNED NOT NULL,
    patient_id BIGINT UNSIGNED NOT NULL,
    prescription_id BIGINT UNSIGNED NULL,
    subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    tax_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    payment_status ENUM('paid', 'unpaid', 'waived', 'refunded') NOT NULL DEFAULT 'paid',
    payment_method ENUM('cash', 'card', 'upi', 'insurance') NOT NULL DEFAULT 'cash',
    dispensed_by BIGINT UNSIGNED NOT NULL,
    notes VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pd_hosp FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT,
    CONSTRAINT fk_pd_patient FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_pd_prescription FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON DELETE SET NULL,
    CONSTRAINT fk_pd_dispensed_by FOREIGN KEY (dispensed_by) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_pd_hosp (hospital_id, created_at)
);

CREATE TABLE IF NOT EXISTS pharmacy_dispensation_items (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    dispensation_id BIGINT UNSIGNED NOT NULL,
    batch_id BIGINT UNSIGNED NOT NULL,
    medicine_id BIGINT UNSIGNED NOT NULL,
    quantity INT UNSIGNED NOT NULL,
    unit_sale_price DECIMAL(10, 2) NOT NULL,
    discount_percent DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    total_price DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pdi_dispensation FOREIGN KEY (dispensation_id) REFERENCES pharmacy_dispensations(id) ON DELETE CASCADE,
    CONSTRAINT fk_pdi_batch FOREIGN KEY (batch_id) REFERENCES medicine_batches(id) ON DELETE RESTRICT,
    CONSTRAINT fk_pdi_medicine FOREIGN KEY (medicine_id) REFERENCES master_medicines(id) ON DELETE RESTRICT
);
