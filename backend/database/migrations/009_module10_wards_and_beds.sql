-- ============================================================================
-- Migration 009: Module 10 Ward and Bed Management
-- ============================================================================

USE hospital_management;

-- 1. Create wards table
CREATE TABLE IF NOT EXISTS wards (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hospital_id BIGINT UNSIGNED NOT NULL,
    department_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(120) NOT NULL,
    ward_type ENUM('general', 'semi_private', 'private', 'icu', 'emergency', 'maternity', 'pediatric', 'surgical') NOT NULL DEFAULT 'general',
    capacity INT UNSIGNED NOT NULL DEFAULT 10,
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_ward_hospital
        FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT,
    CONSTRAINT fk_ward_department
        FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
    CONSTRAINT uq_ward_hospital_dept_name
        UNIQUE (hospital_id, department_id, name),

    INDEX idx_ward_hospital_status (hospital_id, status),
    INDEX idx_ward_department (department_id)
);

-- 2. Create beds table
CREATE TABLE IF NOT EXISTS beds (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ward_id BIGINT UNSIGNED NOT NULL,
    bed_number VARCHAR(50) NOT NULL,
    bed_type ENUM('standard', 'icu', 'pediatric', 'bariatric', 'electric', 'ventilator_enabled') NOT NULL DEFAULT 'standard',
    daily_rate DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    status ENUM('available', 'occupied', 'maintenance') NOT NULL DEFAULT 'available',
    maintenance_reason VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_bed_ward
        FOREIGN KEY (ward_id) REFERENCES wards(id) ON DELETE RESTRICT,
    CONSTRAINT uq_bed_ward_number
        UNIQUE (ward_id, bed_number),

    INDEX idx_bed_ward_status (ward_id, status),
    INDEX idx_bed_status (status)
);

-- 3. Create bed_assignments table
-- Uses generated unique keys active_bed_key and active_admission_key to enforce
-- concurrency-safe single active assignment per bed and per admission at DB level.
CREATE TABLE IF NOT EXISTS bed_assignments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    bed_id BIGINT UNSIGNED NOT NULL,
    admission_id BIGINT UNSIGNED NOT NULL,
    patient_id BIGINT UNSIGNED NOT NULL,
    ward_id BIGINT UNSIGNED NOT NULL,
    hospital_id BIGINT UNSIGNED NOT NULL,
    assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    released_at DATETIME NULL,
    status ENUM('active', 'discharged', 'transferred') NOT NULL DEFAULT 'active',
    assigned_by BIGINT UNSIGNED NOT NULL,
    released_by BIGINT UNSIGNED NULL,
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Generated columns for unique constraints on active assignments only
    active_bed_key BIGINT UNSIGNED GENERATED ALWAYS AS (IF(status = 'active', bed_id, NULL)) VIRTUAL,
    active_admission_key BIGINT UNSIGNED GENERATED ALWAYS AS (IF(status = 'active', admission_id, NULL)) VIRTUAL,

    CONSTRAINT fk_assignment_bed
        FOREIGN KEY (bed_id) REFERENCES beds(id) ON DELETE RESTRICT,
    CONSTRAINT fk_assignment_admission
        FOREIGN KEY (admission_id) REFERENCES admissions(id) ON DELETE RESTRICT,
    CONSTRAINT fk_assignment_patient
        FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_assignment_ward
        FOREIGN KEY (ward_id) REFERENCES wards(id) ON DELETE RESTRICT,
    CONSTRAINT fk_assignment_hospital
        FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT,
    CONSTRAINT fk_assignment_assigned_by
        FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_assignment_released_by
        FOREIGN KEY (released_by) REFERENCES users(id) ON DELETE RESTRICT,

    CONSTRAINT uq_active_bed_assignment
        UNIQUE (active_bed_key),
    CONSTRAINT uq_active_admission_assignment
        UNIQUE (active_admission_key),

    INDEX idx_assignment_bed_status (bed_id, status),
    INDEX idx_assignment_admission_status (admission_id, status),
    INDEX idx_assignment_patient (patient_id),
    INDEX idx_assignment_hospital (hospital_id),
    INDEX idx_assignment_dates (assigned_at, released_at)
);

-- 4. Create bed_maintenance_logs table
CREATE TABLE IF NOT EXISTS bed_maintenance_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    bed_id BIGINT UNSIGNED NOT NULL,
    action ENUM('placed_in_maintenance', 'returned_to_service') NOT NULL,
    reason VARCHAR(255) NOT NULL,
    performed_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_maint_bed
        FOREIGN KEY (bed_id) REFERENCES beds(id) ON DELETE CASCADE,
    CONSTRAINT fk_maint_performed_by
        FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE RESTRICT,

    INDEX idx_maint_bed (bed_id),
    INDEX idx_maint_created (created_at)
);
