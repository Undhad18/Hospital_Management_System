const assert = require("assert");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "3d4a415aad83b711038c10d4348c49db55e76fbd28d48be03abca423acfa47f1";
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
  console.log("==================================================================");
  console.log("=== Running Lesson 11.5 Linking Tests to Appointments Suite ======");
  console.log("==================================================================");

  const stamp = Date.now();

  const [roleRows] = await pool.execute("SELECT id, name FROM roles");
  const roleMap = {};
  for (const r of roleRows) roleMap[r.name] = r.id;

  const passwordHash = await bcrypt.hash("@Pass12345678", 10);

  // 1. Fixtures: Hospital 1 and Hospital 2
  const [h1Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, status)
     VALUES (?, ?, ?, 'active')`,
    [`City Central Hospital ${stamp}`, `CCH1-${stamp}`, `cch1_${stamp}@m11.com`]
  );
  const hospital1Id = h1Res.insertId;

  const [h2Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, status)
     VALUES (?, ?, ?, 'active')`,
    [`Metro General Hospital ${stamp}`, `MGH2-${stamp}`, `mgh2_${stamp}@m11.com`]
  );
  const hospital2Id = h2Res.insertId;

  // Departments
  const [dept1Res] = await pool.execute(
    `INSERT INTO departments (hospital_id, name, status) VALUES (?, 'Internal Medicine', 'active')`,
    [hospital1Id]
  );
  const dept1Id = dept1Res.insertId;

  const [dept2Res] = await pool.execute(
    `INSERT INTO departments (hospital_id, name, status) VALUES (?, 'Surgery', 'active')`,
    [hospital2Id]
  );
  const dept2Id = dept2Res.insertId;

  // 2. Users
  // Super Admin
  const [saRes] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [roleMap["super_admin"], `Super Admin ${stamp}`, `sa_${stamp}@m11.com`, passwordHash]
  );
  const saId = saRes.insertId;

  // Doctor 1 (Hospital 1)
  const [doc1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, department_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, ?, 'active')`,
    [roleMap["doctor"], hospital1Id, dept1Id, `Dr. One ${stamp}`, `doc1_${stamp}@m11.com`, passwordHash]
  );
  const doc1Id = doc1Res.insertId;

  // Doctor 2 (Hospital 2)
  const [doc2Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, department_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, ?, 'active')`,
    [roleMap["doctor"], hospital2Id, dept2Id, `Dr. Two ${stamp}`, `doc2_${stamp}@m11.com`, passwordHash]
  );
  const doc2Id = doc2Res.insertId;

  // Staff 1 (Hospital 1)
  const [staff1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [roleMap["staff"], hospital1Id, `Staff One ${stamp}`, `staff1_${stamp}@m11.com`, passwordHash]
  );
  const staff1Id = staff1Res.insertId;

  // Patient 1
  const [pat1Res] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [roleMap["patient"], `Patient Alpha ${stamp}`, `pat1_${stamp}@m11.com`, passwordHash]
  );
  const patient1Id = pat1Res.insertId;

  // Patient 2
  const [pat2Res] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [roleMap["patient"], `Patient Beta ${stamp}`, `pat2_${stamp}@m11.com`, passwordHash]
  );
  const patient2Id = pat2Res.insertId;

  function makeToken(id, role, hospId = null) {
    return jwt.sign(
      { sub: id, role, hospitalId: hospId, tokenVersion: 1 },
      JWT_SECRET,
      { expiresIn: "2h" }
    );
  }

  const saToken = makeToken(saId, "super_admin");
  const doc1Token = makeToken(doc1Id, "doctor", hospital1Id);
  const doc2Token = makeToken(doc2Id, "doctor", hospital2Id);
  const staff1Token = makeToken(staff1Id, "staff", hospital1Id);
  const pat1Token = makeToken(patient1Id, "patient");
  const pat2Token = makeToken(patient2Id, "patient");

  // 3. Master Lab Tests & Hospital Offerings
  const [m1] = await pool.execute(
    `INSERT INTO master_lab_tests (test_code, test_name, category, sample_type, standard_turnaround_hours, status)
     VALUES (?, 'Serum Electrolytes (Na/K/Cl)', 'Biochemistry', 'Serum', 6, 'active')`,
    [`ELY-${stamp}`]
  );
  const master1Id = m1.insertId;

  const [m2] = await pool.execute(
    `INSERT INTO master_lab_tests (test_code, test_name, category, sample_type, standard_turnaround_hours, status)
     VALUES (?, 'Renal Function Test (RFT)', 'Biochemistry', 'Serum', 8, 'active')`,
    [`RFT-${stamp}`]
  );
  const master2Id = m2.insertId;

  // Assign to Hospital 1 (Electrolytes: ₹320.00, RFT: ₹450.00)
  await pool.execute(
    `INSERT INTO hospital_lab_tests (hospital_id, master_test_id, price, status)
     VALUES (?, ?, 320.00, 'active'), (?, ?, 450.00, 'active')`,
    [hospital1Id, master1Id, hospital1Id, master2Id]
  );

  // 4. Create Appointments
  // Appointment 1: Patient 1 at Hospital 1 (confirmed)
  const [apt1Res] = await pool.execute(
    `INSERT INTO appointments
      (appointment_number, patient_id, hospital_id, department_id, doctor_id,
       appointment_date, appointment_time, start_time, end_time, status, queue_number, check_in_time, reason)
     VALUES (?, ?, ?, ?, ?, CURDATE(), '10:00 AM', '10:00:00', '10:30:00', 'confirmed', 'Q-115A', CURRENT_TIMESTAMP, 'Pre-op assessment')`,
    [`APT-L115A-${stamp}`, patient1Id, hospital1Id, dept1Id, doc1Id]
  );
  const apt1Id = apt1Res.insertId;

  // Appointment 2: Patient 1 at Hospital 1 (cancelled)
  const [apt2Res] = await pool.execute(
    `INSERT INTO appointments
      (appointment_number, patient_id, hospital_id, department_id, doctor_id,
       appointment_date, appointment_time, start_time, end_time, status, queue_number, check_in_time, reason)
     VALUES (?, ?, ?, ?, ?, CURDATE(), '11:00 AM', '11:00:00', '11:30:00', 'cancelled', 'Q-115B', CURRENT_TIMESTAMP, 'Cancelled appointment')`,
    [`APT-L115B-${stamp}`, patient1Id, hospital1Id, dept1Id, doc1Id]
  );
  const apt2Id = apt2Res.insertId;

  // Appointment 3: Patient 2 at Hospital 2
  const [apt3Res] = await pool.execute(
    `INSERT INTO appointments
      (appointment_number, patient_id, hospital_id, department_id, doctor_id,
       appointment_date, appointment_time, start_time, end_time, status, queue_number, check_in_time, reason)
     VALUES (?, ?, ?, ?, ?, CURDATE(), '02:00 PM', '14:00:00', '14:30:00', 'confirmed', 'Q-115C', CURRENT_TIMESTAMP, 'Consultation')`,
    [`APT-L115C-${stamp}`, patient2Id, hospital2Id, dept2Id, doc2Id]
  );
  const apt3Id = apt3Res.insertId;

  try {
    // ------------------------------------------------------------------------
    // Test 1: Order lab tests directly linked to Appointment 1
    // ------------------------------------------------------------------------
    console.log("Test 1: Staff orders Electrolytes (@ ₹320.00) linked to Appointment 1...");
    const orderRes = await post(
      `/labs/appointments/${apt1Id}/tests`,
      {
        master_test_ids: [master1Id, master2Id],
        priority: "urgent",
        clinical_notes: "Pre-procedure baseline screening",
      },
      staff1Token
    );
    assert.strictEqual(orderRes.status, 201, "Order placement failed");
    assert.strictEqual(orderRes.body.data.length, 2);

    const elyOrder = orderRes.body.data.find((o) => o.master_test_id === master1Id);
    assert.strictEqual(elyOrder.appointment_id, apt1Id);
    assert.strictEqual(elyOrder.patient_id, patient1Id);
    assert.strictEqual(elyOrder.hospital_id, hospital1Id);
    assert.strictEqual(elyOrder.priority, "urgent");
    assert.strictEqual(parseFloat(elyOrder.price), 320.0, "Price snapshot must match ₹320.00");
    assert.ok(elyOrder.order_number && elyOrder.order_number.startsWith("LAB-"));
    console.log("-> PASSED: Lab tests successfully ordered and linked to Appointment 1.");

    // ------------------------------------------------------------------------
    // Test 2: Reject ordering tests for a cancelled appointment
    // ------------------------------------------------------------------------
    console.log("Test 2: Reject ordering tests for cancelled appointment...");
    const cancelTry = await post(
      `/labs/appointments/${apt2Id}/tests`,
      { master_test_id: master1Id },
      staff1Token
    );
    assert.strictEqual(cancelTry.status, 400, "Should reject cancelled appointment with 400");
    console.log("-> PASSED: Cancelled appointment test order rejected.");

    // ------------------------------------------------------------------------
    // Test 3: Reject ordering tests not offered by the appointment's hospital
    // ------------------------------------------------------------------------
    console.log("Test 3: Reject ordering tests not offered by hospital facility...");
    // Master 1 is not assigned to Hospital 2
    const unofferedTry = await post(
      `/labs/appointments/${apt3Id}/tests`,
      { master_test_id: master1Id },
      doc2Token
    );
    assert.strictEqual(unofferedTry.status, 400, "Should reject unoffered test with 400");
    console.log("-> PASSED: Unoffered test order rejected.");

    // ------------------------------------------------------------------------
    // Test 4: Patient retrieves their own appointment's lab tests
    // ------------------------------------------------------------------------
    console.log("Test 4: Patient 1 retrieves linked lab tests for Appointment 1...");
    const patGet = await get(`/labs/appointments/${apt1Id}/tests`, pat1Token);
    assert.strictEqual(patGet.status, 200);
    assert.strictEqual(patGet.body.total_tests, 2);
    assert.strictEqual(patGet.body.total_amount, 770.0); // 320 + 450
    assert.strictEqual(patGet.body.tests[0].appointment_id, apt1Id);
    console.log("-> PASSED: Patient 1 accessed their appointment lab orders and summary amount.");

    // ------------------------------------------------------------------------
    // Test 5: Patient 2 is blocked from viewing Patient 1's appointment tests
    // ------------------------------------------------------------------------
    console.log("Test 5: Cross-patient authorization check (Patient 2 blocked)...");
    const crossPat = await get(`/labs/appointments/${apt1Id}/tests`, pat2Token);
    assert.strictEqual(crossPat.status, 403, "Cross-patient view must return 403 Forbidden");
    console.log("-> PASSED: Cross-patient access strictly forbidden.");

    // ------------------------------------------------------------------------
    // Test 6: Cross-hospital authorization check (Doctor 2 blocked from Hospital 1 appointment)
    // ------------------------------------------------------------------------
    console.log("Test 6: Cross-hospital authorization check (Doctor 2 blocked)...");
    const crossHosp = await get(`/labs/appointments/${apt1Id}/tests`, doc2Token);
    assert.strictEqual(crossHosp.status, 403, "Cross-hospital view must return 403 Forbidden");
    console.log("-> PASSED: Cross-hospital appointment access blocked.");

    // ------------------------------------------------------------------------
    // Test 7: Patient & Hospital Consistency check in POST /api/labs/orders
    // ------------------------------------------------------------------------
    console.log("Test 7: Consistency validation in generic order placement (POST /api/labs/orders)...");
    // Attempt with mismatched patient_id
    const mismatchPat = await post(
      "/labs/orders",
      {
        patient_id: patient2Id, // Mismatched! Apt 1 belongs to Patient 1
        hospital_id: hospital1Id,
        appointment_id: apt1Id,
        master_test_id: master1Id,
      },
      staff1Token
    );
    assert.strictEqual(mismatchPat.status, 400, "Mismatched patient must return 400");

    // Attempt with mismatched hospital_id
    const mismatchHosp = await post(
      "/labs/orders",
      {
        patient_id: patient1Id,
        hospital_id: hospital2Id, // Mismatched! Apt 1 is at Hospital 1
        appointment_id: apt1Id,
        master_test_id: master1Id,
      },
      saToken
    );
    assert.strictEqual(mismatchHosp.status, 400, "Mismatched hospital must return 400");
    console.log("-> PASSED: Appointment patient and hospital consistency enforced.");

    // ------------------------------------------------------------------------
    // Test 8: PATCH /api/labs/orders/:id/link-appointment
    // ------------------------------------------------------------------------
    console.log("Test 8: Re-linking / linking an order to appointment...");
    // Create an unlinked order for Patient 1 at Hospital 1
    const unlinkedOrderRes = await post(
      "/labs/orders",
      {
        patient_id: patient1Id,
        hospital_id: hospital1Id,
        master_test_id: master1Id,
      },
      staff1Token
    );
    assert.strictEqual(unlinkedOrderRes.status, 201);
    const unlinkedOrderId = unlinkedOrderRes.body.data.id;

    // Link it to Appointment 1
    const linkRes = await patch(
      `/labs/orders/${unlinkedOrderId}/link-appointment`,
      { appointment_id: apt1Id },
      staff1Token
    );
    assert.strictEqual(linkRes.status, 200, "Linking order failed");
    assert.strictEqual(linkRes.body.data.appointment_id, apt1Id);

    // Verify in database
    const [checkDb] = await pool.query(
      "SELECT appointment_id FROM investigation_requests WHERE id = ?",
      [unlinkedOrderId]
    );
    assert.strictEqual(checkDb[0].appointment_id, apt1Id);

    // Attempting to link to Patient 2's appointment (Appointment 3) -> rejected
    const invalidLink = await patch(
      `/labs/orders/${unlinkedOrderId}/link-appointment`,
      { appointment_id: apt3Id },
      saToken
    );
    assert.strictEqual(invalidLink.status, 400, "Mismatched patient linking must return 400");
    console.log("-> PASSED: Appointment linking and re-linking validation verified.");

    console.log("\n==================================================================");
    console.log("=== ALL LESSON 11.5 TESTS PASSED PERFECTLY ===");
    console.log("==================================================================");
  } finally {
    // Cleanup fixtures
    await pool.query("DELETE FROM investigation_requests WHERE hospital_id IN (?, ?)", [
      hospital1Id,
      hospital2Id,
    ]).catch(() => {});
    await pool.query("DELETE FROM appointments WHERE id IN (?, ?, ?)", [
      apt1Id || 0,
      apt2Id || 0,
      apt3Id || 0,
    ]).catch(() => {});
    await pool.query("DELETE FROM hospital_lab_tests WHERE hospital_id IN (?, ?)", [
      hospital1Id,
      hospital2Id,
    ]).catch(() => {});
    await pool.query("DELETE FROM master_lab_tests WHERE id IN (?, ?)", [master1Id, master2Id]).catch(() => {});
    await pool.query("DELETE FROM users WHERE id IN (?, ?, ?, ?, ?, ?)", [
      saId,
      doc1Id,
      doc2Id,
      staff1Id,
      patient1Id,
      patient2Id,
    ]).catch(() => {});
    await pool.query("DELETE FROM departments WHERE id IN (?, ?)", [dept1Id, dept2Id]).catch(() => {});
    await pool.query("DELETE FROM hospitals WHERE id IN (?, ?)", [hospital1Id, hospital2Id]).catch(() => {});

    await pool.end();
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
