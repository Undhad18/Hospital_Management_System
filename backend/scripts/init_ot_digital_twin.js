const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const pool = require("../db");

async function initOtDigitalTwin() {
  console.log("Initializing Operation Theater & PACU Digital Twin schema...");

  // 1. operation_theaters table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS operation_theaters (
      id INT AUTO_INCREMENT PRIMARY KEY,
      hospital_id INT NOT NULL,
      theater_code VARCHAR(50) NOT NULL,
      name VARCHAR(150) NOT NULL,
      suite_type ENUM('general', 'cardiac', 'orthopedic', 'neuro', 'laparoscopic', 'ophthalmic') DEFAULT 'general',
      status ENUM('available', 'in_surgery', 'turnaround_sanitization', 'maintenance', 'emergency_standby') DEFAULT 'available',
      current_surgery_id INT NULL,
      temperature_celsius DECIMAL(4,1) DEFAULT 19.5,
      humidity_pct INT DEFAULT 50,
      air_turnover_rate INT DEFAULT 25,
      laminar_flow_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_hospital_code (hospital_id, theater_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 2. surgical_cases table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS surgical_cases (
      id INT AUTO_INCREMENT PRIMARY KEY,
      hospital_id INT NOT NULL,
      theater_id INT NOT NULL,
      patient_id INT NOT NULL,
      lead_surgeon_id INT NOT NULL,
      anesthesiologist_id INT NULL,
      procedure_name VARCHAR(255) NOT NULL,
      surgery_type ENUM('elective', 'urgent', 'emergency') DEFAULT 'elective',
      stage ENUM('scheduled', 'pre_op_holding', 'in_theater', 'intra_op', 'post_op_pacu', 'completed', 'cancelled') DEFAULT 'scheduled',
      scheduled_start_time DATETIME NOT NULL,
      estimated_duration_minutes INT DEFAULT 120,
      actual_start_time DATETIME NULL,
      actual_end_time DATETIME NULL,
      turnaround_buffer_minutes INT DEFAULT 30,
      delay_minutes INT DEFAULT 0,
      anesthesia_type VARCHAR(100) DEFAULT 'General Endotracheal Anesthesia',
      pacu_bed_number VARCHAR(50) NULL,
      surgical_notes TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 3. pacu_beds table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pacu_beds (
      id INT AUTO_INCREMENT PRIMARY KEY,
      hospital_id INT NOT NULL,
      bed_number VARCHAR(50) NOT NULL,
      status ENUM('available', 'occupied', 'cleaning') DEFAULT 'available',
      current_case_id INT NULL,
      oxygen_saturation_pct INT DEFAULT 98,
      heart_rate_bpm INT DEFAULT 74,
      blood_pressure VARCHAR(50) DEFAULT '120/80',
      aldrete_recovery_score INT DEFAULT 8,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_pacu_bed (hospital_id, bed_number)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  console.log("OT & PACU tables ready. Seeding live operational data for Hospital #1...");

  // Check doctors for lead surgeon
  const [doctors] = await pool.query(
    "SELECT u.id, u.full_name FROM users u JOIN doctor_profiles dp ON dp.user_id = u.id WHERE u.hospital_id = 1 AND u.status = 'active' LIMIT 5"
  );
  const leadSurgeonId = doctors[0]?.id || 3;
  const secondSurgeonId = doctors[1]?.id || doctors[0]?.id || 3;

  // Check patients
  const [patients] = await pool.query(
    "SELECT id, full_name FROM users WHERE role_id = (SELECT id FROM roles WHERE name = 'patient' LIMIT 1) LIMIT 10"
  );
  const p1 = patients[0]?.id || 10;
  const p2 = patients[1]?.id || 11;
  const p3 = patients[2]?.id || 12;
  const p4 = patients[3]?.id || 13;

  // Seed 4 Operation Theaters
  await pool.query(`
    INSERT INTO operation_theaters (hospital_id, theater_code, name, suite_type, status, temperature_celsius, humidity_pct, air_turnover_rate, laminar_flow_active)
    VALUES
      (1, 'OT-01', 'Cardio-Thoracic & Vascular Suite 1', 'cardiac', 'in_surgery', 19.2, 48, 28, 1),
      (1, 'OT-02', 'Minimally Invasive & Laparoscopic Suite 2', 'laparoscopic', 'turnaround_sanitization', 20.1, 52, 24, 1),
      (1, 'OT-03', 'Orthopedic & Joint Reconstruction Suite 3', 'orthopedic', 'available', 19.8, 49, 26, 1),
      (1, 'OT-04', 'Neuro & Spine Advanced Suite 4', 'neuro', 'emergency_standby', 18.9, 45, 30, 1)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      suite_type = VALUES(suite_type),
      status = VALUES(status),
      temperature_celsius = VALUES(temperature_celsius),
      humidity_pct = VALUES(humidity_pct),
      air_turnover_rate = VALUES(air_turnover_rate),
      laminar_flow_active = VALUES(laminar_flow_active);
  `);

  // Seed 6 PACU Recovery Beds
  await pool.query(`
    INSERT INTO pacu_beds (hospital_id, bed_number, status, oxygen_saturation_pct, heart_rate_bpm, blood_pressure, aldrete_recovery_score)
    VALUES
      (1, 'PACU-B01', 'occupied', 99, 72, '124/78', 9),
      (1, 'PACU-B02', 'occupied', 97, 81, '118/74', 8),
      (1, 'PACU-B03', 'available', 98, 70, '120/80', 10),
      (1, 'PACU-B04', 'cleaning', 98, 70, '120/80', 10),
      (1, 'PACU-B05', 'available', 98, 70, '120/80', 10),
      (1, 'PACU-B06', 'available', 98, 70, '120/80', 10)
    ON DUPLICATE KEY UPDATE
      status = VALUES(status),
      oxygen_saturation_pct = VALUES(oxygen_saturation_pct),
      heart_rate_bpm = VALUES(heart_rate_bpm),
      blood_pressure = VALUES(blood_pressure),
      aldrete_recovery_score = VALUES(aldrete_recovery_score);
  `);

  // Get OT ids
  const [ots] = await pool.query("SELECT id, theater_code FROM operation_theaters WHERE hospital_id = 1");
  const ot1 = ots.find(o => o.theater_code === 'OT-01')?.id || 1;
  const ot2 = ots.find(o => o.theater_code === 'OT-02')?.id || 2;
  const ot3 = ots.find(o => o.theater_code === 'OT-03')?.id || 3;
  const ot4 = ots.find(o => o.theater_code === 'OT-04')?.id || 4;

  // Clear existing cases for clean demonstration
  await pool.query("DELETE FROM surgical_cases WHERE hospital_id = 1");

  // Insert 4 surgical cases across different lifecycle stages today
  const now = new Date();
  const startTimeCase1 = new Date(now.getTime() - 45 * 60000).toISOString().slice(0, 19).replace('T', ' ');
  const schedTimeCase2 = new Date(now.getTime() + 60 * 60000).toISOString().slice(0, 19).replace('T', ' ');
  const pacuTimeCase3 = new Date(now.getTime() - 150 * 60000).toISOString().slice(0, 19).replace('T', ' ');
  const holdingTimeCase4 = new Date(now.getTime() + 15 * 60000).toISOString().slice(0, 19).replace('T', ' ');

  await pool.query(`
    INSERT INTO surgical_cases (
      hospital_id, theater_id, patient_id, lead_surgeon_id, procedure_name, surgery_type, stage,
      scheduled_start_time, actual_start_time, estimated_duration_minutes, delay_minutes,
      anesthesia_type, pacu_bed_number, surgical_notes
    ) VALUES
      (1, ?, ?, ?, 'Off-Pump Coronary Artery Bypass (OPCAB)', 'urgent', 'intra_op', ?, ?, 180, 0, 'General Endotracheal Anesthesia', NULL, 'Graft harvesting complete. Cardiopulmonary monitoring stable.'),
      (1, ?, ?, ?, 'Laparoscopic Cholecystectomy', 'elective', 'scheduled', ?, NULL, 75, 0, 'General Anesthesia', NULL, 'Pre-anesthetic clearance complete. Awaiting theater turnaround.'),
      (1, ?, ?, ?, 'Total Knee Arthroplasty (TKA - Right)', 'elective', 'post_op_pacu', ?, ?, 110, 5, 'Combined Spinal-Epidural', 'PACU-B01', 'Procedure concluded without complication. Patient extubated, vital Aldrete score 9/10.'),
      (1, ?, ?, ?, 'Anterior Cervical Discectomy & Fusion (ACDF)', 'elective', 'pre_op_holding', ?, NULL, 150, 0, 'General Anesthesia with SSEP Neuromonitoring', NULL, 'Pre-op bay 3. IV line secured, antibiotics prophylactic administered.')
  `, [
    ot1, p1, leadSurgeonId, startTimeCase1, startTimeCase1,
    ot2, p2, secondSurgeonId, schedTimeCase2,
    ot3, p3, leadSurgeonId, pacuTimeCase3, pacuTimeCase3,
    ot4, p4, secondSurgeonId, holdingTimeCase4
  ]);

  // Update OT 1 with current surgery id
  const [cases] = await pool.query("SELECT id, theater_id, stage FROM surgical_cases WHERE hospital_id = 1");
  const case1 = cases.find(c => c.stage === 'intra_op');
  if (case1) {
    await pool.query("UPDATE operation_theaters SET current_surgery_id = ? WHERE id = ?", [case1.id, case1.theater_id]);
  }

  console.log("OT & PACU Digital Twin seeded successfully with real-time operational state!");
  process.exit(0);
}

initOtDigitalTwin().catch(err => {
  console.error("Initialization error:", err);
  process.exit(1);
});
