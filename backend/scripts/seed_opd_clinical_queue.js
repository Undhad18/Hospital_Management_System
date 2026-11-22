const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const bcrypt = require("bcryptjs");
const pool = require("../db");

async function seed() {
  console.log("=== Seeding OPD Clinical Queue & Patient Schedule ===");

  const hospitalId = 1; // Demo General Hospital
  const departmentId = 23; // Cardiology
  const doctorId = 39; // Dr. Sarah Jenkins

  // 1. Ensure patient role exists
  const [roleRows] = await pool.query("SELECT id FROM roles WHERE name = 'patient' LIMIT 1");
  const patientRoleId = roleRows[0]?.id;
  const passwordHash = await bcrypt.hash("@abcd_123456", 10);

  // Helper: get or create patient
  async function getOrCreatePatient(fullName, email, phone) {
    const [existing] = await pool.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
    if (existing.length) return existing[0].id;

    const [res] = await pool.query(
      `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, phone, status, token_version)
       VALUES (?, ?, ?, ?, ?, ?, 'active', 1)`,
      [patientRoleId, hospitalId, fullName, email, passwordHash, phone]
    );
    return res.insertId;
  }

  const p1 = await getOrCreatePatient("Undhad Harshil", "harshil.patient@hms.com", "+91-9876500101");
  const p2 = await getOrCreatePatient("Eleanor Vance", "eleanor.vance@hms.com", "+91-9876500102");
  const p3 = await getOrCreatePatient("David Kim", "david.kim@hms.com", "+91-9876500103");
  const p4 = await getOrCreatePatient("Maria Santos", "maria.santos@hms.com", "+91-9876500104");

  const todayStr = new Date().toISOString().split("T")[0];

  // Remove previous temporary test rows (CHK-501..504, APT-TODAY-01..02) to match canonical state
  await pool.query(
    "DELETE FROM appointments WHERE appointment_number IN ('CHK-501', 'CHK-502', 'CHK-503', 'CHK-504', 'APT-TODAY-01', 'APT-TODAY-02') AND appointment_date = ?",
    [todayStr]
  );

  // Helper: insert or update appointment
  async function upsertAppointment(aptNumber, patientId, slotTime, startTime, aptType, status, queueNum, checkInTime, reason) {
    const [existing] = await pool.query("SELECT id FROM appointments WHERE appointment_number = ? LIMIT 1", [aptNumber]);
    if (existing.length) {
      await pool.query(
        `UPDATE appointments 
         SET patient_id = ?, hospital_id = ?, department_id = ?, doctor_id = ?,
             appointment_date = ?, appointment_time = ?, start_time = ?, appointment_type = ?,
             status = ?, queue_number = ?, check_in_time = ?, reason = ?
         WHERE id = ?`,
        [patientId, hospitalId, departmentId, doctorId, todayStr, slotTime, startTime, aptType, status, queueNum, checkInTime, reason, existing[0].id]
      );
      return existing[0].id;
    } else {
      const [res] = await pool.query(
        `INSERT INTO appointments
         (appointment_number, patient_id, hospital_id, department_id, doctor_id,
          appointment_date, appointment_time, start_time, appointment_type, appointment_mode,
          status, queue_number, check_in_time, reason, consultation_fee, payment_method)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_person', ?, ?, ?, ?, 0.00, 'cash')`,
        [aptNumber, patientId, hospitalId, departmentId, doctorId, todayStr, slotTime, startTime, aptType, status, queueNum, checkInTime, reason]
      );
      return res.insertId;
    }
  }

  // 1. APT-DEMO-01: Undhad Harshil, 09:30 AM, Consultation, Waiting in Hall, Q-001
  const a1 = await upsertAppointment(
    "APT-DEMO-01",
    p1,
    "09:30 AM",
    "09:30:00",
    "consultation",
    "in_waiting",
    "Q-001",
    `${todayStr} 09:15:00`,
    "Cardiology follow-up & ECG review"
  );

  // 2. APT-DEMO-02: Eleanor Vance, 10:00 AM, Routine Checkup, In Consultation, Q-002
  const a2 = await upsertAppointment(
    "APT-DEMO-02",
    p2,
    "10:00 AM",
    "10:00:00",
    "routine_checkup",
    "in_progress",
    "Q-002",
    `${todayStr} 09:40:00`,
    "Hypertension review & BP log audit"
  );

  // 3. APT-DEMO-03: David Kim, 10:30 AM, Consultation, Confirmed (Not Checked In), no token
  const a3 = await upsertAppointment(
    "APT-DEMO-03",
    p3,
    "10:30 AM",
    "10:30:00",
    "consultation",
    "confirmed",
    null,
    null,
    "Referred from Front Desk triage"
  );

  // 4. APT-DEMO-04: Maria Santos, 11:00 AM, Follow Up, Completed, Q-003
  const a4 = await upsertAppointment(
    "APT-DEMO-04",
    p4,
    "11:00 AM",
    "11:00:00",
    "follow_up",
    "completed",
    "Q-003",
    `${todayStr} 10:15:00`,
    "Recovery normal, renewal of prescription"
  );

  console.log("Upserted appointments in MySQL:", { a1, a2, a3, a4 });

  const [verify] = await pool.query(
    `SELECT a.id, a.appointment_number, u.full_name as patient, a.appointment_time, a.status, a.queue_number
     FROM appointments a
     JOIN users u ON a.patient_id = u.id
     WHERE a.doctor_id = ? AND a.appointment_date = ?
     ORDER BY a.start_time ASC`,
    [doctorId, todayStr]
  );
  console.table(verify);

  process.exit(0);
}

seed().catch(err => {
  console.error("Seed error:", err);
  process.exit(1);
});
