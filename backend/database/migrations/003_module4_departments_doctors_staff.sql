-- Migration: 003_module4_departments_doctors_staff.sql
-- Purpose: Module 4 schema additions for Master Departments, Doctor Profiles, Staff Profiles, and Designations

-- 1. Create master_departments table for centralized global department catalog
CREATE TABLE IF NOT EXISTS master_departments (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE,
    code VARCHAR(50) NOT NULL UNIQUE,
    description TEXT NULL,
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Seed baseline master departments
INSERT IGNORE INTO master_departments (name, code, description, status) VALUES
('Cardiology', 'CARD', 'Heart, vascular system & cardiac care', 'active'),
('Neurology', 'NEUR', 'Brain, spinal cord & nervous system disorders', 'active'),
('Orthopedics', 'ORTH', 'Musculoskeletal system, bones, joints & ligaments', 'active'),
('Pediatrics', 'PED', 'Medical care of infants, children & adolescents', 'active'),
('Oncology', 'ONC', 'Cancer diagnosis, chemotherapy & radiation therapy', 'active'),
('Radiology & Imaging', 'RAD', 'Medical imaging, MRI, CT scan & ultrasound', 'active'),
('Pathology & Lab', 'PATH', 'Clinical diagnostics, blood tests & tissue analysis', 'active'),
('General Surgery', 'SURG', 'Operative & procedural surgical care', 'active'),
('Gynecology & Obstetrics', 'OBGYN', 'Women health, maternal & prenatal care', 'active'),
('Emergency Medicine', 'EMER', 'Acute critical care, trauma & 24/7 casualty', 'active'),
('Dermatology', 'DERM', 'Skin, hair & dermatological treatments', 'active'),
('Ophthalmology', 'OPHTH', 'Eye examinations, vision care & optical surgery', 'active'),
('Psychiatry', 'PSYC', 'Mental health, behavioral therapy & counseling', 'active'),
('Anesthesiology', 'ANES', 'Pain management & perioperative anesthesia', 'active'),
('General Medicine', 'GENMED', 'Primary healthcare, internal medicine & chronic care', 'active');

-- 2. Create doctor_profiles table
CREATE TABLE IF NOT EXISTS doctor_profiles (
    user_id BIGINT UNSIGNED PRIMARY KEY,
    experience_years INT UNSIGNED NOT NULL DEFAULT 0,
    qualifications VARCHAR(255) NULL,
    specialization VARCHAR(150) NULL,
    license_number VARCHAR(100) NULL,
    license_expiry_date DATE NULL,
    consultation_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    bio TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_doctor_profile_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. Create staff_profiles table
CREATE TABLE IF NOT EXISTS staff_profiles (
    user_id BIGINT UNSIGNED PRIMARY KEY,
    employee_id VARCHAR(50) NULL,
    shift_timing VARCHAR(100) NULL,
    permissions JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_staff_profile_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 4. Seed missing standard staff designations into global pool (hospital_id IS NULL)
INSERT IGNORE INTO designations (hospital_id, name, description, status) VALUES
(NULL, 'Receptionist', 'Front desk patient reception, registration and queue scheduling', 'active'),
(NULL, 'Nurse', 'General clinical nursing and outpatient care', 'active'),
(NULL, 'Accountant', 'Hospital billing, ledger settlements and financial accounting', 'active'),
(NULL, 'Lab Staff', 'Laboratory diagnostics and specimen collection staff', 'active');
