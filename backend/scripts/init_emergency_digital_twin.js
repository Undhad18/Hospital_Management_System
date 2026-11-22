const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const pool = require("../db");

async function initEmergencyDigitalTwin() {
  console.log("Initializing Emergency Incident & Code Blue Digital Twin schema...");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS emergency_incidents (
      id INT AUTO_INCREMENT PRIMARY KEY,
      hospital_id INT NOT NULL,
      incident_code VARCHAR(50) NOT NULL,
      incident_type ENUM('code_blue', 'mass_casualty', 'trauma_surge', 'fire_evacuation', 'chemical_hazard', 'pediatric_code_pink') DEFAULT 'code_blue',
      severity ENUM('tier_1_minor', 'tier_2_moderate', 'tier_3_critical_disaster') DEFAULT 'tier_3_critical_disaster',
      location_zone VARCHAR(100) NOT NULL,
      status ENUM('active', 'contained', 'resolved', 'drill_simulation') DEFAULT 'active',
      triggered_by_id INT NULL,
      patient_id INT NULL,
      patient_name VARCHAR(150) NULL,
      rapid_response_team JSON NULL,
      action_checklist JSON NULL,
      bed_liberation_plan JSON NULL,
      notes TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      resolved_at TIMESTAMP NULL,
      INDEX idx_hosp_status (hospital_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  console.log("Emergency incidents table ready. Seeding demonstration incident for Hospital #1...");

  // Seed sample active Code Blue incident
  const now = new Date();
  const startTime = new Date(now.getTime() - 6 * 60000).toISOString().slice(0, 19).replace('T', ' ');

  const rrtRoster = [
    { role: "Code Team Leader", name: "Dr. Sarah Jenkins", specialty: "Critical Care / Cardiology", status: "On Scene", eta: "Arrived" },
    { role: "Airway Anesthesiologist", name: "Dr. Marcus Reed", specialty: "Anesthesiology", status: "On Scene", eta: "Arrived" },
    { role: "ICU Charge Nurse", name: "Nurse Brenda Patel", specialty: "Critical Care RN", status: "On Scene", eta: "Arrived" },
    { role: "Respiratory Therapist", name: "Alex Kumar", specialty: "Ventilator Specialist", status: "On Scene", eta: "Arrived" },
    { role: "Crash Cart Porter", name: "David Miller", specialty: "Emergency Logistics", status: "On Scene", eta: "Arrived" }
  ];

  const checklist = [
    { id: 1, action: "Rapid Response Team (RRT) Paged & Strobe Active", completed: true, timestamp: "02m ago", by: "Automated Dispatch" },
    { id: 2, action: "Crash Cart & Defibrillator Deployed to Bedside", completed: true, timestamp: "03m ago", by: "Porter D. Miller" },
    { id: 3, action: "High-Quality CPR Commenced (100-120 bpm)", completed: true, timestamp: "04m ago", by: "Nurse B. Patel" },
    { id: 4, action: "Airway Secured / Bag-Valve-Mask Ventilation (100% O2)", completed: true, timestamp: "05m ago", by: "Dr. M. Reed" },
    { id: 5, action: "Cardiac Rhythm Analyzed: VF/pVT Shock Delivered (200J Biphasic)", completed: true, timestamp: "03m ago", by: "Dr. S. Jenkins" },
    { id: 6, action: "Epinephrine 1mg IV/IO Administered", completed: true, timestamp: "01m ago", by: "Nurse B. Patel" },
    { id: 7, action: "Amiodarone 300mg IV Bolus Prepared", completed: false, timestamp: null, by: null },
    { id: 8, action: "Automated CCU Bed Decanting Protocol Triggered", completed: true, timestamp: "04m ago", by: "Twin Engine" }
  ];

  const bedLiberation = [
    { bedNumber: "CCU-05", patientName: "Arthur Morgan", currentAcuity: "Stable", targetWard: "Step-Down Telemetry 2", action: "Emergency Transfer Ready" },
    { bedNumber: "GEN-04", patientName: "Evelyn Diaz", currentAcuity: "Recovered", targetWard: "Discharge Home", action: "Fast-Track Discharge" }
  ];

  await pool.query("DELETE FROM emergency_incidents WHERE hospital_id = 1");

  await pool.query(`
    INSERT INTO emergency_incidents (
      hospital_id, incident_code, incident_type, severity, location_zone, status,
      patient_name, rapid_response_team, action_checklist, bed_liberation_plan, notes, created_at
    ) VALUES (
      1, 'CODE-BLU-0941', 'code_blue', 'tier_3_critical_disaster', 'Coronary Critical Care Unit (Bed CCU-02)', 'active',
      'Harold Vance (Age 64)', ?, ?, ?, 'Patient presented sudden ventricular fibrillation. Immediate resuscitation underway.', ?
    )
  `, [
    JSON.stringify(rrtRoster),
    JSON.stringify(checklist),
    JSON.stringify(bedLiberation),
    startTime
  ]);

  console.log("Emergency Code Blue schema & live demonstration incident seeded successfully!");
  process.exit(0);
}

initEmergencyDigitalTwin().catch(err => {
  console.error("Emergency init error:", err);
  process.exit(1);
});
