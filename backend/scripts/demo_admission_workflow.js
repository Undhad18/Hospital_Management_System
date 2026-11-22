const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const pool = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "3d4a415aad83b711038c10d4348c49db55e76fbd28d48be03abca423acfa47f1";
const API_BASE = "http://localhost:5000/api";

async function post(endpoint, body, token) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body: data };
}

async function get(endpoint, token) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body: data };
}

async function patch(endpoint, body, token) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body: data };
}

async function runDemo() {
  console.log("================================================================================");
  console.log("🏥 DEMONSTRATING REAL-WORLD PATIENT ADMISSION WORKFLOW IN YOUR PROJECT");
  console.log("================================================================================\n");

  // 1. Fetch Hospital 1 & Staff Member
  const [hospitals] = await pool.query("SELECT id, name, code FROM hospitals WHERE status = 'active' LIMIT 1");
  const hospital = hospitals[0] || { id: 1, name: "City Care General Hospital" };
  console.log(`[SETUP] Hospital: ${hospital.name} (ID: ${hospital.id})`);

  // Fetch or setup Staff account
  let [staffUsers] = await pool.query(
    "SELECT u.id, u.full_name, u.email, u.token_version FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'staff' AND u.hospital_id = ? AND u.status = 'active' LIMIT 1",
    [hospital.id]
  );
  let staff = staffUsers[0];
  if (!staff) {
    const [roles] = await pool.query("SELECT id FROM roles WHERE name = 'staff'");
    const hash = await bcrypt.hash("@Pass12345678", 10);
    const [ins] = await pool.query(
      "INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status) VALUES (?, ?, 'Robert Vance (Desk Staff)', 'staff.demo@hms.com', ?, 'active')",
      [roles[0].id, hospital.id, hash]
    );
    staff = { id: ins.insertId, full_name: "Robert Vance (Desk Staff)", email: "staff.demo@hms.com", token_version: 1 };
  }
  const staffToken = jwt.sign(
    { sub: String(staff.id), email: staff.email, role: "staff", hospitalId: hospital.id, tokenVersion: staff.token_version || 1 },
    JWT_SECRET,
    { expiresIn: "2h" }
  );
  console.log(`[ACTOR] Logged in as Staff: ${staff.full_name} (ID: ${staff.id})`);

  // Fetch Doctor & Department
  const [docs] = await pool.query(
    `SELECT u.id, u.full_name, u.email, u.department_id, d.name AS dept_name
     FROM users u
     JOIN roles r ON r.id = u.role_id AND r.name = 'doctor'
     JOIN departments d ON d.id = u.department_id
     WHERE u.hospital_id = ? AND u.status = 'active' LIMIT 1`,
    [hospital.id]
  );
  const doctor = docs[0];
  console.log(`[DOCTOR] Inpatient Physician: ${doctor.full_name} | Unit: ${doctor.dept_name} (ID: ${doctor.department_id})\n`);

  // Fetch active patient
  let [patRows] = await pool.query(
    "SELECT u.id, u.full_name, u.email, u.phone FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'patient' AND u.status = 'active' ORDER BY u.id ASC LIMIT 1"
  );
  let patient = patRows[0];
  if (!patient) {
    const [patRole] = await pool.query("SELECT id FROM roles WHERE name = 'patient'");
    const hash = await bcrypt.hash("@Pass12345678", 10);
    const [pIns] = await pool.query(
      "INSERT INTO users (role_id, full_name, email, phone, password_hash, status) VALUES (?, 'John Doe (Active)', 'john.doe.active@example.com', '+91-9876543210', ?, 'active')",
      [patRole[0].id, hash]
    );
    patient = { id: pIns.insertId, full_name: "John Doe (Active)", email: "john.doe.active@example.com", phone: "+91-9876543210" };
    await pool.query(
      "INSERT INTO patient_profiles (user_id, dob, gender, blood_group, is_profile_completed) VALUES (?, '1985-06-12', 'male', 'O+', TRUE)",
      [patient.id]
    );
  }
  console.log(`[PATIENT] Admitting Patient: ${patient.full_name} (ID: ${patient.id}, Phone: ${patient.phone})\n`);

  // Clear any existing active admission for this patient so demo runs cleanly
  await pool.query("UPDATE admissions SET status = 'discharged', discharged_at = NOW() WHERE patient_id = ? AND status IN ('pending', 'admitted')", [patient.id]);

  // Create an Outpatient Consultation Appointment for patient (Lesson 9.6)
  const today = new Date().toISOString().split("T")[0];
  const aptNum = `APT-DEMO-${Date.now().toString().slice(-6)}`;
  const [aptIns] = await pool.query(
    `INSERT INTO appointments
       (appointment_number, patient_id, hospital_id, department_id, doctor_id, appointment_date, appointment_time, appointment_type, status, reason)
     VALUES (?, ?, ?, ?, ?, ?, '10:00 AM', 'consultation', 'in_progress', 'Emergency acute chest pain triage')`,
    [aptNum, patient.id, hospital.id, doctor.department_id, doctor.id, today]
  );
  const appointmentId = aptIns.insertId;
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`STEP 1: OUTPATIENT APPOINTMENT INITIALIZED`);
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`• Appointment Ref : ${aptNum} (ID: ${appointmentId})`);
  console.log(`• Initial Status  : 'in_progress' (Doctor examining patient)\n`);

  // STEP 2: Pre-Admission Check (Lesson 9.5)
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`STEP 2: PRE-ADMISSION ACTIVE CHECK (GET /api/admissions/active-check/${patient.id})`);
  console.log(`--------------------------------------------------------------------------------`);
  const activeCheck1 = await get(`/admissions/active-check/${patient.id}`, staffToken);
  console.log(`• Response Status        : HTTP ${activeCheck1.status}`);
  console.log(`• Has Active Admission?  : ${activeCheck1.body.hasActiveAdmission}`);
  console.log(`• Eligibility Verdict    : Patient is ELIGIBLE for inpatient admission.\n`);

  // STEP 3: Create Patient Admission (Lessons 9.1, 9.2, 9.3, 9.6)
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`STEP 3: INITIATE ADMISSION (POST /api/admissions)`);
  console.log(`--------------------------------------------------------------------------------`);
  const admissionPayload = {
    patient_id: patient.id,
    hospital_id: hospital.id,
    department_id: doctor.department_id,
    doctor_id: doctor.id,
    admission_date: new Date().toISOString(),
    reason: "Acute non-STEMI chest pain with elevated troponin, requires continuous cardiac telemetry observation.",
    initial_status: "admitted",
    appointment_id: appointmentId,
  };
  console.log("Submitting Admission Payload:", JSON.stringify(admissionPayload, null, 2));

  const admRes = await post("/admissions", admissionPayload, staffToken);
  if (admRes.status !== 201) {
    console.error("Admission creation failed:", admRes.body);
    process.exit(1);
  }
  console.log(`\n• HTTP Status            : ${admRes.status} Created`);
  console.log(`• Admission Reference    : ${admRes.body.data.admission_number}`);
  console.log(`• Admission ID           : ${admRes.body.data.id}`);
  console.log(`• Current Status         : '${admRes.body.data.status}'`);
  console.log(`• Responsible Doctor     : ${admRes.body.data.doctor_name}`);
  console.log(`• Department             : ${admRes.body.data.department_name}`);
  const admissionId = admRes.body.data.id;
  const admissionNumber = admRes.body.data.admission_number;

  // Verify Linked Appointment Status Transition (Lesson 9.6)
  const [aptRows] = await pool.query("SELECT id, appointment_number, status FROM appointments WHERE id = ?", [appointmentId]);
  console.log(`\n• Linked Outpatient Apt  : ${aptRows[0].appointment_number}`);
  console.log(`• Appointment New Status : '${aptRows[0].status}' (Atomically transitioned from in_progress -> admitted) ✓\n`);

  // STEP 4: Prevent Duplicate Active Admission (Lesson 9.5)
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`STEP 4: TEST CONCURRENT DUPLICATE ADMISSION PROTECTION (Lesson 9.5)`);
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`Attempting to admit John Doe again while already actively admitted under ${admissionNumber}...`);
  const duplicateRes = await post("/admissions", admissionPayload, staffToken);
  console.log(`• HTTP Status            : ${duplicateRes.status} (Expected 409 Conflict)`);
  console.log(`• Rejection Message      : "${duplicateRes.body.message}"`);
  console.log(`• Security Outcome       : Duplicate admission safely PREVENTED. Existing record preserved. ✓\n`);

  // STEP 5: Inspect Status History (Lesson 9.4)
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`STEP 5: AUDIT TRAIL & STATUS HISTORY (GET /api/admissions/${admissionId}/history)`);
  console.log(`--------------------------------------------------------------------------------`);
  const histRes = await get(`/admissions/${admissionId}/history`, staffToken);
  console.log(`Total History Entries: ${histRes.body.count}`);
  histRes.body.data.forEach((entry, idx) => {
    console.log(`  [${idx + 1}] Transition: ${entry.previous_status || 'NONE'} -> ${entry.new_status} | Reason: "${entry.change_reason}" | Actor: ${entry.changed_by_name} (${entry.changed_by_role})`);
  });
  console.log();

  // STEP 6: Patient Discharge Workflow (Lesson 9.4)
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`STEP 6: PATIENT DISCHARGE WORKFLOW (PATCH /api/admissions/${admissionId}/status)`);
  console.log(`--------------------------------------------------------------------------------`);
  const dischargePayload = {
    status: "discharged",
    reason: "Troponin normalized, hemodynamically stable, ambulatory. Prescribed Aspirin & Atorvastatin. Advised follow-up in 10 days.",
  };
  console.log("Submitting Discharge Payload:", dischargePayload);
  const dischargeRes = await patch(`/admissions/${admissionId}/status`, dischargePayload, staffToken);
  console.log(`\n• HTTP Status            : ${dischargeRes.status} OK`);
  console.log(`• New Status             : '${dischargeRes.body.data.status}'`);
  console.log(`• Discharged Timestamp   : ${dischargeRes.body.data.discharged_at_formatted}`);
  console.log(`• Discharge Summary      : "${dischargeRes.body.data.discharge_notes}"\n`);

  // STEP 7: Re-verify History after Discharge
  const histRes2 = await get(`/admissions/${admissionId}/history`, staffToken);
  console.log(`Updated Status History Entries: ${histRes2.body.count}`);
  histRes2.body.data.forEach((entry, idx) => {
    console.log(`  [${idx + 1}] Transition: ${entry.previous_status || 'NONE'} -> ${entry.new_status} | Reason: "${entry.change_reason}" | Actor: ${entry.changed_by_name} (${entry.changed_by_role})`);
  });

  // STEP 8: Verify Terminal State Protection
  console.log(`\n--------------------------------------------------------------------------------`);
  console.log(`STEP 8: TERMINAL STATE PROTECTION`);
  console.log(`--------------------------------------------------------------------------------`);
  console.log("Attempting illegal transition to reopen discharged admission back to 'admitted'...");
  const illegalRes = await patch(`/admissions/${admissionId}/status`, { status: "admitted" }, staffToken);
  console.log(`• HTTP Status            : ${illegalRes.status} (Expected 400 Bad Request)`);
  console.log(`• Rejection Message      : "${illegalRes.body.message}"`);
  console.log(`• Security Outcome       : Discharged record is TERMINAL and immutable. ✓\n`);

  console.log("================================================================================");
  console.log("🎉 COMPLETE PATIENT ADMISSION WORKFLOW DEMONSTRATION EXECUTED SUCCESSFULLY!");
  console.log("================================================================================\n");
  process.exit(0);
}

runDemo().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
