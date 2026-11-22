const pool = require('../db');

async function initDischargeTwin() {
  console.log("Creating discharge_readiness_assessments table...");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS discharge_readiness_assessments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      hospital_id INT NOT NULL,
      admission_id INT NOT NULL,
      patient_id INT NOT NULL,
      current_stage ENUM(
        'clinical_clearance',
        'pharmacy_reconciliation',
        'billing_settlement',
        'transit_ready',
        'evs_turnaround',
        'liberated'
      ) NOT NULL DEFAULT 'clinical_clearance',
      readiness_score INT NOT NULL DEFAULT 50,
      estimated_liberation_window VARCHAR(255) NOT NULL DEFAULT 'In 3-4 Hours',
      clinical_status ENUM('cleared', 'pending', 'flagged_delay') NOT NULL DEFAULT 'pending',
      pharmacy_status ENUM('dispensed', 'in_process', 'pending_order') NOT NULL DEFAULT 'pending_order',
      billing_status ENUM('settled', 'tpa_insurance_pending', 'draft_generated') NOT NULL DEFAULT 'draft_generated',
      evs_status ENUM('ready', 'cleaning_in_progress', 'pending_dispatch') NOT NULL DEFAULT 'pending_dispatch',
      barrier_notes TEXT NULL,
      pre_allocated_candidate JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_active_admission (admission_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  console.log("Seeding discharge readiness assessments for active admissions...");

  // Query Hospital 1 active admissions
  const [admissions] = await pool.query(`
    SELECT a.id, a.patient_id, a.hospital_id, p.full_name as patient_name,
           b.bed_number, w.name as ward_name, w.ward_type, a.reason
    FROM admissions a
    JOIN users p ON p.id = a.patient_id
    JOIN bed_assignments ba ON ba.admission_id = a.id AND ba.status = 'active'
    JOIN beds b ON b.id = ba.bed_id
    JOIN wards w ON w.id = b.ward_id
    WHERE a.status = 'admitted'
  `);

  console.log(`Found ${admissions.length} active admissions to assess.`);

  const sampleAssessments = [
    {
      bed_number: 'SURG-301', // Robert Chen
      stage: 'transit_ready',
      score: 92,
      window: 'In ~45 Minutes (12:30 PM)',
      clinical: 'cleared',
      pharmacy: 'dispensed',
      billing: 'settled',
      evs: 'pending_dispatch',
      notes: 'Surgical recovery uneventful. Discharge paperwork and take-home medications in hand. Awaiting family transport.',
      candidate: { name: 'Lucas Sterling', req_bed_type: 'surgical', condition: 'Scheduled Post-Op Hernioplasty' }
    },
    {
      bed_number: 'GEN-202', // Amit Shah
      stage: 'billing_settlement',
      score: 84,
      window: 'In ~1.5 Hours (01:15 PM)',
      clinical: 'cleared',
      pharmacy: 'dispensed',
      billing: 'tpa_insurance_pending',
      evs: 'pending_dispatch',
      notes: 'Hydration and electrolyte levels restored. Final TPA cashless pre-authorization summary awaiting insurer stamp.',
      candidate: { name: 'Priya Mehta', req_bed_type: 'standard', condition: 'Awaiting General Inpatient Admission' }
    },
    {
      bed_number: 'GEN-203', // Sneha Joshi
      stage: 'pharmacy_reconciliation',
      score: 74,
      window: 'In ~2.5 Hours (02:15 PM)',
      clinical: 'cleared',
      pharmacy: 'in_process',
      billing: 'draft_generated',
      evs: 'pending_dispatch',
      notes: 'Endocrinology consultant signed off. Pharmacy packaging 30-day oral insulin formulary kit.',
      candidate: { name: 'Farhan Akhtar', req_bed_type: 'standard', condition: 'Direct Transfer from Emergency Triage' }
    },
    {
      bed_number: 'GEN-201', // Rajesh Gupta
      stage: 'clinical_clearance',
      score: 58,
      window: 'In ~5-6 Hours (Late Afternoon)',
      clinical: 'pending',
      pharmacy: 'pending_order',
      billing: 'draft_generated',
      evs: 'pending_dispatch',
      notes: 'SpO2 stable on room air (96%). Awaiting noon pulmonology round and final sputum culture report.',
      candidate: null
    },
    {
      bed_number: 'CCU-102', // Vikram Verma
      stage: 'clinical_clearance',
      score: 65,
      window: 'In ~3-4 Hours (Step-Down Ready)',
      clinical: 'cleared',
      pharmacy: 'pending_order',
      billing: 'draft_generated',
      evs: 'pending_dispatch',
      notes: 'Arterial sheath removed; hemodynamically stable. Approved for step-down transfer to General Telemetry Ward.',
      candidate: { name: 'Elena Rostov', req_bed_type: 'icu', condition: 'Urgent Cath Lab Post-Stent Influx' }
    },
    {
      bed_number: 'CCU-101', // Maria Santos
      stage: 'clinical_clearance',
      score: 35,
      window: 'High Acuity — Retain CCU (>24h)',
      clinical: 'flagged_delay',
      pharmacy: 'pending_order',
      billing: 'draft_generated',
      evs: 'pending_dispatch',
      notes: 'Borderline cardiac enzymes. Requires continuous 12-lead telemetry and central line antibiotic infusion.',
      candidate: null
    }
  ];

  for (const adm of admissions) {
    const match = sampleAssessments.find(s => s.bed_number === adm.bed_number) || {
      stage: 'clinical_clearance',
      score: 50,
      window: 'In ~4-5 Hours',
      clinical: 'pending',
      pharmacy: 'pending_order',
      billing: 'draft_generated',
      evs: 'pending_dispatch',
      notes: 'Under routine inpatient monitoring and vital parameter stabilization.',
      candidate: null
    };

    await pool.query(`
      INSERT INTO discharge_readiness_assessments (
        hospital_id, admission_id, patient_id, current_stage, readiness_score,
        estimated_liberation_window, clinical_status, pharmacy_status,
        billing_status, evs_status, barrier_notes, pre_allocated_candidate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        current_stage = VALUES(current_stage),
        readiness_score = VALUES(readiness_score),
        estimated_liberation_window = VALUES(estimated_liberation_window),
        clinical_status = VALUES(clinical_status),
        pharmacy_status = VALUES(pharmacy_status),
        billing_status = VALUES(billing_status),
        evs_status = VALUES(evs_status),
        barrier_notes = VALUES(barrier_notes),
        pre_allocated_candidate = VALUES(pre_allocated_candidate)
    `, [
      adm.hospital_id,
      adm.id,
      adm.patient_id,
      match.stage,
      match.score,
      match.window,
      match.clinical,
      match.pharmacy,
      match.billing,
      match.evs,
      match.notes,
      match.candidate ? JSON.stringify(match.candidate) : null
    ]);
  }

  console.log("Discharge readiness table successfully initialized and seeded!");
  process.exit(0);
}

initDischargeTwin().catch(err => {
  console.error("Init failed:", err);
  process.exit(1);
});
