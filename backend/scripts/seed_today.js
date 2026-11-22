const pool = require("../db");

async function seedTodayAppointment() {
  const [existing] = await pool.execute(
    "SELECT id FROM appointments WHERE appointment_number = 'APT-20261027-0101' LIMIT 1"
  );
  if (existing.length > 0) {
    await pool.execute(
      "UPDATE appointments SET appointment_date = CURDATE(), status = 'confirmed', queue_number = NULL, check_in_time = NULL WHERE id = ?",
      [existing[0].id]
    );
    console.log("Updated existing appointment for today. ID:", existing[0].id);
    return;
  }

  const [res] = await pool.execute(
    `INSERT INTO appointments (
      appointment_number, patient_id, hospital_id, department_id, doctor_id,
      appointment_date, appointment_time, appointment_type, appointment_mode,
      start_time, end_time, status, reason
    ) VALUES (
      'APT-20261027-0101', 33, 1, 1, 39,
      CURDATE(), '11:00 AM', 'consultation', 'in_person',
      '11:00:00', '11:30:00', 'confirmed', 'General consultation and vitals review'
    )`
  );
  console.log("Created appointment for today. ID:", res.insertId);
}

seedTodayAppointment()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
