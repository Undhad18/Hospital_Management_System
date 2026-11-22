-- ============================================================================
-- Migration 008: Module 9 Patient Admission Management
-- ============================================================================

USE hospital_management;

-- 1. Create admissions table
CREATE TABLE IF NOT EXISTS admissions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    admission_number VARCHAR(50) NOT NULL UNIQUE,
    patient_id BIGINT UNSIGNED NOT NULL,
    hospital_id BIGINT UNSIGNED NOT NULL,
    doctor_id BIGINT UNSIGNED NOT NULL,
    department_id BIGINT UNSIGNED NOT NULL,
    appointment_id BIGINT UNSIGNED NULL,
    admission_date DATETIME NOT NULL,
    reason TEXT NOT NULL,
    status ENUM('pending', 'admitted', 'discharged', 'cancelled') NOT NULL DEFAULT 'admitted',
    discharged_at DATETIME NULL,
    discharge_notes TEXT NULL,
    admitted_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_admission_patient
        FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_admission_hospital
        FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT,
    CONSTRAINT fk_admission_doctor
        FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_admission_department
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
    CONSTRAINT fk_admission_appointment
        FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
    CONSTRAINT fk_admission_admitted_by
        FOREIGN KEY (admitted_by) REFERENCES users(id) ON DELETE RESTRICT,

    INDEX idx_admission_patient_status (patient_id, status),
    INDEX idx_admission_hospital_status (hospital_id, status),
    INDEX idx_admission_doctor (doctor_id),
    INDEX idx_admission_date (admission_date)
);

-- 2. Create admission_status_history table
CREATE TABLE IF NOT EXISTS admission_status_history (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    admission_id BIGINT UNSIGNED NOT NULL,
    previous_status ENUM('pending', 'admitted', 'discharged', 'cancelled') NULL,
    new_status ENUM('pending', 'admitted', 'discharged', 'cancelled') NOT NULL,
    changed_by BIGINT UNSIGNED NOT NULL,
    change_reason VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_history_admission
        FOREIGN KEY (admission_id) REFERENCES admissions(id) ON DELETE CASCADE,
    CONSTRAINT fk_history_changed_by
        FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE RESTRICT,

    INDEX idx_history_admission (admission_id),
    INDEX idx_history_created (created_at)
);
