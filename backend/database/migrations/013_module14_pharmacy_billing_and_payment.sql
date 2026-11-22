-- ============================================================================
-- Migration 013: Module 14 Pharmacy Billing and Payment
-- ============================================================================

USE hospital_management;

-- 1. Pharmacy Bills Table
CREATE TABLE IF NOT EXISTS pharmacy_bills (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    bill_number VARCHAR(50) NOT NULL UNIQUE,
    hospital_id BIGINT UNSIGNED NOT NULL,
    patient_id BIGINT UNSIGNED NOT NULL,
    prescription_id BIGINT UNSIGNED NULL,
    purchase_type ENUM('hospital', 'outside') NOT NULL DEFAULT 'hospital',
    external_pharmacy_name VARCHAR(150) NULL,
    external_bill_number VARCHAR(100) NULL,
    subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    taxable_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    gst_rate DECIMAL(5, 2) NOT NULL DEFAULT 12.00,
    gst_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    grand_total DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    paid_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    balance_due DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    status ENUM('pending', 'partially_paid', 'paid', 'cancelled', 'refunded') NOT NULL DEFAULT 'pending',
    idempotency_key VARCHAR(100) NULL UNIQUE,
    notes TEXT NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_pb_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT,
    CONSTRAINT fk_pb_patient FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_pb_prescription FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON DELETE SET NULL,
    CONSTRAINT fk_pb_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,

    INDEX idx_pb_hosp_status (hospital_id, status),
    INDEX idx_pb_patient (patient_id),
    INDEX idx_pb_prescription (prescription_id),
    INDEX idx_pb_created (created_at),
    INDEX idx_pb_purchase_type (purchase_type)
);

-- 2. Pharmacy Bill Items Table
CREATE TABLE IF NOT EXISTS pharmacy_bill_items (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    bill_id BIGINT UNSIGNED NOT NULL,
    prescription_item_id BIGINT UNSIGNED NULL,
    medicine_id BIGINT UNSIGNED NULL,
    medicine_name VARCHAR(150) NOT NULL,
    sku VARCHAR(50) NULL,
    dosage_form VARCHAR(50) NULL,
    quantity INT UNSIGNED NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    discount_percent DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
    discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    taxable_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    gst_rate DECIMAL(5, 2) NOT NULL DEFAULT 12.00,
    gst_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    line_total DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_pbi_bill FOREIGN KEY (bill_id) REFERENCES pharmacy_bills(id) ON DELETE CASCADE,
    CONSTRAINT fk_pbi_rx_item FOREIGN KEY (prescription_item_id) REFERENCES prescription_items(id) ON DELETE SET NULL,
    CONSTRAINT fk_pbi_medicine FOREIGN KEY (medicine_id) REFERENCES master_medicines(id) ON DELETE SET NULL,

    INDEX idx_pbi_bill (bill_id),
    INDEX idx_pbi_medicine (medicine_id)
);

-- 3. Pharmacy Payments Table
CREATE TABLE IF NOT EXISTS pharmacy_payments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    receipt_number VARCHAR(50) NOT NULL UNIQUE,
    bill_id BIGINT UNSIGNED NOT NULL,
    hospital_id BIGINT UNSIGNED NOT NULL,
    patient_id BIGINT UNSIGNED NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    payment_method ENUM('cash', 'upi', 'card') NOT NULL DEFAULT 'cash',
    payment_status ENUM('pending', 'completed', 'failed', 'refunded') NOT NULL DEFAULT 'completed',
    transaction_reference VARCHAR(100) NULL,
    card_network VARCHAR(30) NULL,
    card_last4 VARCHAR(4) NULL,
    notes VARCHAR(255) NULL,
    collected_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_ppay_bill FOREIGN KEY (bill_id) REFERENCES pharmacy_bills(id) ON DELETE RESTRICT,
    CONSTRAINT fk_ppay_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT,
    CONSTRAINT fk_ppay_patient FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_ppay_collected_by FOREIGN KEY (collected_by) REFERENCES users(id) ON DELETE RESTRICT,

    INDEX idx_ppay_bill (bill_id),
    INDEX idx_ppay_patient (patient_id),
    INDEX idx_ppay_status (payment_status),
    INDEX idx_ppay_created (created_at)
);

-- 4. Pharmacy Refunds Table
CREATE TABLE IF NOT EXISTS pharmacy_refunds (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    refund_number VARCHAR(50) NOT NULL UNIQUE,
    payment_id BIGINT UNSIGNED NOT NULL,
    bill_id BIGINT UNSIGNED NOT NULL,
    hospital_id BIGINT UNSIGNED NOT NULL,
    patient_id BIGINT UNSIGNED NOT NULL,
    refund_amount DECIMAL(10, 2) NOT NULL,
    reason VARCHAR(255) NOT NULL,
    status ENUM('completed', 'failed') NOT NULL DEFAULT 'completed',
    refunded_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_pref_payment FOREIGN KEY (payment_id) REFERENCES pharmacy_payments(id) ON DELETE RESTRICT,
    CONSTRAINT fk_pref_bill FOREIGN KEY (bill_id) REFERENCES pharmacy_bills(id) ON DELETE RESTRICT,
    CONSTRAINT fk_pref_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT,
    CONSTRAINT fk_pref_patient FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_pref_refunded_by FOREIGN KEY (refunded_by) REFERENCES users(id) ON DELETE RESTRICT,

    INDEX idx_pref_bill (bill_id),
    INDEX idx_pref_payment (payment_id)
);

