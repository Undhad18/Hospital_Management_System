require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const pool = require('../db');

async function initInfectionTwin() {
  console.log("Creating infection_cases and infection_exposure_traces tables...");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS infection_cases (
      id INT AUTO_INCREMENT PRIMARY KEY,
      hospital_id INT NOT NULL,
      case_code VARCHAR(50) NOT NULL,
      patient_id INT NOT NULL,
      patient_name VARCHAR(150) NOT NULL,
      current_ward_name VARCHAR(100) NOT NULL,
      current_bed_number VARCHAR(50) NOT NULL,
      pathogen VARCHAR(120) NOT NULL,
      isolation_type ENUM(
        'contact',
        'airborne_negative_pressure',
        'droplet',
        'enteric_contact',
        'protective_reverse'
      ) NOT NULL DEFAULT 'contact',
      severity ENUM('isolated', 'cluster_watch', 'active_outbreak') NOT NULL DEFAULT 'isolated',
      status ENUM('active_isolation', 'surveillance_monitoring', 'cleared_resolved') NOT NULL DEFAULT 'active_isolation',
      detected_date DATETIME NOT NULL,
      negative_pressure_pa DECIMAL(4,1) NULL,
      swab_results_count INT NOT NULL DEFAULT 0,
      required_negative_swabs INT NOT NULL DEFAULT 3,
      containment_notes TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_case_code (hospital_id, case_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS infection_exposure_traces (
      id INT AUTO_INCREMENT PRIMARY KEY,
      hospital_id INT NOT NULL,
      case_id INT NOT NULL,
      contact_type ENUM('co_patient', 'healthcare_staff', 'visitor') NOT NULL,
      contact_name VARCHAR(150) NOT NULL,
      contact_role VARCHAR(100) NOT NULL,
      location_zone VARCHAR(100) NOT NULL,
      exposure_window VARCHAR(100) NOT NULL,
      risk_level ENUM('high', 'moderate', 'low') NOT NULL DEFAULT 'moderate',
      containment_status ENUM(
        'isolated_pending_swab',
        'quarantined',
        'screened_negative',
        'prophylaxis_issued'
      ) NOT NULL DEFAULT 'isolated_pending_swab',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_case (case_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  console.log("Seeding real infection surveillance cases for Hospital 1...");

  // Case 1: MRSA Contact Isolation
  const [res1] = await pool.query(`
    INSERT INTO infection_cases (
      hospital_id, case_code, patient_id, patient_name, current_ward_name,
      current_bed_number, pathogen, isolation_type, severity, status,
      detected_date, negative_pressure_pa, swab_results_count, required_negative_swabs, containment_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW() - INTERVAL 36 HOUR, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      pathogen = VALUES(pathogen),
      containment_notes = VALUES(containment_notes)
  `, [
    1,
    'INF-MRSA-0412',
    448, // Amit Shah
    'Amit Shah',
    'General Medical Inpatient Ward',
    'GEN-202',
    'Methicillin-Resistant Staphylococcus aureus (MRSA)',
    'contact',
    'cluster_watch',
    'active_isolation',
    null,
    1,
    3,
    'Sputum and wound swab confirmed oxacillin/methicillin resistance. Contact isolation PPE (yellow gowns & gloves) strictly enforced. Dedicated disposable equipment at bedside.'
  ]);

  const case1Id = res1.insertId || 1;

  // Case 2: Airborne Isolation (SARS-CoV-2 / Influenza in AIIR)
  const [res2] = await pool.query(`
    INSERT INTO infection_cases (
      hospital_id, case_code, patient_id, patient_name, current_ward_name,
      current_bed_number, pathogen, isolation_type, severity, status,
      detected_date, negative_pressure_pa, swab_results_count, required_negative_swabs, containment_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW() - INTERVAL 18 HOUR, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      pathogen = VALUES(pathogen),
      containment_notes = VALUES(containment_notes)
  `, [
    1,
    'INF-AIRB-0982',
    452, // Rajesh Gupta
    'Rajesh Gupta',
    'Coronary Critical Care Unit (CCU)',
    'CCU-102',
    'Airborne Viral Respiratory Panel (SARS-CoV-2 / Influenza A)',
    'airborne_negative_pressure',
    'isolated',
    'active_isolation',
    -2.8,
    0,
    3,
    'Transferred to Airborne Infection Isolation Room (AIIR). Continuous differential pressure sensor active (-2.8 Pa). HEPA exhaust filtration operating at 12 air changes/hour (ACH). N95 respirators required upon entry.'
  ]);

  const case2Id = res2.insertId || 2;

  // Exposure contacts for Case 1 (MRSA in General Ward)
  await pool.query(`DELETE FROM infection_exposure_traces WHERE case_id IN (?, ?)`, [case1Id, case2Id]);

  const contactsCase1 = [
    {
      type: 'co_patient',
      name: 'Sneha Joshi',
      role: 'Adjacent Inpatient Bed (GEN-203)',
      zone: 'General Medical Ward (Room 20)',
      window: 'Past 36 Hours (Continuous Co-Occupancy)',
      risk: 'high',
      status: 'isolated_pending_swab'
    },
    {
      type: 'healthcare_staff',
      name: 'Nurse Brenda Patel',
      role: 'Primary Floor RN',
      zone: 'General Ward Nurses Station',
      window: 'Day Shift (Yesterday & Today)',
      risk: 'moderate',
      status: 'screened_negative'
    },
    {
      type: 'healthcare_staff',
      name: 'Dr. Liam Patel',
      role: 'Attending Physician',
      zone: 'Bedside Rounding',
      window: 'Daily Morning Clinical Rounds',
      risk: 'moderate',
      status: 'screened_negative'
    },
    {
      type: 'healthcare_staff',
      name: 'David Miller',
      role: 'Phlebotomist / Specimen Logistics',
      zone: 'Ward Bed GEN-202',
      window: 'Stat Blood Draw (Yesterday 08:30 AM)',
      risk: 'low',
      status: 'screened_negative'
    }
  ];

  for (const c of contactsCase1) {
    await pool.query(`
      INSERT INTO infection_exposure_traces (
        hospital_id, case_id, contact_type, contact_name, contact_role,
        location_zone, exposure_window, risk_level, containment_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [1, case1Id, c.type, c.name, c.role, c.zone, c.window, c.risk, c.status]);
  }

  // Exposure contacts for Case 2 (Airborne in CCU)
  const contactsCase2 = [
    {
      type: 'co_patient',
      name: 'Maria Santos',
      role: 'CCU Neighboring Bay (CCU-101)',
      zone: 'CCU Open Bay Corridor',
      window: 'Past 18 Hours (Pre-Isolation Intake)',
      risk: 'high',
      status: 'isolated_pending_swab'
    },
    {
      type: 'healthcare_staff',
      name: 'Dr. Marcus Reed',
      role: 'Intensivist / Anesthesiologist',
      zone: 'CCU Resuscitation Room',
      window: 'Airway Intubation Procedure',
      risk: 'high',
      status: 'prophylaxis_issued'
    },
    {
      type: 'healthcare_staff',
      name: 'Nurse Karen Hayes',
      role: 'ICU Critical Care RN',
      zone: 'CCU Station Bay 2',
      window: 'Night Shift Coverage',
      risk: 'moderate',
      status: 'isolated_pending_swab'
    }
  ];

  for (const c of contactsCase2) {
    await pool.query(`
      INSERT INTO infection_exposure_traces (
        hospital_id, case_id, contact_type, contact_name, contact_role,
        location_zone, exposure_window, risk_level, containment_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [1, case2Id, c.type, c.name, c.role, c.zone, c.window, c.risk, c.status]);
  }

  console.log("Infection Control & Outbreak Twin successfully initialized!");
  process.exit(0);
}

initInfectionTwin().catch(err => {
  console.error("Initialization error:", err);
  process.exit(1);
});
