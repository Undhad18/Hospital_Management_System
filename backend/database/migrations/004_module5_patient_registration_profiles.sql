-- Migration: 004_module5_patient_registration_profiles.sql
-- Purpose: Schema for Module 5 Patient Registration, Profile Management, Medical History, Appointments & Medical Records

-- 1. Add google_id column to users table if not exists (for Lesson 5.2 Google Sign-In)
SET @col_google_id = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'google_id'
);

SET @sql_google_id = IF(
    @col_google_id = 0,
    'ALTER TABLE users ADD COLUMN google_id VARCHAR(100) NULL UNIQUE AFTER email',
    'SELECT "Column google_id already exists"'
);
PREPARE stmt_google FROM @sql_google_id;
EXECUTE stmt_google;
DEALLOCATE PREPARE stmt_google;

-- 2. Create patient_profiles table (Lessons 5.3, 5.4, 5.5, 5.6)
CREATE TABLE IF NOT EXISTS patient_profiles (
    user_id BIGINT UNSIGNED PRIMARY KEY,
    dob DATE NULL,
    gender ENUM('male', 'female', 'other', 'prefer_not_to_say') NULL,
    blood_group ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') NULL,
    address_line1 VARCHAR(255) NULL,
    address_line2 VARCHAR(255) NULL,
    country_id INT UNSIGNED NULL,
    state_id BIGINT UNSIGNED NULL,
    city_id BIGINT UNSIGNED NULL,
    postal_code VARCHAR(20) NULL,
    emergency_contact_name VARCHAR(150) NULL,
    emergency_contact_relationship VARCHAR(100) NULL,
    emergency_contact_phone VARCHAR(30) NULL,
    allergies TEXT NULL,
    chronic_conditions TEXT NULL,
    past_medical_history TEXT NULL,
    current_medications TEXT NULL,
    medical_notes TEXT NULL,
    is_profile_completed BOOLEAN NOT NULL DEFAULT FALSE,
    registered_by_staff_id BIGINT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_patient_profile_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_profile_country FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE SET NULL,
    CONSTRAINT fk_patient_profile_state FOREIGN KEY (state_id) REFERENCES states(id) ON DELETE SET NULL,
    CONSTRAINT fk_patient_profile_city FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE SET NULL,
    CONSTRAINT fk_patient_profile_staff FOREIGN KEY (registered_by_staff_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 3. Create appointments table (Lessons 5.8)
CREATE TABLE IF NOT EXISTS appointments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    appointment_number VARCHAR(50) NOT NULL UNIQUE,
    patient_id BIGINT UNSIGNED NOT NULL,
    hospital_id BIGINT UNSIGNED NOT NULL,
    department_id BIGINT UNSIGNED NOT NULL,
    doctor_id BIGINT UNSIGNED NOT NULL,
    appointment_date DATE NOT NULL,
    appointment_time VARCHAR(20) NOT NULL,
    status ENUM('pending', 'confirmed', 'in_waiting', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
    reason TEXT NULL,
    payment_method ENUM('cash', 'upi') NOT NULL DEFAULT 'cash',
    consultation_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    bill_id VARCHAR(50) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_appointment_patient FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_appointment_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT,
    CONSTRAINT fk_appointment_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
    CONSTRAINT fk_appointment_doctor FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_appointment_patient (patient_id, appointment_date),
    INDEX idx_appointment_hospital (hospital_id, appointment_date),
    INDEX idx_appointment_doctor (doctor_id, appointment_date)
);

-- 4. Create patient_medical_records table (Lesson 5.7)
CREATE TABLE IF NOT EXISTS patient_medical_records (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    patient_id BIGINT UNSIGNED NOT NULL,
    hospital_id BIGINT UNSIGNED NOT NULL,
    doctor_id BIGINT UNSIGNED NULL,
    appointment_id BIGINT UNSIGNED NULL,
    record_type ENUM('consultation_note', 'prescription', 'lab_report', 'diagnostic_imaging', 'discharge_summary') NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT NULL,
    diagnosis VARCHAR(255) NULL,
    doctor_notes TEXT NULL,
    file_url VARCHAR(255) NULL,
    file_name VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_record_patient FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_record_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT,
    CONSTRAINT fk_record_doctor FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_record_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
    INDEX idx_record_patient (patient_id, created_at),
    INDEX idx_record_hospital (hospital_id, created_at)
);
