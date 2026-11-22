require("dotenv").config();
const fs = require("fs");
const path = require("path");
const pool = require("../db");

async function runMigration() {
  const connection = await pool.getConnection();
  try {
    console.log("=== Running Database Migrations ===");

    // --- MIGRATION 001: Users table additions ---
    const [userCols] = await connection.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
    `);
    const userColNames = userCols.map((c) => c.COLUMN_NAME);

    if (!userColNames.includes("must_change_password")) {
      console.log("Adding must_change_password column to users...");
      await connection.query(
        "ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE AFTER status"
      );
    }

    if (!userColNames.includes("token_version")) {
      console.log("Adding token_version column to users...");
      await connection.query(
        "ALTER TABLE users ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER must_change_password"
      );
    }

    console.log("Ensuring otp_verifications table exists...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS otp_verifications (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(190) NOT NULL,
        purpose ENUM('registration', 'password_reset') NOT NULL,
        token_hash VARCHAR(255) NOT NULL,
        expires_at DATETIME NOT NULL,
        attempts INT UNSIGNED NOT NULL DEFAULT 0,
        max_attempts INT UNSIGNED NOT NULL DEFAULT 5,
        consumed BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email_purpose (email, purpose),
        INDEX idx_expires_consumed (expires_at, consumed)
      )
    `);

    console.log("Ensuring audit_logs table exists...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        actor_id BIGINT UNSIGNED NULL,
        action VARCHAR(100) NOT NULL,
        target_type VARCHAR(50) NOT NULL,
        target_id BIGINT UNSIGNED NULL,
        details JSON NULL,
        ip_address VARCHAR(45) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_actor (actor_id),
        INDEX idx_action (action),
        INDEX idx_target (target_type, target_id)
      )
    `);

    // --- MIGRATION 002: Geographic Masters, Designations & Hospital Profile fields ---
    console.log("Ensuring countries, states, and cities tables exist...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS countries (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        code VARCHAR(10) NOT NULL UNIQUE,
        phone_code VARCHAR(10) NULL,
        status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
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
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS cities (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        state_id BIGINT UNSIGNED NOT NULL,
        name VARCHAR(120) NOT NULL,
        status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT uq_city_state_name UNIQUE (state_id, name),
        CONSTRAINT fk_city_state FOREIGN KEY (state_id) REFERENCES states(id) ON DELETE RESTRICT
      )
    `);

    console.log("Ensuring designations table exists...");
    await connection.query(`
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
      )
    `);

    // Hospital columns check and add
    const [hospCols] = await connection.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hospitals'
    `);
    const hospColNames = hospCols.map((c) => c.COLUMN_NAME);

    const hospitalColumnsToAdd = [
      { name: "postal_code", def: "VARCHAR(20) NULL AFTER address" },
      { name: "city_id", def: "BIGINT UNSIGNED NULL AFTER postal_code" },
      { name: "logo_url", def: "VARCHAR(255) NULL AFTER city_id" },
      { name: "image_url", def: "VARCHAR(255) NULL AFTER logo_url" },
      { name: "working_hours", def: "JSON NULL AFTER image_url" },
      { name: "upi_id", def: "VARCHAR(100) NULL AFTER working_hours" },
      { name: "payee_name", def: "VARCHAR(150) NULL AFTER upi_id" },
      { name: "qr_code_url", def: "TEXT NULL AFTER payee_name" },
    ];

    for (const col of hospitalColumnsToAdd) {
      if (!hospColNames.includes(col.name)) {
        console.log(`Adding ${col.name} column to hospitals...`);
        await connection.query(`ALTER TABLE hospitals ADD COLUMN ${col.name} ${col.def}`);
      }
    }

    // Add city foreign key if not already present
    const [fks] = await connection.query(`
      SELECT CONSTRAINT_NAME
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'hospitals'
        AND CONSTRAINT_NAME = 'fk_hospital_city'
    `);
    if (fks.length === 0) {
      console.log("Adding foreign key fk_hospital_city to hospitals...");
      try {
        await connection.query(`
          ALTER TABLE hospitals
          ADD CONSTRAINT fk_hospital_city
          FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE RESTRICT
        `);
      } catch (fkErr) {
        console.warn("Notice on fk_hospital_city:", fkErr.message);
      }
    }

    // Seed master data
    console.log("Seeding baseline geographic and designation masters...");
    await connection.query(`
      INSERT IGNORE INTO countries (name, code, phone_code, status) VALUES
      ('India', 'IN', '+91', 'active'),
      ('United States', 'US', '+1', 'active'),
      ('United Kingdom', 'GB', '+44', 'active')
    `);

    await connection.query(`
      INSERT IGNORE INTO states (country_id, name, code, status)
      SELECT c.id, 'Maharashtra', 'MH', 'active' FROM countries c WHERE c.code = 'IN'
      UNION ALL
      SELECT c.id, 'Gujarat', 'GJ', 'active' FROM countries c WHERE c.code = 'IN'
      UNION ALL
      SELECT c.id, 'Karnataka', 'KA', 'active' FROM countries c WHERE c.code = 'IN'
      UNION ALL
      SELECT c.id, 'Delhi', 'DL', 'active' FROM countries c WHERE c.code = 'IN'
    `);

    await connection.query(`
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
      SELECT s.id, 'New Delhi', 'active' FROM states s WHERE s.name = 'Delhi' AND s.country_id = (SELECT id FROM countries WHERE code = 'IN' LIMIT 1)
    `);

    const standardDesignations = [
      ['Consultant Physician', 'Senior consulting physician', 'active'],
      ['Surgeon', 'Specialist surgeon', 'active'],
      ['Senior Resident Doctor', 'Resident doctor in training/practice', 'active'],
      ['Staff Nurse', 'Registered nursing personnel', 'active'],
      ['Head Nurse', 'Nursing supervisor', 'active'],
      ['Pharmacist', 'Dispensary & pharmacy officer', 'active'],
      ['Lab Technician', 'Pathology & diagnostics technician', 'active'],
      ['Front Desk Executive', 'Reception & patient coordination', 'active'],
    ];

    for (const [dName, dDesc, dStatus] of standardDesignations) {
      await connection.query(
        `INSERT INTO designations (hospital_id, name, description, status)
         SELECT NULL, ?, ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM designations WHERE hospital_id IS NULL AND name = ?
         )`,
        [dName, dDesc, dStatus, dName]
      );
    }

    // --- MIGRATION 003: Module 4 Departments, Doctors & Staff ---
    console.log("=== Running Migration 003: Module 4 Tables & Columns ===");
    
    // 1. Create master_departments table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS master_departments (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL UNIQUE,
        code VARCHAR(50) NOT NULL UNIQUE,
        description TEXT NULL,
        status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Seed master departments
    await connection.query(`
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
      ('General Medicine', 'GENMED', 'Primary healthcare, internal medicine & chronic care', 'active')
    `);

    // 2. Add master_department_id to departments table
    const [deptCols] = await connection.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'departments'
    `);
    const deptColNames = deptCols.map((c) => c.COLUMN_NAME);

    if (!deptColNames.includes("master_department_id")) {
      console.log("Adding master_department_id column to departments...");
      await connection.query(`
        ALTER TABLE departments
        ADD COLUMN master_department_id INT UNSIGNED NULL AFTER hospital_id
      `);
      try {
        await connection.query(`
          ALTER TABLE departments
          ADD CONSTRAINT fk_dept_master_dept
          FOREIGN KEY (master_department_id) REFERENCES master_departments(id) ON DELETE SET NULL
        `);
      } catch (fkErr) {
        console.warn("Notice on fk_dept_master_dept:", fkErr.message);
      }
    }

    // 3. Add designation_id and credential delivery columns to users table
    const [latestUserCols] = await connection.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
    `);
    const latestUserColNames = latestUserCols.map((c) => c.COLUMN_NAME);

    if (!latestUserColNames.includes("designation_id")) {
      console.log("Adding designation_id column to users...");
      await connection.query(`
        ALTER TABLE users
        ADD COLUMN designation_id BIGINT UNSIGNED NULL AFTER department_id
      `);
      try {
        await connection.query(`
          ALTER TABLE users
          ADD CONSTRAINT fk_user_designation
          FOREIGN KEY (designation_id) REFERENCES designations(id) ON DELETE SET NULL
        `);
      } catch (fkErr) {
        console.warn("Notice on fk_user_designation:", fkErr.message);
      }
    }

    if (!latestUserColNames.includes("credentials_sent_at")) {
      console.log("Adding credentials_sent_at column to users...");
      await connection.query(`
        ALTER TABLE users
        ADD COLUMN credentials_sent_at DATETIME NULL AFTER must_change_password
      `);
    }

    if (!latestUserColNames.includes("credential_delivery_status")) {
      console.log("Adding credential_delivery_status column to users...");
      await connection.query(`
        ALTER TABLE users
        ADD COLUMN credential_delivery_status ENUM('not_sent', 'sent', 'failed') NOT NULL DEFAULT 'not_sent' AFTER credentials_sent_at
      `);
    }

    // 4. Create doctor_profiles table
    console.log("Ensuring doctor_profiles table exists...");
    await connection.query(`
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
      )
    `);

    // 5. Create staff_profiles table
    console.log("Ensuring staff_profiles table exists...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS staff_profiles (
        user_id BIGINT UNSIGNED PRIMARY KEY,
        employee_id VARCHAR(50) NULL,
        shift_timing VARCHAR(100) NULL,
        permissions JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_staff_profile_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // 6. Seed missing standard staff designations
    console.log("Seeding standard staff designations...");
    const staffDesignations = [
      ['Receptionist', 'Front desk patient reception, registration and queue scheduling', 'active'],
      ['Nurse', 'General clinical nursing and outpatient care', 'active'],
      ['Accountant', 'Hospital billing, ledger settlements and financial accounting', 'active'],
      ['Lab Staff', 'Laboratory diagnostics and specimen collection staff', 'active'],
    ];

    for (const [dName, dDesc, dStatus] of staffDesignations) {
      await connection.query(
        `INSERT INTO designations (hospital_id, name, description, status)
         SELECT NULL, ?, ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM designations WHERE hospital_id IS NULL AND name = ?
         )`,
        [dName, dDesc, dStatus, dName]
      );
    }

    // --- MIGRATION 004: Module 5 Patient Registration, Profiles, Appointments & Medical Records ---
    console.log("=== Running Migration 004: Module 5 Tables & Columns ===");

    // 1. Add google_id to users
    const [m5UserCols] = await connection.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
    `);
    const m5UserColNames = m5UserCols.map((c) => c.COLUMN_NAME);

    if (!m5UserColNames.includes("google_id")) {
      console.log("Adding google_id column to users...");
      await connection.query(`
        ALTER TABLE users
        ADD COLUMN google_id VARCHAR(100) NULL UNIQUE AFTER email
      `);
    }

    // 2. Create patient_profiles table
    console.log("Ensuring patient_profiles table exists...");
    await connection.query(`
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
      )
    `);

    // 3. Create appointments table
    console.log("Ensuring appointments table exists...");
    await connection.query(`
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
      )
    `);

    // 4. Create patient_medical_records table
    console.log("Ensuring patient_medical_records table exists...");
    await connection.query(`
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
      )
    `);

    // --- MIGRATION 005: Module 6 Appointment Booking, Doctor Schedules, and Queue Management ---
    console.log("Ensuring Module 6 appointments modifications exist...");
    await connection.query(`
      ALTER TABLE appointments
      MODIFY COLUMN status ENUM('pending', 'confirmed', 'rejected', 'in_waiting', 'in_progress', 'completed', 'cancelled', 'admitted') NOT NULL DEFAULT 'pending'
    `);

    const [apptCols] = await connection.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments'
    `);
    const apptColNames = apptCols.map((c) => c.COLUMN_NAME);

    const apptColumnsToAdd = [
      { name: "appointment_type", def: "ENUM('routine_checkup', 'consultation', 'follow_up', 'emergency') NOT NULL DEFAULT 'consultation' AFTER appointment_time" },
      { name: "appointment_mode", def: "ENUM('in_person', 'video_consultation') NOT NULL DEFAULT 'in_person' AFTER appointment_type" },
      { name: "start_time", def: "TIME NULL AFTER appointment_mode" },
      { name: "end_time", def: "TIME NULL AFTER start_time" },
      { name: "follow_up_to_id", def: "BIGINT UNSIGNED NULL AFTER bill_id, ADD CONSTRAINT fk_appointment_follow_up FOREIGN KEY (follow_up_to_id) REFERENCES appointments(id) ON DELETE SET NULL" },
      { name: "queue_number", def: "VARCHAR(20) NULL AFTER follow_up_to_id" },
      { name: "check_in_time", def: "DATETIME NULL AFTER queue_number" },
      { name: "checked_in_by", def: "BIGINT UNSIGNED NULL AFTER check_in_time, ADD CONSTRAINT fk_appointment_checked_in_by FOREIGN KEY (checked_in_by) REFERENCES users(id) ON DELETE SET NULL" },
      { name: "rejection_reason", def: "VARCHAR(255) NULL AFTER checked_in_by" },
      { name: "cancellation_reason", def: "VARCHAR(255) NULL AFTER rejection_reason" },
      { name: "cancelled_by", def: "BIGINT UNSIGNED NULL AFTER cancellation_reason, ADD CONSTRAINT fk_appointment_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL" },
      { name: "status_changed_by", def: "BIGINT UNSIGNED NULL AFTER cancelled_by, ADD CONSTRAINT fk_appointment_status_changed_by FOREIGN KEY (status_changed_by) REFERENCES users(id) ON DELETE SET NULL" },
      { name: "booked_by_staff_id", def: "BIGINT UNSIGNED NULL AFTER status_changed_by, ADD CONSTRAINT fk_appointment_booked_by_staff FOREIGN KEY (booked_by_staff_id) REFERENCES users(id) ON DELETE SET NULL" },
    ];

    for (const col of apptColumnsToAdd) {
      if (!apptColNames.includes(col.name)) {
        console.log(`Adding ${col.name} column to appointments...`);
        try {
          await connection.query(`ALTER TABLE appointments ADD COLUMN ${col.name} ${col.def}`);
        } catch (colErr) {
          console.warn(`Warning adding ${col.name} to appointments:`, colErr.message);
        }
      }
    }

    console.log("Ensuring doctor_schedules table exists...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS doctor_schedules (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        doctor_id BIGINT UNSIGNED NOT NULL,
        hospital_id BIGINT UNSIGNED NOT NULL,
        day_of_week ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday') NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        slot_duration_minutes INT UNSIGNED NOT NULL DEFAULT 30,
        break_start TIME NULL,
        break_end TIME NULL,
        is_available BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_schedule_doctor FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_schedule_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE,
        CONSTRAINT uq_doctor_day UNIQUE (doctor_id, day_of_week),
        INDEX idx_schedule_doctor (doctor_id),
        INDEX idx_schedule_hospital (hospital_id)
      )
    `);

    console.log("Ensuring doctor_leaves table exists...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS doctor_leaves (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        doctor_id BIGINT UNSIGNED NOT NULL,
        leave_date DATE NOT NULL,
        reason VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_leave_doctor FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT uq_doctor_leave UNIQUE (doctor_id, leave_date),
        INDEX idx_leave_doctor_date (doctor_id, leave_date)
      )
    `);

    // --- MIGRATION 006: Module 7 Notifications & Email Automation ---
    console.log("=== Running Migration 006: Module 7 Notifications & Email Automation ===");
    console.log("Ensuring notifications table exists...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        recipient_email VARCHAR(190) NOT NULL,
        recipient_user_id BIGINT UNSIGNED NULL,
        hospital_id BIGINT UNSIGNED NULL,
        appointment_id BIGINT UNSIGNED NULL,
        notification_type VARCHAR(60) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        body_text TEXT NOT NULL,
        body_html MEDIUMTEXT NULL,
        status ENUM('pending', 'processing', 'sent', 'failed') NOT NULL DEFAULT 'pending',
        attempts INT UNSIGNED NOT NULL DEFAULT 0,
        max_attempts INT UNSIGNED NOT NULL DEFAULT 3,
        last_attempt_at DATETIME NULL,
        sent_at DATETIME NULL,
        failed_at DATETIME NULL,
        next_retry_at DATETIME NULL,
        provider_message_id VARCHAR(120) NULL,
        error_message VARCHAR(500) NULL,
        idempotency_key VARCHAR(190) UNIQUE NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_notification_user FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT fk_notification_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE SET NULL,
        CONSTRAINT fk_notification_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
        INDEX idx_status_retry (status, next_retry_at),
        INDEX idx_recipient_email (recipient_email),
        INDEX idx_notification_appointment (appointment_id),
        INDEX idx_notification_hospital (hospital_id),
        INDEX idx_created_at (created_at)
      )
    `);

    const [apptColsForM7] = await connection.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments'
    `);
    const apptColNamesM7 = apptColsForM7.map((c) => c.COLUMN_NAME);

    if (!apptColNamesM7.includes("reminder_sent_at")) {
      console.log("Adding reminder_sent_at column to appointments...");
      try {
        await connection.query(`
          ALTER TABLE appointments
          ADD COLUMN reminder_sent_at DATETIME NULL AFTER status_changed_by
        `);
      } catch (colErr) {
        console.warn("Warning adding reminder_sent_at to appointments:", colErr.message);
      }
    }

    // --- MIGRATION 007: Module 8 Daily Consultation & Follow-up Management ---
    console.log("=== Running Migration 007: Module 8 Consultations & Clinical Workflow ===");

    await connection.query(`
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
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS master_lab_tests (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        test_name VARCHAR(150) NOT NULL,
        category VARCHAR(100) NOT NULL DEFAULT 'Pathology',
        sample_type VARCHAR(100) NULL,
        standard_turnaround_hours INT UNSIGNED NOT NULL DEFAULT 24,
        status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_test_name (test_name)
      )
    `);

    // Seed master medicines
    const initialMedicines = [
      ['Paracetamol', 'Acetaminophen', 'Tablet', '500 mg', 'Analgesics / Antipyretics'],
      ['Paracetamol 650', 'Acetaminophen', 'Tablet', '650 mg', 'Analgesics / Antipyretics'],
      ['Amoxicillin', 'Amoxicillin Trihydrate', 'Capsule', '500 mg', 'Antibiotics'],
      ['Augmentin', 'Amoxicillin + Clavulanic Acid', 'Tablet', '625 mg', 'Antibiotics'],
      ['Metformin', 'Metformin Hydrochloride', 'Tablet', '500 mg', 'Antidiabetic'],
      ['Atorvastatin', 'Atorvastatin Calcium', 'Tablet', '10 mg', 'Cardiovascular / Statins'],
      ['Amlodipine', 'Amlodipine Besylate', 'Tablet', '5 mg', 'Antihypertensive'],
      ['Pantoprazole', 'Pantoprazole Sodium', 'Tablet', '40 mg', 'Gastrointestinal / PPI'],
      ['Omeprazole', 'Omeprazole', 'Capsule', '20 mg', 'Gastrointestinal / PPI'],
      ['Azithromycin', 'Azithromycin Dihydrate', 'Tablet', '500 mg', 'Antibiotics'],
      ['Cetirizine', 'Cetirizine Dihydrochloride', 'Tablet', '10 mg', 'Antihistamines / Allergy'],
      ['Ibuprofen', 'Ibuprofen', 'Tablet', '400 mg', 'NSAIDs / Pain Relief'],
      ['Oral Rehydration Salts (ORS)', 'Electrolyte Solution', 'Powder', '21.8 g sachet', 'Electrolytes'],
      ['Salbutamol Inhaler', 'Albuterol', 'Inhaler', '100 mcg/dose', 'Respiratory / Bronchodilator'],
      ['Cough Syrup (Dextromethorphan)', 'Dextromethorphan HBr', 'Syrup', '100 ml', 'Respiratory / Antitussive']
    ];

    for (const [mName, mGen, mForm, mStr, mCat] of initialMedicines) {
      await connection.query(
        `INSERT INTO master_medicines (name, generic_name, form, strength, category, status)
         SELECT ?, ?, ?, ?, ?, 'active'
         WHERE NOT EXISTS (
           SELECT 1 FROM master_medicines WHERE name = ?
         )`,
        [mName, mGen, mForm, mStr, mCat, mName]
      );
    }

    // Seed master lab tests
    const initialLabTests = [
      ['Complete Blood Count (CBC)', 'Hematology', 'Whole Blood (EDTA)', 6],
      ['Fasting Blood Sugar (FBS)', 'Biochemistry', 'Fluoride Plasma', 4],
      ['Postprandial Blood Sugar (PPBS)', 'Biochemistry', 'Fluoride Plasma', 4],
      ['HbA1c (Glycated Hemoglobin)', 'Biochemistry', 'Whole Blood (EDTA)', 8],
      ['Lipid Profile (Cholesterol, HDL, LDL, TG)', 'Biochemistry', 'Serum', 12],
      ['Liver Function Test (LFT)', 'Biochemistry', 'Serum', 12],
      ['Kidney Function Test (KFT / RFT)', 'Biochemistry', 'Serum', 12],
      ['Thyroid Stimulating Hormone (TSH)', 'Endocrinology', 'Serum', 24],
      ['Urine Routine & Microscopic Examination', 'Clinical Pathology', 'Clean Catch Urine', 4],
      ['Serum Electrolytes (Na+, K+, Cl-)', 'Biochemistry', 'Serum', 6],
      ['Chest X-Ray PA View', 'Radiology & Imaging', 'Digital Radiography', 2],
      ['ECG 12-Lead Standard', 'Cardiology Diagnostics', 'Direct Electrodes', 1],
      ['Ultrasound Abdomen & Pelvis', 'Radiology & Imaging', 'Sonography', 4],
      ['Troponin I (High Sensitivity)', 'Cardiology Biomarkers', 'Serum', 2],
      ['Serum Uric Acid', 'Biochemistry', 'Serum', 8]
    ];

    for (const [tName, tCat, tSample, tTurnaround] of initialLabTests) {
      await connection.query(
        `INSERT INTO master_lab_tests (test_name, category, sample_type, standard_turnaround_hours, status)
         SELECT ?, ?, ?, ?, 'active'
         WHERE NOT EXISTS (
           SELECT 1 FROM master_lab_tests WHERE test_name = ?
         )`,
        [tName, tCat, tSample, tTurnaround, tName]
      );
    }

    // Create consultations table
    await connection.query(`
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
        CONSTRAINT fk_consultation_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
        CONSTRAINT fk_consultation_patient FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT fk_consultation_doctor FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT fk_consultation_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT,
        INDEX idx_consultation_doctor (doctor_id, started_at),
        INDEX idx_consultation_patient (patient_id, started_at),
        INDEX idx_consultation_hospital (hospital_id, started_at),
        INDEX idx_consultation_status (status)
      )
    `);

    // Create consultation_vitals table
    await connection.query(`
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
        CONSTRAINT fk_vitals_consultation FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE,
        CONSTRAINT fk_vitals_patient FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT fk_vitals_recorded_by FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE RESTRICT,
        INDEX idx_vitals_consultation (consultation_id),
        INDEX idx_vitals_patient (patient_id)
      )
    `);

    // Create investigation_requests table
    await connection.query(`
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
        CONSTRAINT fk_inv_consultation FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE,
        CONSTRAINT fk_inv_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
        CONSTRAINT fk_inv_patient FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT fk_inv_doctor FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT fk_inv_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT,
        INDEX idx_inv_consultation (consultation_id),
        INDEX idx_inv_appointment (appointment_id),
        INDEX idx_inv_patient (patient_id),
        INDEX idx_inv_hospital (hospital_id, status)
      )
    `);

    // Create prescriptions table
    await connection.query(`
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
        CONSTRAINT fk_rx_consultation FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE,
        CONSTRAINT fk_rx_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
        CONSTRAINT fk_rx_patient FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT fk_rx_doctor FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT fk_rx_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT,
        INDEX idx_rx_consultation (consultation_id),
        INDEX idx_rx_appointment (appointment_id),
        INDEX idx_rx_patient (patient_id)
      )
    `);

    // Create prescription_items table
    await connection.query(`
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
        CONSTRAINT fk_rx_item_prescription FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON DELETE CASCADE,
        INDEX idx_rx_item_prescription (prescription_id)
      )
    `);

    // --- MIGRATION 008: Module 9 Patient Admissions & Status History ---
    console.log("Ensuring admissions table exists...");
    await connection.query(`
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
        CONSTRAINT fk_admission_patient FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT fk_admission_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT,
        CONSTRAINT fk_admission_doctor FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT fk_admission_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
        CONSTRAINT fk_admission_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
        CONSTRAINT fk_admission_admitted_by FOREIGN KEY (admitted_by) REFERENCES users(id) ON DELETE RESTRICT,
        INDEX idx_admission_patient_status (patient_id, status),
        INDEX idx_admission_hospital_status (hospital_id, status),
        INDEX idx_admission_doctor (doctor_id),
        INDEX idx_admission_date (admission_date)
      )
    `);

    console.log("Ensuring admission_status_history table exists...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS admission_status_history (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        admission_id BIGINT UNSIGNED NOT NULL,
        previous_status ENUM('pending', 'admitted', 'discharged', 'cancelled') NULL,
        new_status ENUM('pending', 'admitted', 'discharged', 'cancelled') NOT NULL,
        changed_by BIGINT UNSIGNED NOT NULL,
        change_reason VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_history_admission FOREIGN KEY (admission_id) REFERENCES admissions(id) ON DELETE CASCADE,
        CONSTRAINT fk_history_changed_by FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE RESTRICT,
        INDEX idx_history_admission (admission_id),
        INDEX idx_history_created (created_at)
      )
    `);

    // --- MIGRATION 009: Module 10 Ward and Bed Management ---
    console.log("Ensuring wards table exists...");
    await connection.query(`
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
        CONSTRAINT fk_ward_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT,
        CONSTRAINT fk_ward_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
        CONSTRAINT uq_ward_hospital_dept_name UNIQUE (hospital_id, department_id, name),
        INDEX idx_ward_hospital_status (hospital_id, status),
        INDEX idx_ward_department (department_id)
      )
    `);

    console.log("Ensuring beds table exists...");
    await connection.query(`
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
        CONSTRAINT fk_bed_ward FOREIGN KEY (ward_id) REFERENCES wards(id) ON DELETE RESTRICT,
        CONSTRAINT uq_bed_ward_number UNIQUE (ward_id, bed_number),
        INDEX idx_bed_ward_status (ward_id, status),
        INDEX idx_bed_status (status)
      )
    `);

    console.log("Ensuring bed_assignments table exists...");
    await connection.query(`
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
        active_bed_key BIGINT UNSIGNED GENERATED ALWAYS AS (IF(status = 'active', bed_id, NULL)) VIRTUAL,
        active_admission_key BIGINT UNSIGNED GENERATED ALWAYS AS (IF(status = 'active', admission_id, NULL)) VIRTUAL,
        CONSTRAINT fk_assignment_bed FOREIGN KEY (bed_id) REFERENCES beds(id) ON DELETE RESTRICT,
        CONSTRAINT fk_assignment_admission FOREIGN KEY (admission_id) REFERENCES admissions(id) ON DELETE RESTRICT,
        CONSTRAINT fk_assignment_patient FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT fk_assignment_ward FOREIGN KEY (ward_id) REFERENCES wards(id) ON DELETE RESTRICT,
        CONSTRAINT fk_assignment_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT,
        CONSTRAINT fk_assignment_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT fk_assignment_released_by FOREIGN KEY (released_by) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT uq_active_bed_assignment UNIQUE (active_bed_key),
        CONSTRAINT uq_active_admission_assignment UNIQUE (active_admission_key),
        INDEX idx_assignment_bed_status (bed_id, status),
        INDEX idx_assignment_admission_status (admission_id, status),
        INDEX idx_assignment_patient (patient_id),
        INDEX idx_assignment_hospital (hospital_id),
        INDEX idx_assignment_dates (assigned_at, released_at)
      )
    `);

    console.log("Ensuring bed_maintenance_logs table exists...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS bed_maintenance_logs (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        bed_id BIGINT UNSIGNED NOT NULL,
        action ENUM('placed_in_maintenance', 'returned_to_service') NOT NULL,
        reason VARCHAR(255) NOT NULL,
        performed_by BIGINT UNSIGNED NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_maint_bed FOREIGN KEY (bed_id) REFERENCES beds(id) ON DELETE CASCADE,
        CONSTRAINT fk_maint_performed_by FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE RESTRICT,
        INDEX idx_maint_bed (bed_id),
        INDEX idx_maint_created (created_at)
      )
    `);

    // --- MIGRATION 010: Module 11 Laboratory and Investigation Management ---
    console.log("Applying Module 11 schema updates...");

    // 1. master_lab_tests columns
    const [mltCols] = await connection.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'master_lab_tests'
    `);
    const mltColNames = mltCols.map((c) => c.COLUMN_NAME);

    if (!mltColNames.includes("test_code")) {
      console.log("Adding test_code column to master_lab_tests...");
      await connection.query("ALTER TABLE master_lab_tests ADD COLUMN test_code VARCHAR(50) NULL AFTER id");
    }
    if (!mltColNames.includes("description")) {
      console.log("Adding description column to master_lab_tests...");
      await connection.query("ALTER TABLE master_lab_tests ADD COLUMN description TEXT NULL AFTER sample_type");
    }
    if (!mltColNames.includes("instructions")) {
      console.log("Adding instructions column to master_lab_tests...");
      await connection.query("ALTER TABLE master_lab_tests ADD COLUMN instructions TEXT NULL AFTER description");
    }
    if (!mltColNames.includes("updated_at")) {
      console.log("Adding updated_at column to master_lab_tests...");
      await connection.query("ALTER TABLE master_lab_tests ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at");
    }

    // Backfill standard test codes
    await connection.query("UPDATE master_lab_tests SET test_code = 'CBC-001' WHERE id = 1 AND (test_code IS NULL OR test_code = '')");
    await connection.query("UPDATE master_lab_tests SET test_code = 'FBS-002' WHERE id = 2 AND (test_code IS NULL OR test_code = '')");
    await connection.query("UPDATE master_lab_tests SET test_code = 'PPBS-003' WHERE id = 3 AND (test_code IS NULL OR test_code = '')");
    await connection.query("UPDATE master_lab_tests SET test_code = 'HBA1C-004' WHERE id = 4 AND (test_code IS NULL OR test_code = '')");
    await connection.query("UPDATE master_lab_tests SET test_code = 'LIPID-005' WHERE id = 5 AND (test_code IS NULL OR test_code = '')");
    await connection.query("UPDATE master_lab_tests SET test_code = 'LFT-006' WHERE id = 6 AND (test_code IS NULL OR test_code = '')");
    await connection.query("UPDATE master_lab_tests SET test_code = 'KFT-007' WHERE id = 7 AND (test_code IS NULL OR test_code = '')");
    await connection.query("UPDATE master_lab_tests SET test_code = 'TSH-008' WHERE id = 8 AND (test_code IS NULL OR test_code = '')");
    await connection.query("UPDATE master_lab_tests SET test_code = 'URINE-009' WHERE id = 9 AND (test_code IS NULL OR test_code = '')");
    await connection.query("UPDATE master_lab_tests SET test_code = 'ELYTE-010' WHERE id = 10 AND (test_code IS NULL OR test_code = '')");
    await connection.query("UPDATE master_lab_tests SET test_code = 'CXR-011' WHERE id = 11 AND (test_code IS NULL OR test_code = '')");
    await connection.query("UPDATE master_lab_tests SET test_code = 'ECG-012' WHERE id = 12 AND (test_code IS NULL OR test_code = '')");
    await connection.query("UPDATE master_lab_tests SET test_code = 'USG-013' WHERE id = 13 AND (test_code IS NULL OR test_code = '')");
    await connection.query("UPDATE master_lab_tests SET test_code = 'TROP-014' WHERE id = 14 AND (test_code IS NULL OR test_code = '')");
    await connection.query("UPDATE master_lab_tests SET test_code = 'URIC-015' WHERE id = 15 AND (test_code IS NULL OR test_code = '')");
    await connection.query("UPDATE master_lab_tests SET test_code = CONCAT('TEST-', LPAD(id, 4, '0')) WHERE test_code IS NULL OR test_code = ''");

    // Check unique index on master_lab_tests(test_code)
    const [mltIndexes] = await connection.query(`
      SHOW INDEX FROM master_lab_tests WHERE Key_name = 'uq_master_test_code'
    `);
    if (!mltIndexes.length) {
      console.log("Adding unique index uq_master_test_code...");
      await connection.query("ALTER TABLE master_lab_tests ADD UNIQUE INDEX uq_master_test_code (test_code)");
    }

    // 2. hospital_lab_tests table
    console.log("Ensuring hospital_lab_tests table exists...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS hospital_lab_tests (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        hospital_id BIGINT UNSIGNED NOT NULL,
        master_test_id BIGINT UNSIGNED NOT NULL,
        price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_hlt_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT,
        CONSTRAINT fk_hlt_master_test FOREIGN KEY (master_test_id) REFERENCES master_lab_tests(id) ON DELETE RESTRICT,
        CONSTRAINT uq_hospital_master_test UNIQUE (hospital_id, master_test_id),
        INDEX idx_hlt_hospital_status (hospital_id, status),
        INDEX idx_hlt_master_test (master_test_id)
      )
    `);

    // 3. investigation_requests column additions
    const [irCols] = await connection.query(`
      SELECT COLUMN_NAME, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'investigation_requests'
    `);
    const irColMap = {};
    for (const c of irCols) irColMap[c.COLUMN_NAME] = c.IS_NULLABLE;

    if (irColMap["consultation_id"] === "NO") {
      console.log("Making consultation_id nullable in investigation_requests...");
      await connection.query("ALTER TABLE investigation_requests MODIFY consultation_id BIGINT UNSIGNED NULL");
    }
    if (irColMap["appointment_id"] === "NO") {
      console.log("Making appointment_id nullable in investigation_requests...");
      await connection.query("ALTER TABLE investigation_requests MODIFY appointment_id BIGINT UNSIGNED NULL");
    }
    if (!irColMap.hasOwnProperty("order_number")) {
      console.log("Adding order_number to investigation_requests...");
      await connection.query("ALTER TABLE investigation_requests ADD COLUMN order_number VARCHAR(50) NULL AFTER id");
    }
    if (!irColMap.hasOwnProperty("master_test_id")) {
      console.log("Adding master_test_id to investigation_requests...");
      await connection.query("ALTER TABLE investigation_requests ADD COLUMN master_test_id BIGINT UNSIGNED NULL AFTER hospital_id");
    }
    if (!irColMap.hasOwnProperty("price")) {
      console.log("Adding price to investigation_requests...");
      await connection.query("ALTER TABLE investigation_requests ADD COLUMN price DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER clinical_notes");
    }
    if (!irColMap.hasOwnProperty("payment_status")) {
      console.log("Adding payment_status to investigation_requests...");
      await connection.query("ALTER TABLE investigation_requests ADD COLUMN payment_status ENUM('unpaid', 'paid', 'waived', 'refunded') NOT NULL DEFAULT 'unpaid' AFTER price");
    }
    if (!irColMap.hasOwnProperty("sample_collected_at")) {
      console.log("Adding sample_collected_at to investigation_requests...");
      await connection.query("ALTER TABLE investigation_requests ADD COLUMN sample_collected_at DATETIME NULL AFTER status");
    }
    if (!irColMap.hasOwnProperty("completed_at")) {
      console.log("Adding completed_at to investigation_requests...");
      await connection.query("ALTER TABLE investigation_requests ADD COLUMN completed_at DATETIME NULL AFTER sample_collected_at");
    }
    if (!irColMap.hasOwnProperty("cancelled_at")) {
      console.log("Adding cancelled_at to investigation_requests...");
      await connection.query("ALTER TABLE investigation_requests ADD COLUMN cancelled_at DATETIME NULL AFTER completed_at");
    }
    if (!irColMap.hasOwnProperty("cancellation_reason")) {
      console.log("Adding cancellation_reason to investigation_requests...");
      await connection.query("ALTER TABLE investigation_requests ADD COLUMN cancellation_reason VARCHAR(255) NULL AFTER cancelled_at");
    }

    await connection.query("UPDATE investigation_requests SET order_number = CONCAT('LAB-', DATE_FORMAT(created_at, '%Y%m%d'), '-', LPAD(id, 4, '0')) WHERE order_number IS NULL OR order_number = ''");

    const [irIndexes] = await connection.query(`
      SHOW INDEX FROM investigation_requests WHERE Key_name = 'uq_inv_order_number'
    `);
    if (!irIndexes.length) {
      console.log("Adding unique index uq_inv_order_number...");
      await connection.query("ALTER TABLE investigation_requests ADD UNIQUE INDEX uq_inv_order_number (order_number)");
    }

    // 4. lab_reports table
    console.log("Ensuring lab_reports table exists...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS lab_reports (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        order_id BIGINT UNSIGNED NOT NULL,
        patient_id BIGINT UNSIGNED NOT NULL,
        hospital_id BIGINT UNSIGNED NOT NULL,
        report_number VARCHAR(50) NOT NULL UNIQUE,
        storage_key VARCHAR(255) NOT NULL,
        original_filename VARCHAR(255) NOT NULL,
        file_size INT UNSIGNED NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        file_hash VARCHAR(64) NOT NULL,
        version INT UNSIGNED NOT NULL DEFAULT 1,
        uploaded_by BIGINT UNSIGNED NOT NULL,
        status ENUM('final', 'preliminary', 'amended') NOT NULL DEFAULT 'final',
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_report_order FOREIGN KEY (order_id) REFERENCES investigation_requests(id) ON DELETE RESTRICT,
        CONSTRAINT fk_report_patient FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT fk_report_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT,
        CONSTRAINT fk_report_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT,
        INDEX idx_report_order (order_id),
        INDEX idx_report_patient (patient_id),
        INDEX idx_report_hospital (hospital_id),
        INDEX idx_report_hash (order_id, file_hash)
      )
    `);

    // 5. lab_payments table
    console.log("Ensuring lab_payments table exists...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS lab_payments (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        order_id BIGINT UNSIGNED NOT NULL,
        patient_id BIGINT UNSIGNED NOT NULL,
        hospital_id BIGINT UNSIGNED NOT NULL,
        receipt_number VARCHAR(50) NOT NULL UNIQUE,
        amount DECIMAL(10, 2) NOT NULL,
        payment_method ENUM('cash', 'upi', 'card') NOT NULL DEFAULT 'cash',
        transaction_reference VARCHAR(100) NULL,
        payment_status ENUM('paid', 'refunded') NOT NULL DEFAULT 'paid',
        collected_by BIGINT UNSIGNED NOT NULL,
        notes VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_lab_pay_order FOREIGN KEY (order_id) REFERENCES investigation_requests(id) ON DELETE RESTRICT,
        CONSTRAINT fk_lab_pay_patient FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT fk_lab_pay_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE RESTRICT,
        CONSTRAINT fk_lab_pay_collected_by FOREIGN KEY (collected_by) REFERENCES users(id) ON DELETE RESTRICT,
        INDEX idx_lab_pay_order (order_id),
        INDEX idx_lab_pay_patient (patient_id),
        INDEX idx_lab_pay_hospital (hospital_id)
      )
    `);

    // --- MIGRATION 011: Module 12 Medicine Category, Inventory, Suppliers, Batches & Dispensing ---
    console.log("=== Running Migration 011: Medicine Category and Inventory Management ===");
    console.log("Ensuring medicine_categories table exists...");
    await connection.query(`
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
      )
    `);

    const standardCategories = [
      ['Analgesics / Antipyretics', 'Pain relievers and fever reducing medications', 'active'],
      ['Antibiotics', 'Antimicrobial and bacterial infection treatments', 'active'],
      ['Antidiabetic', 'Blood glucose lowering and insulin management agents', 'active'],
      ['Cardiovascular / Statins', 'Cholesterol, lipid lowering, and cardiac health agents', 'active'],
      ['Antihypertensive', 'Blood pressure management medications', 'active'],
      ['Gastrointestinal / PPI', 'Proton pump inhibitors and gastric acid reducers', 'active'],
      ['Antihistamines / Allergy', 'Anti-allergy and histamine blocking drugs', 'active'],
      ['NSAIDs / Pain Relief', 'Non-steroidal anti-inflammatory drugs', 'active'],
      ['Electrolytes', 'Oral rehydration and mineral replenishment formulations', 'active'],
      ['Respiratory / Bronchodilator', 'Airway opening and asthma management medications', 'active'],
      ['Respiratory / Antitussive', 'Cough suppressants and expectorants', 'active'],
      ['Vitamins & Supplements', 'Essential micronutrients and nutritional support', 'active'],
      ['Dermatological', 'Topical ointments, antiseptics, and skin preparations', 'active']
    ];

    for (const [name, desc, status] of standardCategories) {
      await connection.query(
        `INSERT IGNORE INTO medicine_categories (hospital_id, name, description, status)
         VALUES (NULL, ?, ?, ?)`,
        [name, desc, status]
      );
    }

    console.log("Ensuring suppliers table exists...");
    await connection.query(`
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
      )
    `);

    const standardSuppliers = [
      ['Apex Pharma Distribution Ltd.', 'Rajesh Verma', '+91-9876543210', 'orders@apexpharma.com', 'Plot 45, MIDC Industrial Area, Mumbai', 'active'],
      ['MedLife Healthcare Wholesale', 'Anita Sharma', '+91-9822334455', 'supply@medlifehealthcare.com', '88 Pharma Park, Sector 18, Gurugram', 'active'],
      ['CareGlobal LifeSciences', 'David Miller', '+1-555-019-8822', 'contracts@careglobal.com', '700 Biomedical Blvd, Boston, MA', 'active']
    ];

    for (const [sName, contact, phone, email, addr, status] of standardSuppliers) {
      await connection.query(
        `INSERT IGNORE INTO suppliers (hospital_id, name, contact_person, phone, email, address, status)
         VALUES (NULL, ?, ?, ?, ?, ?, ?)`,
        [sName, contact, phone, email, addr, status]
      );
    }

    console.log("Extending master_medicines table...");
    const [medCols] = await connection.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'master_medicines'
    `);
    const medColNames = medCols.map((c) => c.COLUMN_NAME);

    if (!medColNames.includes("sku")) {
      await connection.query("ALTER TABLE master_medicines ADD COLUMN sku VARCHAR(50) NULL AFTER id");
    }
    if (!medColNames.includes("category_id")) {
      await connection.query("ALTER TABLE master_medicines ADD COLUMN category_id BIGINT UNSIGNED NULL AFTER category");
    }
    if (!medColNames.includes("purchase_price")) {
      await connection.query("ALTER TABLE master_medicines ADD COLUMN purchase_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER strength");
    }
    if (!medColNames.includes("sale_price")) {
      await connection.query("ALTER TABLE master_medicines ADD COLUMN sale_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER purchase_price");
    }
    if (!medColNames.includes("max_discount_percent")) {
      await connection.query("ALTER TABLE master_medicines ADD COLUMN max_discount_percent DECIMAL(5, 2) NOT NULL DEFAULT 0.00 AFTER sale_price");
    }
    if (!medColNames.includes("min_stock_alert_level")) {
      await connection.query("ALTER TABLE master_medicines ADD COLUMN min_stock_alert_level INT UNSIGNED NOT NULL DEFAULT 15 AFTER max_discount_percent");
    }
    if (!medColNames.includes("description")) {
      await connection.query("ALTER TABLE master_medicines ADD COLUMN description TEXT NULL AFTER min_stock_alert_level");
    }
    if (!medColNames.includes("updated_at")) {
      await connection.query("ALTER TABLE master_medicines ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at");
    }

    // Standard SKUs and pricing updates
    const medSeeds = [
      [1, 'MED-PARA-500', 1.20, 2.50, 50, 10.00],
      [2, 'MED-PARA-650', 1.80, 3.50, 50, 10.00],
      [3, 'MED-AMOX-500', 4.50, 8.00, 30, 5.00],
      [4, 'MED-AUGM-625', 12.00, 22.00, 25, 5.00],
      [5, 'MED-METF-500', 2.10, 4.50, 40, 10.00],
      [6, 'MED-ATOR-10', 5.00, 10.00, 30, 10.00],
      [7, 'MED-AMLO-5', 2.00, 4.00, 30, 10.00],
      [8, 'MED-PANT-40', 4.00, 8.50, 35, 8.00],
      [9, 'MED-OMEP-20', 3.50, 7.00, 30, 8.00],
      [10, 'MED-AZIT-500', 14.00, 25.00, 20, 5.00],
      [11, 'MED-CETR-10', 1.50, 3.50, 40, 10.00],
      [12, 'MED-IBUP-400', 2.50, 5.00, 35, 10.00],
      [13, 'MED-ORS-21G', 8.00, 15.00, 40, 5.00],
      [14, 'MED-SALB-100', 85.00, 130.00, 15, 5.00],
      [15, 'MED-COUG-100', 45.00, 75.00, 20, 5.00],
    ];
    for (const [id, sku, pPrice, sPrice, minAlert, disc] of medSeeds) {
      await connection.query(
        `UPDATE master_medicines
         SET sku = ?, purchase_price = ?, sale_price = ?, min_stock_alert_level = ?, max_discount_percent = ?
         WHERE id = ? AND (sku IS NULL OR sku = '' OR sku = ?)`,
        [sku, pPrice, sPrice, minAlert, disc, id, sku]
      );
    }

    // Ensure fallback SKU and link category_id
    await connection.query(`
      UPDATE master_medicines
      SET sku = CONCAT('MED-', LPAD(id, 4, '0'))
      WHERE sku IS NULL OR sku = ''
    `);

    await connection.query(`
      UPDATE master_medicines m
      JOIN medicine_categories c ON c.name = m.category AND c.hospital_id IS NULL
      SET m.category_id = c.id
      WHERE m.category_id IS NULL
    `);

    console.log("Ensuring hospital_medicines table exists...");
    await connection.query(`
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
      )
    `);

    // Seed formulary for Hospital 1 and 2
    await connection.query(`
      INSERT IGNORE INTO hospital_medicines (hospital_id, master_medicine_id, sale_price, max_discount_percent, min_stock_alert_level, status)
      SELECT 1, id, sale_price, max_discount_percent, min_stock_alert_level, 'active' FROM master_medicines
    `);
    await connection.query(`
      INSERT IGNORE INTO hospital_medicines (hospital_id, master_medicine_id, sale_price, max_discount_percent, min_stock_alert_level, status)
      SELECT 2, id, sale_price, max_discount_percent, min_stock_alert_level, 'active' FROM master_medicines
    `);

    console.log("Ensuring medicine_batches table exists...");
    await connection.query(`
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
      )
    `);

    console.log("Ensuring stock_movements table exists...");
    await connection.query(`
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
      )
    `);

    console.log("Ensuring pharmacy_dispensations tables exist...");
    await connection.query(`
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
      )
    `);

    await connection.query(`
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
      )
    `);

    // --- MIGRATION 012: Module 13 Prescription Management ---
    console.log("Executing Migration 012: Module 13 Prescription Management...");
    const [pCols] = await connection.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'prescriptions'
    `);
    const pColNames = pCols.map((c) => c.COLUMN_NAME);

    if (!pColNames.includes("status")) {
      console.log("Adding status column to prescriptions...");
      await connection.query(
        "ALTER TABLE prescriptions ADD COLUMN status ENUM('draft', 'active', 'partially_dispensed', 'dispensed', 'cancelled') NOT NULL DEFAULT 'active' AFTER general_instructions"
      );
      await connection.query(`
        UPDATE prescriptions p
        JOIN consultations c ON c.id = p.consultation_id
        SET p.status = CASE WHEN c.status = 'draft' THEN 'draft' ELSE 'active' END
      `);
      await connection.query(`
        UPDATE prescriptions p
        JOIN pharmacy_dispensations pd ON pd.prescription_id = p.id
        SET p.status = 'dispensed'
      `);
    }

    const [piCols] = await connection.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'prescription_items'
    `);
    const piColNames = piCols.map((c) => c.COLUMN_NAME);

    if (!piColNames.includes("medicine_id")) {
      console.log("Adding medicine_id column to prescription_items...");
      await connection.query(
        "ALTER TABLE prescription_items ADD COLUMN medicine_id BIGINT UNSIGNED NULL AFTER prescription_id"
      );
      await connection.query(`
        UPDATE prescription_items pi
        JOIN master_medicines m ON LOWER(TRIM(m.name)) = LOWER(TRIM(pi.medicine_name))
        SET pi.medicine_id = m.id
        WHERE pi.medicine_id IS NULL
      `);
      await connection.query(`
        ALTER TABLE prescription_items
        ADD CONSTRAINT fk_rx_item_med FOREIGN KEY (medicine_id) REFERENCES master_medicines(id) ON DELETE SET NULL
      `).catch(() => {});
    }

    if (!piColNames.includes("dispensed_quantity")) {
      console.log("Adding dispensed_quantity column to prescription_items...");
      await connection.query(
        "ALTER TABLE prescription_items ADD COLUMN dispensed_quantity INT UNSIGNED NOT NULL DEFAULT 0 AFTER quantity"
      );
      await connection.query(`
        UPDATE prescription_items pi
        JOIN prescriptions p ON p.id = pi.prescription_id
        SET pi.dispensed_quantity = COALESCE(pi.quantity, 0)
        WHERE p.status = 'dispensed'
      `);
    }

    const [pdiCols] = await connection.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pharmacy_dispensation_items'
    `);
    const pdiColNames = pdiCols.map((c) => c.COLUMN_NAME);

    if (!pdiColNames.includes("prescription_item_id")) {
      console.log("Adding prescription_item_id column to pharmacy_dispensation_items...");
      await connection.query(
        "ALTER TABLE pharmacy_dispensation_items ADD COLUMN prescription_item_id BIGINT UNSIGNED NULL AFTER dispensation_id"
      );
      await connection.query(`
        ALTER TABLE pharmacy_dispensation_items
        ADD CONSTRAINT fk_pdi_rx_item FOREIGN KEY (prescription_item_id) REFERENCES prescription_items(id) ON DELETE SET NULL
      `).catch(() => {});
    }

    console.log("Ensuring prescription_status_history table exists...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS prescription_status_history (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        prescription_id BIGINT UNSIGNED NOT NULL,
        from_status VARCHAR(50) NULL,
        to_status VARCHAR(50) NOT NULL,
        changed_by BIGINT UNSIGNED NOT NULL,
        reason VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_psh_prescription FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON DELETE CASCADE,
        CONSTRAINT fk_psh_changed_by FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE RESTRICT,
        INDEX idx_psh_prescription (prescription_id),
        INDEX idx_psh_date (created_at)
      )
    `);

    // --- MIGRATION 013: Module 14 Pharmacy Billing & Payments ---
    console.log("Ensuring pharmacy_bills table exists...");
    await connection.query(`
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
      )
    `);

    console.log("Ensuring pharmacy_bill_items table exists...");
    await connection.query(`
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
      )
    `);

    console.log("Ensuring pharmacy_payments table exists...");
    await connection.query(`
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
      )
    `);

    console.log("Ensuring pharmacy_refunds table exists...");
    await connection.query(`
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
      )
    `);

    // --- MIGRATION 014: Module 15 Dispensing and Stock Management ---
    console.log("Checking pharmacy_dispensations columns for Module 15...");
    const [dispCols] = await connection.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pharmacy_dispensations'
    `);
    const dispColNames = dispCols.map((c) => c.COLUMN_NAME);

    if (!dispColNames.includes("bill_id")) {
      console.log("Adding bill_id column to pharmacy_dispensations...");
      await connection.query(
        "ALTER TABLE pharmacy_dispensations ADD COLUMN bill_id BIGINT UNSIGNED NULL AFTER prescription_id"
      );
      try {
        await connection.query(
          "ALTER TABLE pharmacy_dispensations ADD CONSTRAINT fk_disp_bill FOREIGN KEY (bill_id) REFERENCES pharmacy_bills(id) ON DELETE SET NULL"
        );
      } catch (err) {
        console.warn("Notice: fk_disp_bill constraint note:", err.message);
      }
      try {
        await connection.query(
          "CREATE INDEX idx_disp_bill ON pharmacy_dispensations (bill_id)"
        );
      } catch (err) {
        // Index might already exist
      }
    }

    if (!dispColNames.includes("idempotency_key")) {
      console.log("Adding idempotency_key column to pharmacy_dispensations...");
      await connection.query(
        "ALTER TABLE pharmacy_dispensations ADD COLUMN idempotency_key VARCHAR(100) NULL AFTER notes"
      );
      try {
        await connection.query(
          "CREATE UNIQUE INDEX uq_disp_idempotency ON pharmacy_dispensations (idempotency_key)"
        );
      } catch (err) {
        // Unique index might already exist
      }
    }

    // --- MIGRATION 015: Module 16 Consultation Billing & Payments ---
    console.log("Ensuring consultation_bills table exists...");
    await connection.query(`
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
      )
    `);

    console.log("Ensuring consultation_payments table exists...");
    await connection.query(`
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
      )
    `);

    // --- MIGRATION 018: AI Hospital Intelligence and Digital Twin ---
    console.log("Ensuring AI and Digital Twin tables exist...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS ai_chat_conversations (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        hospital_id BIGINT UNSIGNED NULL,
        user_id BIGINT UNSIGNED NOT NULL,
        title VARCHAR(255) NOT NULL DEFAULT 'New Consultation',
        role VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_ai_conv_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE,
        CONSTRAINT fk_ai_conv_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_ai_conv_user (user_id),
        INDEX idx_ai_conv_hospital (hospital_id),
        INDEX idx_ai_conv_updated (updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS ai_chat_messages (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        conversation_id BIGINT UNSIGNED NOT NULL,
        sender ENUM('user', 'assistant', 'system') NOT NULL,
        message LONGTEXT NOT NULL,
        metadata JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_ai_msg_conv FOREIGN KEY (conversation_id) REFERENCES ai_chat_conversations(id) ON DELETE CASCADE,
        INDEX idx_ai_msg_conv (conversation_id),
        INDEX idx_ai_msg_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS ai_generated_reports (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        report_number VARCHAR(50) NOT NULL UNIQUE,
        hospital_id BIGINT UNSIGNED NULL,
        user_id BIGINT UNSIGNED NOT NULL,
        report_type ENUM(
          'daily_operational',
          'weekly_executive',
          'monthly_financial',
          'bed_occupancy',
          'inventory_forecast',
          'lab_workload',
          'doctor_performance',
          'custom_nl'
        ) NOT NULL,
        title VARCHAR(200) NOT NULL,
        period_start DATE NULL,
        period_end DATE NULL,
        summary LONGTEXT NOT NULL,
        metrics_snapshot JSON NOT NULL,
        recommendations JSON NULL,
        generated_by_role VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_ai_rep_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE,
        CONSTRAINT fk_ai_rep_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
        INDEX idx_ai_rep_hospital (hospital_id),
        INDEX idx_ai_rep_type (report_type),
        INDEX idx_ai_rep_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS ai_automation_rules (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        hospital_id BIGINT UNSIGNED NOT NULL,
        rule_type ENUM(
          'low_stock_alert',
          'expiry_warning',
          'bed_capacity_surge',
          'long_wait_queue',
          'pending_lab_delay',
          'unpaid_bill_aging'
        ) NOT NULL,
        name VARCHAR(150) NOT NULL,
        is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        threshold_value DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        config JSON NULL,
        last_triggered_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_ai_rule_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE,
        UNIQUE KEY uq_ai_hospital_rule (hospital_id, rule_type),
        INDEX idx_ai_rule_hospital (hospital_id),
        INDEX idx_ai_rule_enabled (is_enabled)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS digital_twin_simulations (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        simulation_code VARCHAR(50) NOT NULL UNIQUE,
        hospital_id BIGINT UNSIGNED NOT NULL,
        user_id BIGINT UNSIGNED NOT NULL,
        scenario_type ENUM(
          'patient_surge',
          'bed_capacity_loss',
          'doctor_shortage',
          'medicine_demand_spike',
          'lab_surge',
          'custom'
        ) NOT NULL,
        scenario_name VARCHAR(150) NOT NULL,
        parameters JSON NOT NULL,
        baseline_metrics JSON NOT NULL,
        simulated_metrics JSON NOT NULL,
        impact_summary LONGTEXT NOT NULL,
        is_simulated BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_dt_sim_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE CASCADE,
        CONSTRAINT fk_dt_sim_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
        INDEX idx_dt_sim_hospital (hospital_id),
        INDEX idx_dt_sim_type (scenario_type),
        INDEX idx_dt_sim_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS ai_audit_logs (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        hospital_id BIGINT UNSIGNED NULL,
        user_id BIGINT UNSIGNED NOT NULL,
        action VARCHAR(100) NOT NULL,
        feature VARCHAR(100) NOT NULL,
        query_text TEXT NULL,
        model_used VARCHAR(100) NOT NULL,
        execution_time_ms INT UNSIGNED NOT NULL DEFAULT 0,
        status ENUM('success', 'failed', 'blocked') NOT NULL DEFAULT 'success',
        error_message VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ai_audit_hospital (hospital_id),
        INDEX idx_ai_audit_user (user_id),
        INDEX idx_ai_audit_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log("=== All Migrations and Master Data Seeded Successfully! ===");
  } finally {
    connection.release();
  }
}

runMigration()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
