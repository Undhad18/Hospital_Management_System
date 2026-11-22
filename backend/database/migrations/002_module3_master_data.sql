-- Migration: 002_module3_master_data.sql
-- Purpose: Add Geographic Masters (countries, states, cities), Designations table, and Hospital Profile/Payment columns

-- 1. Create countries table
CREATE TABLE IF NOT EXISTS countries (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(10) NOT NULL UNIQUE,
    phone_code VARCHAR(10) NULL,
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2. Create states table
CREATE TABLE IF NOT EXISTS states (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    country_id INT UNSIGNED NOT NULL,
    name VARCHAR(120) NOT NULL,
    code VARCHAR(20) NULL,
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_state_country_name UNIQUE (country_id, name),
    CONSTRAINT fk_state_country FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE RESTRICT
);

-- 3. Create cities table
CREATE TABLE IF NOT EXISTS cities (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    state_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(120) NOT NULL,
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_city_state_name UNIQUE (state_id, name),
    CONSTRAINT fk_city_state FOREIGN KEY (state_id) REFERENCES states(id) ON DELETE RESTRICT
);

-- 4. Create designations table
CREATE TABLE IF NOT EXISTS designations (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hospital_id BIGINT UNSIGNED NULL,
    name VARCHAR(120) NOT NULL,
    description VARCHAR(255) NULL,
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_designation_hospital_name UNIQUE (hospital_id, name),
    CONSTRAINT fk_designation_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE
);

-- 5. Seed default countries, states, and cities if empty
INSERT IGNORE INTO countries (name, code, phone_code, status) VALUES
('India', 'IN', '+91', 'active'),
('United States', 'US', '+1', 'active'),
('United Kingdom', 'GB', '+44', 'active');

-- Seed states for India (id 1)
INSERT IGNORE INTO states (country_id, name, code, status)
SELECT c.id, 'Maharashtra', 'MH', 'active' FROM countries c WHERE c.code = 'IN'
UNION ALL
SELECT c.id, 'Gujarat', 'GJ', 'active' FROM countries c WHERE c.code = 'IN'
UNION ALL
SELECT c.id, 'Karnataka', 'KA', 'active' FROM countries c WHERE c.code = 'IN'
UNION ALL
SELECT c.id, 'Delhi', 'DL', 'active' FROM countries c WHERE c.code = 'IN';

-- Seed cities
INSERT IGNORE INTO cities (state_id, name, status)
SELECT s.id, 'Mumbai', 'active' FROM states s WHERE s.name = 'Maharashtra' AND s.country_id = (SELECT id FROM countries WHERE code = 'IN' LIMIT 1)
UNION ALL
SELECT s.id, 'Pune', 'active' FROM states s WHERE s.name = 'Maharashtra' AND s.country_id = (SELECT id FROM countries WHERE code = 'IN' LIMIT 1)
UNION ALL
SELECT s.id, 'Ahmedabad', 'active' FROM states s WHERE s.name = 'Gujarat' AND s.country_id = (SELECT id FROM countries WHERE code = 'IN' LIMIT 1)
UNION ALL
SELECT s.id, 'Surat', 'active' FROM states s WHERE s.name = 'Gujarat' AND s.country_id = (SELECT id FROM countries WHERE code = 'IN' LIMIT 1)
UNION ALL
SELECT s.id, 'Bengaluru', 'active' FROM states s WHERE s.name = 'Karnataka' AND s.country_id = (SELECT id FROM countries WHERE code = 'IN' LIMIT 1)
UNION ALL
SELECT s.id, 'New Delhi', 'active' FROM states s WHERE s.name = 'Delhi' AND s.country_id = (SELECT id FROM countries WHERE code = 'IN' LIMIT 1);

-- Seed baseline global designations (hospital_id is NULL)
INSERT IGNORE INTO designations (hospital_id, name, description, status) VALUES
(NULL, 'Consultant Physician', 'Senior consulting physician', 'active'),
(NULL, 'Surgeon', 'Specialist surgeon', 'active'),
(NULL, 'Senior Resident Doctor', 'Resident doctor in training/practice', 'active'),
(NULL, 'Staff Nurse', 'Registered nursing personnel', 'active'),
(NULL, 'Head Nurse', 'Nursing supervisor', 'active'),
(NULL, 'Pharmacist', 'Dispensary & pharmacy officer', 'active'),
(NULL, 'Lab Technician', 'Pathology & diagnostics technician', 'active'),
(NULL, 'Front Desk Executive', 'Reception & patient coordination', 'active');
