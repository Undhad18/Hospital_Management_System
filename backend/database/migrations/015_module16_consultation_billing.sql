-- ============================================================================
-- Migration 015: Module 16 Consultation Billing & Payment Workflow
-- ============================================================================

USE hospital_management;

-- 1. Consultation Bills Table (Strict separation from Pharmacy Bills)
CREATE TABLE IF NOT EXISTS consultation_bills (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    bill_number VARCHAR(50) NOT NULL UNIQUE,
    hospital_id BIGINT UNSIGNED NOT NULL,
    patient_id BIGINT UNSIGNED NOT NULL,
    doctor_id BIGINT UNSIGNED NOT NULL,
    appointment_id BIGINT UNSIGNED NOT NULL UNIQUE,
    consultation_id BIGINT UNSIGNED NULL,
    fee_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    tax_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    paid_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    balance_due DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    status ENUM('pending', 'partially_paid', 'paid', 'cancelled', 'refunded') NOT NULL DEFAULT 'pending',
    payment_method ENUM('cash', 'upi', 'gpay') NULL,
    idempotency_key VARCHAR(100) NULL UNIQUE,
    notes TEXT NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_cb_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT,
    CONSTRAINT fk_cb_patient FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_cb_doctor FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_cb_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE RESTRICT,
    CONSTRAINT fk_cb_consultation FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE SET NULL,
    CONSTRAINT fk_cb_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,

    INDEX idx_cb_hosp_status (hospital_id, status),
    INDEX idx_cb_patient (patient_id),
    INDEX idx_cb_doctor (doctor_id),
    INDEX idx_cb_created (created_at)
);

-- 2. Consultation Payments & Receipts Table
CREATE TABLE IF NOT EXISTS consultation_payments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    receipt_number VARCHAR(50) NOT NULL UNIQUE,
    bill_id BIGINT UNSIGNED NOT NULL,
    appointment_id BIGINT UNSIGNED NOT NULL,
    hospital_id BIGINT UNSIGNED NOT NULL,
    patient_id BIGINT UNSIGNED NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    payment_method ENUM('cash', 'upi', 'gpay') NOT NULL DEFAULT 'cash',
    payment_status ENUM('pending', 'completed', 'failed', 'refunded') NOT NULL DEFAULT 'completed',
    transaction_reference VARCHAR(100) NULL,
    notes VARCHAR(255) NULL,
    collected_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_cp_bill FOREIGN KEY (bill_id) REFERENCES consultation_bills(id) ON DELETE RESTRICT,
    CONSTRAINT fk_cp_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE RESTRICT,
    CONSTRAINT fk_cp_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT,
    CONSTRAINT fk_cp_patient FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_cp_collected_by FOREIGN KEY (collected_by) REFERENCES users(id) ON DELETE RESTRICT,

    INDEX idx_cp_bill (bill_id),
    INDEX idx_cp_patient (patient_id),
    INDEX idx_cp_status (payment_status),
    INDEX idx_cp_created (created_at)
);

