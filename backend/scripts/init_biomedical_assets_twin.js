const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const pool = require("../db");

async function initBiomedicalAssetsTwin() {
  console.log("Initializing Biomedical Equipment & IoT Asset Tracking Digital Twin schema...");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS biomedical_assets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      hospital_id INT NOT NULL,
      asset_tag VARCHAR(50) NOT NULL,
      name VARCHAR(150) NOT NULL,
      category ENUM('mechanical_ventilator', 'defibrillator', 'infusion_pump', 'multiparameter_monitor', 'portable_xray', 'ecg_machine') NOT NULL,
      model VARCHAR(100) NULL,
      serial_number VARCHAR(100) NULL,
      current_location VARCHAR(100) NOT NULL,
      floor_level INT NOT NULL DEFAULT 1,
      assigned_patient_id INT NULL,
      assigned_patient_name VARCHAR(150) NULL,
      assigned_doctor_name VARCHAR(150) NULL,
      status ENUM('in_use', 'available_standby', 'maintenance_due', 'sanitization_required', 'fault_reported') NOT NULL DEFAULT 'available_standby',
      battery_percentage INT NOT NULL DEFAULT 100,
      power_status ENUM('mains_ac', 'internal_battery', 'charging', 'offline') NOT NULL DEFAULT 'mains_ac',
      last_preventive_maintenance DATE NULL,
      next_maintenance_due DATE NULL,
      operating_hours INT NOT NULL DEFAULT 0,
      rfid_beacon_id VARCHAR(50) NULL,
      notes TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_asset_tag (hospital_id, asset_tag)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS asset_dispatch_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      hospital_id INT NOT NULL,
      asset_id INT NOT NULL,
      action ENUM('relocated', 'assigned', 'released', 'maintenance_completed', 'sanitized', 'fault_logged') NOT NULL,
      from_location VARCHAR(100) NULL,
      to_location VARCHAR(100) NULL,
      performed_by VARCHAR(150) NOT NULL,
      notes TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_asset (asset_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  console.log("Biomedical assets and dispatch logs tables ready.");
}

if (require.main === module) {
  initBiomedicalAssetsTwin()
    .then(() => {
      console.log("Biomedical Assets Twin initialized successfully!");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Initialization error:", err);
      process.exit(1);
    });
}

module.exports = { initBiomedicalAssetsTwin };
