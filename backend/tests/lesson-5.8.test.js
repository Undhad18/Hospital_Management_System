const assert = require("assert");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_jwt_key_at_least_32_characters_long";
const API_BASE = "http://localhost:5000/api";

async function post(endpoint, body, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body: data };
}

async function get(endpoint, token = null) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "GET",
    headers,
  });

  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body: data };
}

async function put(endpoint, body, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body: data };
}

async function patch(endpoint, body, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body: data };
}

async function runTests() {
  console.log("=================================================");
  console.log(" RUNNING TESTS: Lesson 5.8");
  console.log(" (Patient Dashboard, Appointment Booking & Lifecycle)");
  console.log("=================================================\n");

  const connection = await pool.getConnection();

  try {
    const timestamp = Date.now();
    const passHash = await bcrypt.hash("SecurePass1234#", 12);

    // Fetch Roles
    const [roles] = await connection.execute("SELECT id, name FROM roles");
    const roleMap = Object.fromEntries(roles.map((r) => [r.name, r.id]));

    // 1. Create Patient A (Incomplete Profile initially)
    const patientAEmail = `patient_58a_${timestamp}@test.com`;
    const [patARes] = await connection.execute(
      `INSERT INTO users (role_id, full_name, email, password_hash, status)
       VALUES (?, 'Sarah Jenkins', ?, ?, 'active')`,
      [roleMap.patient, patientAEmail, passHash]
    );
    const patientAId = patARes.insertId;
    await connection.execute(
      `INSERT INTO patient_profiles (user_id, is_profile_completed) VALUES (?, FALSE)`,
      [patientAId]
    );
    const tokenPatientA = jwt.sign(
      { sub: String(patientAId), email: patientAEmail, role: "patient", tokenVersion: 1 },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // 2. Create Patient B (Complete Profile)
    const patientBEmail = `patient_58b_${timestamp}@test.com`;
    const [patBRes] = await connection.execute(
      `INSERT INTO users (role_id, full_name, email, phone, password_hash, status)
       VALUES (?, 'Michael Scott', ?, '9876543210', ?, 'active')`,
      [roleMap.patient, patientBEmail, passHash]
    );
    const patientBId = patBRes.insertId;
    await connection.execute(
      `INSERT INTO patient_profiles
         (user_id, dob, gender, blood_group, address_line1, emergency_contact_name, emergency_contact_phone, is_profile_completed)
       VALUES (?, '1985-05-15', 'male', 'O+', '1725 Slough Ave', 'Dwight Schrute', '9876543211', TRUE)`,
      [patientBId]
    );
    const tokenPatientB = jwt.sign(
      { sub: String(patientBId), email: patientBEmail, role: "patient", tokenVersion: 1 },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // 3. Ensure Doctor and Department exist in Hospital 1
    const [hospRows] = await connection.execute("SELECT id FROM hospitals WHERE id = 1 LIMIT 1");
    assert.ok(hospRows.length, "Hospital 1 must exist");

    const [deptRows] = await connection.execute("SELECT id FROM departments WHERE hospital_id = 1 LIMIT 1");
    let deptId;
    if (deptRows.length) {
      deptId = deptRows[0].id;
    } else {
      const [newDept] = await connection.execute(
        "INSERT INTO departments (hospital_id, name, status) VALUES (1, 'General Medicine', 'active')"
      );
      deptId = newDept.insertId;
    }

    const [docRows] = await connection.execute(
      "SELECT id, department_id FROM users WHERE hospital_id = 1 AND role_id = ? AND status = 'active' LIMIT 1",
      [roleMap.doctor]
    );
    let docId;
    if (docRows.length) {
      docId = docRows[0].id;
      if (docRows[0].department_id) {
        deptId = docRows[0].department_id;
      } else {
        await connection.execute("UPDATE users SET department_id = ? WHERE id = ?", [deptId, docId]);
      }
    } else {
      const docEmail = `doc_58_${timestamp}@hospital1.com`;
      const [newDoc] = await connection.execute(
        `INSERT INTO users (role_id, hospital_id, department_id, full_name, email, password_hash, status)
         VALUES (?, 1, ?, 'Dr. Marcus Vance', ?, ?, 'active')`,
        [roleMap.doctor, deptId, docEmail, passHash]
      );
      docId = newDoc.insertId;
    }

    // Target appointment date: 7 days in the future
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const bookingDateStr = futureDate.toISOString().split("T")[0];
    const bookingSlot = "10:30 AM";

    // -------------------------------------------------------------
    // TEST 1: Mandatory Profile Completion Check blocks booking
    // -------------------------------------------------------------
    console.log("Test 1: Mandatory profile check blocks booking (403 Forbidden)...");
    const incompleteBookingRes = await post(
      "/patients/appointments",
      {
        hospital_id: 1,
        department_id: deptId,
        doctor_id: docId,
        appointment_date: bookingDateStr,
        appointment_time: bookingSlot,
        reason: "General Checkup",
      },
      tokenPatientA
    );
    assert.strictEqual(
      incompleteBookingRes.status,
      403,
      `Expected 403 Forbidden for incomplete profile, got ${incompleteBookingRes.status}`
    );
    assert.strictEqual(incompleteBookingRes.body.success, false);
    assert.ok(
      incompleteBookingRes.body.message.includes("complete your mandatory profile"),
      `Expected mandatory profile message, got: ${incompleteBookingRes.body.message}`
    );
    console.log("  PASS: Incomplete profile prevented from booking appointment.\n");

    // -------------------------------------------------------------
    // TEST 2: Complete Patient A's Profile and Book Successfully
    // -------------------------------------------------------------
    console.log("Test 2: Complete profile and book appointment (201 Created)...");
    const updateProfileRes = await put(
      "/patients/profile",
      {
        full_name: "Sarah Jenkins",
        phone: "9123456789",
        dob: "1992-08-20",
        gender: "female",
        blood_group: "A+",
        address_line1: "42 Park Avenue, Bandra",
        emergency_contact_name: "John Jenkins",
        emergency_contact_phone: "9123456780",
      },
      tokenPatientA
    );
    assert.strictEqual(updateProfileRes.status, 200);
    assert.strictEqual(updateProfileRes.body.data.is_profile_completed, true);

    const validBookingRes = await post(
      "/patients/appointments",
      {
        hospital_id: 1,
        department_id: deptId,
        doctor_id: docId,
        appointment_date: bookingDateStr,
        appointment_time: bookingSlot,
        reason: "Chronic Migraine Evaluation",
        payment_method: "cash",
        consultation_fee: 500,
      },
      tokenPatientA
    );
    assert.strictEqual(
      validBookingRes.status,
      201,
      `Expected 201 Created, got ${validBookingRes.status}: ${JSON.stringify(validBookingRes.body)}`
    );
    assert.strictEqual(validBookingRes.body.success, true);
    const appointmentAId = validBookingRes.body.data.id;
    assert.ok(appointmentAId, "Expected valid appointment ID");
    assert.ok(validBookingRes.body.data.appointment_number.startsWith("APT-"));
    console.log(`  PASS: Appointment #${appointmentAId} booked successfully (${validBookingRes.body.data.appointment_number}).\n`);

    // -------------------------------------------------------------
    // TEST 3: Slot Collision Detection
    // -------------------------------------------------------------
    console.log("Test 3: Slot collision detection (409 Conflict)...");
    const collisionRes = await post(
      "/patients/appointments",
      {
        hospital_id: 1,
        department_id: deptId,
        doctor_id: docId,
        appointment_date: bookingDateStr,
        appointment_time: bookingSlot, // exact same slot
        reason: "Followup Checkup",
      },
      tokenPatientB
    );
    assert.strictEqual(
      collisionRes.status,
      409,
      `Expected 409 Conflict for double-booking, got ${collisionRes.status}`
    );
    assert.strictEqual(collisionRes.body.success, false);
    assert.ok(
      collisionRes.body.message.includes("already occupied"),
      `Expected occupied slot message, got: ${collisionRes.body.message}`
    );
    console.log("  PASS: Slot collision detected and rejected.\n");

    // -------------------------------------------------------------
    // TEST 4: Scoped Appointment History
    // -------------------------------------------------------------
    console.log("Test 4: Appointment history multi-tenant isolation...");
    const patientAAppointments = await get("/patients/appointments", tokenPatientA);
    assert.strictEqual(patientAAppointments.status, 200);
    assert.ok(patientAAppointments.body.data.some((a) => a.id === appointmentAId));

    const patientBAppointments = await get("/patients/appointments", tokenPatientB);
    assert.strictEqual(patientBAppointments.status, 200);
    assert.ok(
      !patientBAppointments.body.data.some((a) => a.id === appointmentAId),
      "Patient B should not see Patient A's appointment"
    );
    console.log("  PASS: Appointment lists strictly isolated by authenticated user ID.\n");

    // -------------------------------------------------------------
    // TEST 5: IDOR Protection on Cancellation
    // -------------------------------------------------------------
    console.log("Test 5: IDOR Protection on Appointment Cancellation (403 Forbidden)...");
    const idorCancelRes = await patch(
      `/patients/appointments/${appointmentAId}/cancel`,
      {},
      tokenPatientB
    );
    assert.strictEqual(
      idorCancelRes.status,
      403,
      `Expected 403 Forbidden for IDOR cancellation, got ${idorCancelRes.status}`
    );
    assert.strictEqual(idorCancelRes.body.success, false);
    console.log("  PASS: Patient B blocked from cancelling Patient A's appointment.\n");

    // -------------------------------------------------------------
    // TEST 6: Patient A Cancels Own Appointment & Duplicate Cancellation Prevention
    // -------------------------------------------------------------
    console.log("Test 6: Patient A cancels own appointment (200 OK)...");
    const cancelRes = await patch(
      `/patients/appointments/${appointmentAId}/cancel`,
      {},
      tokenPatientA
    );
    assert.strictEqual(cancelRes.status, 200, `Expected 200 OK, got ${cancelRes.status}`);
    assert.strictEqual(cancelRes.body.success, true);

    const reCancelRes = await patch(
      `/patients/appointments/${appointmentAId}/cancel`,
      {},
      tokenPatientA
    );
    assert.strictEqual(
      reCancelRes.status,
      400,
      `Expected 400 Bad Request on re-cancelling already cancelled appointment, got ${reCancelRes.status}`
    );
    console.log("  PASS: Appointment cancelled and redundant cancellation prevented.\n");

    // -------------------------------------------------------------
    // TEST 7: Patient Dashboard Telemetry & Metrics
    // -------------------------------------------------------------
    console.log("Test 7: Patient Dashboard Overview & Telemetry (200 OK)...");
    const dashboardRes = await get("/patients/dashboard", tokenPatientA);
    assert.strictEqual(dashboardRes.status, 200, `Expected 200 OK, got ${dashboardRes.status}`);
    assert.strictEqual(dashboardRes.body.success, true);
    assert.strictEqual(dashboardRes.body.data.profile.is_profile_completed, true);
    assert.strictEqual(dashboardRes.body.data.metrics.total_appointments_count, 1);
    assert.strictEqual(dashboardRes.body.data.metrics.past_appointments_count, 1); // cancelled falls in past
    assert.ok(Array.isArray(dashboardRes.body.data.recent_appointments));
    console.log("  PASS: Patient Dashboard telemetry metrics correctly returned.\n");

    console.log("=================================================");
    console.log(" ALL 7 TESTS IN LESSON 5.8 PASSED SUCCESSFULLY! ");
    console.log("=================================================");
  } finally {
    connection.release();
    await pool.end();
  }
}

runTests().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
