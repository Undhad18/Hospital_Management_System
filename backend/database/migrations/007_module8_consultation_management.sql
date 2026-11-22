-- ============================================================================
-- Migration 007: Module 8 Daily Consultation and Follow-up Management
-- ============================================================================

USE hospital_management;

-- 1. Master Medicines Catalog
CREATE TABLE IF NOT EXISTS master_medicines (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    generic_name VARCHAR(150) NULL,
    form VARCHAR(50) NOT NULL DEFAULT 'Tablet',
    strength VARCHAR(50) NULL,
    category VARCHAR(100) NULL,
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_med_name (name)
);

-- 2. Master Lab Tests Catalog
CREATE TABLE IF NOT EXISTS master_lab_tests (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    test_name VARCHAR(150) NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'Pathology',
    sample_type VARCHAR(100) NULL,
    standard_turnaround_hours INT UNSIGNED NOT NULL DEFAULT 24,
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_test_name (test_name)
);

-- 3. Consultations Table
CREATE TABLE IF NOT EXISTS consultations (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    appointment_id BIGINT UNSIGNED NOT NULL UNIQUE,
    patient_id BIGINT UNSIGNED NOT NULL,
    doctor_id BIGINT UNSIGNED NOT NULL,
    hospital_id BIGINT UNSIGNED NOT NULL,
    status ENUM('draft', 'submitted') NOT NULL DEFAULT 'draft',
    chief_complaint TEXT NULL,
    symptoms TEXT NULL,
    examination_findings TEXT NULL,
    diagnosis VARCHAR(255) NULL,
    patient_condition ENUM('stable', 'improving', 'critical', 'guarded', 'fair') NOT NULL DEFAULT 'stable',
    treatment_plan TEXT NULL,
    clinical_notes TEXT NULL,
    advice TEXT NULL,
    admission_recommended BOOLEAN NOT NULL DEFAULT FALSE,
    admission_notes TEXT NULL,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_consultation_appointment
        FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
    CONSTRAINT fk_consultation_patient
        FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_consultation_doctor
        FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_consultation_hospital
        FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT,

    INDEX idx_consultation_doctor (doctor_id, started_at),
    INDEX idx_consultation_patient (patient_id, started_at),
    INDEX idx_consultation_hospital (hospital_id, started_at),
    INDEX idx_consultation_status (status)
);

-- 4. Consultation Vital Signs Table
CREATE TABLE IF NOT EXISTS consultation_vitals (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    consultation_id BIGINT UNSIGNED NOT NULL,
    patient_id BIGINT UNSIGNED NOT NULL,
    systolic_bp INT UNSIGNED NULL,
    diastolic_bp INT UNSIGNED NULL,
    pulse_rate INT UNSIGNED NULL,
    temperature DECIMAL(4, 1) NULL,
    respiratory_rate INT UNSIGNED NULL,
    oxygen_saturation INT UNSIGNED NULL,
    height_cm DECIMAL(5, 2) NULL,
    weight_kg DECIMAL(5, 2) NULL,
    bmi DECIMAL(4, 1) NULL,
    recorded_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_vitals_consultation
        FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE,
    CONSTRAINT fk_vitals_patient
        FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_vitals_recorded_by
        FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE RESTRICT,

    INDEX idx_vitals_consultation (consultation_id),
    INDEX idx_vitals_patient (patient_id)
);

-- 5. Investigation Requests Table
CREATE TABLE IF NOT EXISTS investigation_requests (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    consultation_id BIGINT UNSIGNED NOT NULL,
    appointment_id BIGINT UNSIGNED NOT NULL,
    patient_id BIGINT UNSIGNED NOT NULL,
    doctor_id BIGINT UNSIGNED NOT NULL,
    hospital_id BIGINT UNSIGNED NOT NULL,
    test_name VARCHAR(150) NOT NULL,
    test_category VARCHAR(100) NOT NULL DEFAULT 'General',
    priority ENUM('routine', 'urgent', 'stat') NOT NULL DEFAULT 'routine',
    clinical_notes TEXT NULL,
    status ENUM('requested', 'sample_collected', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'requested',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_inv_consultation
        FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE,
    CONSTRAINT fk_inv_appointment
        FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
    CONSTRAINT fk_inv_patient
        FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_inv_doctor
        FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_inv_hospital
        FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT,

    INDEX idx_inv_consultation (consultation_id),
    INDEX idx_inv_appointment (appointment_id),
    INDEX idx_inv_patient (patient_id),
    INDEX idx_inv_hospital (hospital_id, status)
);

-- 6. Prescriptions Table
CREATE TABLE IF NOT EXISTS prescriptions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    consultation_id BIGINT UNSIGNED NOT NULL,
    appointment_id BIGINT UNSIGNED NOT NULL,
    patient_id BIGINT UNSIGNED NOT NULL,
    doctor_id BIGINT UNSIGNED NOT NULL,
    hospital_id BIGINT UNSIGNED NOT NULL,
    prescription_number VARCHAR(50) NOT NULL UNIQUE,
    general_instructions TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_rx_consultation
        FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE,
    CONSTRAINT fk_rx_appointment
        FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
    CONSTRAINT fk_rx_patient
        FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_rx_doctor
        FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_rx_hospital
        FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT,

    INDEX idx_rx_consultation (consultation_id),
    INDEX idx_rx_appointment (appointment_id),
    INDEX idx_rx_patient (patient_id)
);

-- 7. Prescription Items Table
CREATE TABLE IF NOT EXISTS prescription_items (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    prescription_id BIGINT UNSIGNED NOT NULL,
    medicine_name VARCHAR(150) NOT NULL,
    dosage VARCHAR(50) NOT NULL,
    form VARCHAR(50) NOT NULL DEFAULT 'Tablet',
    frequency VARCHAR(50) NOT NULL,
    duration VARCHAR(50) NOT NULL,
    timing ENUM('before_food', 'after_food', 'with_food', 'anytime') NOT NULL DEFAULT 'after_food',
    quantity INT UNSIGNED NULL,
    instructions VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_rx_item_prescription
        FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON DELETE CASCADE,

    INDEX idx_rx_item_prescription (prescription_id)
);
