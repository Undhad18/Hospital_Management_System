const pool = require("../db");
const bcrypt = require("bcryptjs");

async function seedFrontDesk() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const passHash = await bcrypt.hash("password", 10);

    // 1. Roles map
    const [roles] = await connection.execute("SELECT id, name FROM roles");
    const roleMap = {};
    roles.forEach((r) => (roleMap[r.name] = r.id));

    // 2. Departments for Hospital 1
    // Ensure Cardiology (23), General Medicine (1), Orthopedics
    let [orthoDept] = await connection.execute(
      "SELECT id FROM departments WHERE hospital_id = 1 AND name = 'Orthopedics' LIMIT 1"
    );
    let orthoDeptId;
    if (orthoDept.length > 0) {
      orthoDeptId = orthoDept[0].id;
    } else {
      const [newOrtho] = await connection.execute(
        `INSERT INTO departments (hospital_id, master_department_id, name, description, status)
         VALUES (1, 3, 'Orthopedics', 'Orthopedic surgery and joint reconstruction', 'active')`
      );
      orthoDeptId = newOrtho.insertId;
    }

    const cardioDeptId = 23;
    const genMedDeptId = 1;

    // 3. Ensure Doctors exist in Hospital 1
    // Doctor: Dr. Sarah Jenkins (Cardiology, id: 39)
    await connection.execute(
      "UPDATE users SET department_id = 23, hospital_id = 1, status = 'active' WHERE id = 39"
    );

    // Doctor: Dr. Marcus Reed (Orthopedics)
    let [docReed] = await connection.execute(
      "SELECT id FROM users WHERE full_name = 'Dr. Marcus Reed' AND hospital_id = 1 LIMIT 1"
    );
    let doctorReedId;
    if (docReed.length > 0) {
      doctorReedId = docReed[0].id;
      await connection.execute("UPDATE users SET department_id = ?, status = 'active' WHERE id = ?", [orthoDeptId, doctorReedId]);
    } else {
      const [newReed] = await connection.execute(
        `INSERT INTO users (role_id, hospital_id, department_id, full_name, email, password_hash, phone, status)
         VALUES (?, 1, ?, 'Dr. Marcus Reed', 'marcus.reed@hms.com', ?, '+91-9876500302', 'active')`,
        [roleMap.doctor, orthoDeptId, passHash]
      );
      doctorReedId = newReed.insertId;
    }

    // Doctor: Dr. Liam Patel (General Medicine)
    let [docPatel] = await connection.execute(
      "SELECT id FROM users WHERE full_name = 'Dr. Liam Patel' AND hospital_id = 1 LIMIT 1"
    );
    let doctorPatelId;
    if (docPatel.length > 0) {
      doctorPatelId = docPatel[0].id;
      await connection.execute("UPDATE users SET department_id = 1, status = 'active' WHERE id = ?", [doctorPatelId]);
    } else {
      const [newPatel] = await connection.execute(
        `INSERT INTO users (role_id, hospital_id, department_id, full_name, email, password_hash, phone, status)
         VALUES (?, 1, 1, 'Dr. Liam Patel', 'liam.patel@hms.com', ?, '+91-9876500303', 'active')`,
        [roleMap.doctor, passHash]
      );
      doctorPatelId = newPatel.insertId;
    }

    // 4. Ensure Patients exist
    async function ensurePatient(fullName, email, phone) {
      let [p] = await connection.execute("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
      if (p.length > 0) return p[0].id;
      const [newP] = await connection.execute(
        `INSERT INTO users (role_id, full_name, email, password_hash, phone, status)
         VALUES (?, ?, ?, ?, ?, 'active')`,
        [roleMap.patient, fullName, email, passHash, phone]
      );
      return newP.insertId;
    }

    const patientHarshilId = await ensurePatient("Undhad Harshil", "harshil.patient@hms.com", "+91-9876500101");
    const patientEleanorId = await ensurePatient("Eleanor Vance", "eleanor.vance@hms.com", "+91-9876500102");
    const patientRobertId  = await ensurePatient("Robert Chen", "robert.chen@hms.com", "+91-9876500103");
    const patientAminaId   = await ensurePatient("Amina Yusuf", "amina.yusuf@hms.com", "+91-9876500104");
    const patientDavidId   = await ensurePatient("David Kim", "david.kim@hms.com", "+91-9876500105");

    const todayStr = new Date().toISOString().split("T")[0];

    // Delete any old seed appointments with appointment_number starting with APT-TODAY- or APT-SEED-
    await connection.execute(
      "DELETE FROM appointments WHERE appointment_number IN ('CHK-501', 'CHK-502', 'CHK-503', 'CHK-504', 'APT-TODAY-01', 'APT-TODAY-02') OR (hospital_id = 1 AND appointment_date = ? AND queue_number IN ('Q-001','Q-002','Q-003','Q-004'))",
      [todayStr]
    );

    // 5. Seed the 4 Checked-In Patients for Today (Q-001, Q-002, Q-003, Q-004)
    // Q-001
    await connection.execute(
      `INSERT INTO appointments
       (appointment_number, patient_id, hospital_id, department_id, doctor_id,
        appointment_date, appointment_time, start_time, end_time, status, reason,
        queue_number, check_in_time, checked_in_by)
       VALUES ('CHK-501', ?, 1, 23, 39,
        ?, '09:15 AM', '09:15:00', '09:45:00', 'in_waiting', 'Routine cardiology consultation',
        'Q-001', CONCAT(?, ' 09:15:00'), 40)`,
      [patientHarshilId, todayStr, todayStr]
    );

    // Q-002 (In Consultation with Doctor)
    await connection.execute(
      `INSERT INTO appointments
       (appointment_number, patient_id, hospital_id, department_id, doctor_id,
        appointment_date, appointment_time, start_time, end_time, status, reason,
        queue_number, check_in_time, checked_in_by)
       VALUES ('CHK-502', ?, 1, 23, 39,
        ?, '09:40 AM', '09:40:00', '10:10:00', 'in_progress', 'Follow-up hypertension assessment',
        'Q-002', CONCAT(?, ' 09:40:00'), 40)`,
      [patientEleanorId, todayStr, todayStr]
    );

    // Q-003
    await connection.execute(
      `INSERT INTO appointments
       (appointment_number, patient_id, hospital_id, department_id, doctor_id,
        appointment_date, appointment_time, start_time, end_time, status, reason,
        queue_number, check_in_time, checked_in_by)
       VALUES ('CHK-503', ?, 1, ?, ?,
        ?, '10:02 AM', '10:02:00', '10:30:00', 'in_waiting', 'Knee joint pain evaluation',
        'Q-003', CONCAT(?, ' 10:02:00'), 40)`,
      [patientRobertId, orthoDeptId, doctorReedId, todayStr, todayStr]
    );

    // Q-004
    await connection.execute(
      `INSERT INTO appointments
       (appointment_number, patient_id, hospital_id, department_id, doctor_id,
        appointment_date, appointment_time, start_time, end_time, status, reason,
        queue_number, check_in_time, checked_in_by)
       VALUES ('CHK-504', ?, 1, 1, ?,
        ?, '10:20 AM', '10:20:00', '10:45:00', 'in_waiting', 'Seasonal allergic rhinitis',
        'Q-004', CONCAT(?, ' 10:20:00'), 40)`,
      [patientAminaId, doctorPatelId, todayStr, todayStr]
    );

    // 6. Seed the 2 Confirmed Appointments Awaiting Check-In for Today
    // APT-TODAY-01: Undhad Harshil, Cardiology, Dr. Sarah Jenkins (11:30 AM)
    await connection.execute(
      `INSERT INTO appointments
       (appointment_number, patient_id, hospital_id, department_id, doctor_id,
        appointment_date, appointment_time, start_time, end_time, status, reason)
       VALUES ('APT-TODAY-01', ?, 1, 23, 39,
        ?, '11:30 AM', '11:30:00', '12:00:00', 'confirmed', 'Cardiology follow-up & ECG check')`,
      [patientHarshilId, todayStr]
    );

    // APT-TODAY-02: David Kim, General Medicine, Dr. Liam Patel (12:00 PM)
    await connection.execute(
      `INSERT INTO appointments
       (appointment_number, patient_id, hospital_id, department_id, doctor_id,
        appointment_date, appointment_time, start_time, end_time, status, reason)
       VALUES ('APT-TODAY-02', ?, 1, 1, ?,
        ?, '12:00 PM', '12:00:00', '12:30:00', 'confirmed', 'Comprehensive health checkup')`,
      [patientDavidId, doctorPatelId, todayStr]
    );

    await connection.commit();
    console.log("Successfully seeded persistent queue (Q-001 to Q-004) and pending arrivals (APT-TODAY-01, APT-TODAY-02) in MySQL!");
  } catch (err) {
    await connection.rollback();
    console.error("Seed error:", err);
  } finally {
    connection.release();
    process.exit(0);
  }
}

seedFrontDesk().catch(console.error);
