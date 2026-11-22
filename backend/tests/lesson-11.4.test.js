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
  console.log("==================================================================");
  console.log("=== Running Lesson 11.4 Test Selection During Consultation Suite ===");
  console.log("==================================================================");

  const stamp = Date.now();

  const [roleRows] = await pool.execute("SELECT id, name FROM roles");
  const roleMap = {};
  for (const r of roleRows) roleMap[r.name] = r.id;

  const passwordHash = await bcrypt.hash("@Pass12345678", 10);

  // 1. Fixtures: Hospital
  const [hospRes] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, status)
     VALUES (?, ?, ?, 'active')`,
    [`Memorial Clinical Center ${stamp}`, `MCC-${stamp}`, `mcc_${stamp}@m11.com`]
  );
  const hospitalId = hospRes.insertId;

  // Department
  const [deptRes] = await pool.execute(
    `INSERT INTO departments (hospital_id, name, status)
     VALUES (?, 'General Medicine', 'active')`,
    [hospitalId]
  );
  const deptId = deptRes.insertId;

  // 2. Users: Hospital Admin, Doctor, Patient
  const [haRes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [roleMap["hospital_admin"], hospitalId, `HA Admin ${stamp}`, `ha_${stamp}@m11.com`, passwordHash]
  );
  const haId = haRes.insertId;

  const [docRes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, department_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, ?, ?, 'active')`,
    [roleMap["doctor"], hospitalId, deptId, `Dr. Clinician ${stamp}`, `doc_${stamp}@m11.com`, passwordHash]
  );
  const doctorId = docRes.insertId;

  const [patRes] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [roleMap["patient"], `Patient Consult ${stamp}`, `pat_${stamp}@m11.com`, passwordHash]
  );
  const patientId = patRes.insertId;

  // Patient profile
  await pool.execute(
    `INSERT INTO patient_profiles (user_id, gender, blood_group, dob)
     VALUES (?, 'male', 'O+', '1990-05-15')`,
    [patientId]
  );

  function makeToken(id, role, hospId = null) {
    return jwt.sign(
      { sub: id, role, hospitalId: hospId, tokenVersion: 1 },
      JWT_SECRET,
      { expiresIn: "2h" }
    );
  }

  const haToken = makeToken(haId, "hospital_admin", hospitalId);
  const docToken = makeToken(doctorId, "doctor", hospitalId);
  const patToken = makeToken(patientId, "patient");

  // 3. Create Master Tests & Assign to Hospital with Hospital Pricing
  const [m1] = await pool.execute(
    `INSERT INTO master_lab_tests (test_code, test_name, category, sample_type, standard_turnaround_hours, status)
     VALUES (?, 'Complete Blood Count (CBC)', 'Hematology', 'Whole Blood', 6, 'active')`,
    [`CBC-${stamp}`]
  );
  const master1Id = m1.insertId;

  const [m2] = await pool.execute(
    `INSERT INTO master_lab_tests (test_code, test_name, category, sample_type, standard_turnaround_hours, status)
     VALUES (?, 'Fasting Blood Sugar (FBS)', 'Biochemistry', 'Serum', 4, 'active')`,
    [`FBS-${stamp}`]
  );
  const master2Id = m2.insertId;

  const [m3] = await pool.execute(
    `INSERT INTO master_lab_tests (test_code, test_name, category, sample_type, standard_turnaround_hours, status)
     VALUES (?, 'Lipid Profile Panel', 'Biochemistry', 'Serum', 12, 'active')`,
    [`LIP-${stamp}`]
  );
  const master3Id = m3.insertId;

  // Assign CBC (@ ₹280.00) and FBS (@ ₹150.00) to Hospital
  const [hlt1] = await pool.execute(
    `INSERT INTO hospital_lab_tests (hospital_id, master_test_id, price, status)
     VALUES (?, ?, 280.00, 'active')`,
    [hospitalId, master1Id]
  );
  const hlt1Id = hlt1.insertId;

  const [hlt2] = await pool.execute(
    `INSERT INTO hospital_lab_tests (hospital_id, master_test_id, price, status)
     VALUES (?, ?, 150.00, 'active')`,
    [hospitalId, master2Id]
  );

  // Assign Lipid Profile (@ ₹420.00)
  const [hlt3] = await pool.execute(
    `INSERT INTO hospital_lab_tests (hospital_id, master_test_id, price, status)
     VALUES (?, ?, 420.00, 'active')`,
    [hospitalId, master3Id]
  );

  // 4. Create Confirmed Appointment
  const [aptRes] = await pool.execute(
    `INSERT INTO appointments
      (appointment_number, patient_id, hospital_id, department_id, doctor_id,
       appointment_date, appointment_time, start_time, end_time, status, queue_number, check_in_time, reason)
     VALUES (?, ?, ?, ?, ?, CURDATE(), '10:00 AM', '10:00:00', '10:30:00', 'in_waiting', 'Q-114', CURRENT_TIMESTAMP, 'Clinical Consultation Visit')`,
    [`APT-L114-${stamp}`, patientId, hospitalId, deptId, doctorId]
  );
  const appointmentId = aptRes.insertId;

  let consultationId = null;

  try {
    // ------------------------------------------------------------------------
    // Test 1: GET /api/consultations/masters/lab-tests returns hospital tests with rates
    // ------------------------------------------------------------------------
    console.log("Test 1: Doctor fetches hospital laboratory test offerings...");
    const catalogRes = await get(`/consultations/masters/lab-tests?hospital_id=${hospitalId}`, docToken);
    assert.strictEqual(catalogRes.status, 200, "Catalog fetch failed");
    assert.ok(Array.isArray(catalogRes.body.data), "Expected array of lab test offerings");

    const cbcOffering = catalogRes.body.data.find((t) => t.master_test_id === master1Id);
    assert.ok(cbcOffering, "CBC offering must be present");
    assert.strictEqual(parseFloat(cbcOffering.price), 280.0, "Hospital rate for CBC should be ₹280.00");
    console.log("-> PASSED: Doctor catalog displays active hospital offerings and accurate prices.");

    // ------------------------------------------------------------------------
    // Test 2: Doctor starts consultation
    // ------------------------------------------------------------------------
    console.log("Test 2: Starting consultation workflow...");
    const startRes = await post("/consultations/start", { appointment_id: appointmentId }, docToken);
    assert.strictEqual(startRes.status, 200, "Start consultation failed");
    consultationId = startRes.body.data.id;
    assert.ok(consultationId, "Consultation ID must exist");
    console.log(`-> PASSED: Consultation #${consultationId} started.`);

    // ------------------------------------------------------------------------
    // Test 3: Doctor orders laboratory tests during consultation draft (CBC & FBS)
    // ------------------------------------------------------------------------
    console.log("Test 3: Doctor orders CBC (@ ₹280.00) and FBS (@ ₹150.00) in consultation draft...");
    const draftPayload = {
      chief_complaint: "Patient reports recurrent fatigue and elevated fasting glucose levels.",
      symptoms: "Lethargy, polydipsia",
      examination_findings: "Vitals normal, mild pallor.",
      diagnosis: "Suspected Diabetes Mellitus with mild anemia",
      patient_condition: "stable",
      treatment_plan: "Laboratory evaluation, diet modification, review with reports.",
      investigations: [
        {
          master_test_id: master1Id,
          test_name: "Complete Blood Count (CBC)",
          test_category: "Hematology",
          priority: "urgent",
          clinical_notes: "Evaluate for microcytic anemia",
        },
        {
          master_test_id: master2Id,
          test_name: "Fasting Blood Sugar (FBS)",
          test_category: "Biochemistry",
          priority: "routine",
          clinical_notes: "Check baseline glycaemic control",
        },
      ],
    };

    const draftRes = await put(`/consultations/${consultationId}`, draftPayload, docToken);
    assert.strictEqual(draftRes.status, 200, "Save draft failed");

    // Verify investigation_requests in database
    const [invRows] = await pool.query(
      `SELECT id, order_number, consultation_id, appointment_id, patient_id, doctor_id, hospital_id,
              master_test_id, test_name, test_category, priority, clinical_notes, price, payment_status, status
       FROM investigation_requests
       WHERE consultation_id = ?
       ORDER BY id ASC`,
      [consultationId]
    );

    assert.strictEqual(invRows.length, 2, "Expected 2 investigation requests in database");

    const cbcRow = invRows.find((r) => r.master_test_id === master1Id);
    assert.ok(cbcRow, "CBC row must exist");
    assert.strictEqual(parseFloat(cbcRow.price), 280.0, "CBC snapshot price must match hospital rate (₹280.00)");
    assert.strictEqual(cbcRow.priority, "urgent");
    assert.strictEqual(cbcRow.payment_status, "unpaid");
    assert.strictEqual(cbcRow.status, "requested");
    assert.ok(cbcRow.order_number && cbcRow.order_number.startsWith("LAB-"), "Order number must start with LAB-");

    const fbsRow = invRows.find((r) => r.master_test_id === master2Id);
    assert.ok(fbsRow, "FBS row must exist");
    assert.strictEqual(parseFloat(fbsRow.price), 150.0, "FBS snapshot price must match hospital rate (₹150.00)");
    assert.strictEqual(fbsRow.priority, "routine");
    assert.ok(fbsRow.order_number && fbsRow.order_number.startsWith("LAB-"));
    console.log("-> PASSED: Investigation orders created with order numbers and hospital price snapshots.");

    // ------------------------------------------------------------------------
    // Test 4: Fetch consultation appointment details includes enriched investigations
    // ------------------------------------------------------------------------
    console.log("Test 4: Doctor views consultation details with enriched investigations...");
    const apptView = await get(`/consultations/appointment/${appointmentId}`, docToken);
    assert.strictEqual(apptView.status, 200);
    assert.strictEqual(apptView.body.data.investigations.length, 2);
    const viewCbc = apptView.body.data.investigations.find((i) => i.master_test_id === master1Id);
    assert.strictEqual(parseFloat(viewCbc.price), 280.0);
    assert.strictEqual(viewCbc.test_code, `CBC-${stamp}`);
    assert.strictEqual(viewCbc.sample_type, "Whole Blood");
    console.log("-> PASSED: Consultation view returns enriched investigations with prices and test codes.");

    // ------------------------------------------------------------------------
    // Test 5: Updating consultation orders (remove FBS, add Lipid Profile, update CBC notes)
    // ------------------------------------------------------------------------
    console.log("Test 5: Updating consultation orders: modify CBC, remove FBS, add Lipid Profile...");
    const updatedDraft = {
      ...draftPayload,
      investigations: [
        {
          master_test_id: master1Id,
          test_name: "Complete Blood Count (CBC)",
          test_category: "Hematology",
          priority: "routine",
          clinical_notes: "Updated: routine surveillance",
        },
        {
          master_test_id: master3Id,
          test_name: "Lipid Profile Panel",
          test_category: "Biochemistry",
          priority: "routine",
          clinical_notes: "Cardiovascular risk screening",
        },
      ],
    };

    const updateRes = await put(`/consultations/${consultationId}`, updatedDraft, docToken);
    assert.strictEqual(updateRes.status, 200);

    const [updatedInvRows] = await pool.query(
      `SELECT id, order_number, master_test_id, test_name, price, priority, clinical_notes
       FROM investigation_requests
       WHERE consultation_id = ?
       ORDER BY id ASC`,
      [consultationId]
    );

    assert.strictEqual(updatedInvRows.length, 2, "Should have 2 investigations after removal & addition");
    const updatedCbc = updatedInvRows.find((r) => r.master_test_id === master1Id);
    assert.strictEqual(updatedCbc.order_number, cbcRow.order_number, "CBC order number must be preserved");
    assert.strictEqual(updatedCbc.clinical_notes, "Updated: routine surveillance");

    const newLipid = updatedInvRows.find((r) => r.master_test_id === master3Id);
    assert.ok(newLipid, "Lipid profile must now be in orders");
    assert.strictEqual(parseFloat(newLipid.price), 420.0, "Lipid profile snapshot price must be ₹420.00");

    const deletedFbs = updatedInvRows.find((r) => r.master_test_id === master2Id);
    assert.strictEqual(deletedFbs, undefined, "FBS must have been removed from database");
    console.log("-> PASSED: Order synchronization correctly updated, removed, and added investigation orders.");

    // ------------------------------------------------------------------------
    // Test 6: Final Submission of Consultation preserves investigation orders
    // ------------------------------------------------------------------------
    console.log("Test 6: Final submission of consultation...");
    const submitRes = await post(
      `/consultations/${consultationId}/submit`,
      {
        chief_complaint: updatedDraft.chief_complaint,
        symptoms: updatedDraft.symptoms,
        examination_findings: updatedDraft.examination_findings,
        diagnosis: updatedDraft.diagnosis,
        treatment_plan: updatedDraft.treatment_plan,
      },
      docToken
    );
    assert.strictEqual(submitRes.status, 200, "Consultation submission failed");

    const [finalInv] = await pool.query(
      `SELECT id, status, payment_status, price FROM investigation_requests WHERE consultation_id = ?`,
      [consultationId]
    );
    assert.strictEqual(finalInv.length, 2);
    assert.strictEqual(finalInv[0].status, "requested");
    assert.strictEqual(finalInv[0].payment_status, "unpaid");
    console.log("-> PASSED: Consultation successfully submitted with investigation orders preserved.");

    // ------------------------------------------------------------------------
    // Test 7: Historical price immutability after subsequent hospital rate changes
    // ------------------------------------------------------------------------
    console.log("Test 7: Hospital rate adjustment does NOT alter previously ordered consultation tests...");
    await patch(`/labs/hospital-tests/${hlt1Id}/price`, { price: 500.00 }, haToken);

    const [cbcCheck] = await pool.query(
      `SELECT price FROM investigation_requests WHERE consultation_id = ? AND master_test_id = ?`,
      [consultationId, master1Id]
    );
    assert.strictEqual(
      parseFloat(cbcCheck[0].price),
      280.0,
      "CRITICAL: Consultation ordered price must remain ₹280.00 despite hospital rate increase to ₹500.00!"
    );
    console.log("-> PASSED: Consultation investigation price snapshot remains completely immutable.");

    console.log("\n==================================================================");
    console.log("=== ALL LESSON 11.4 TESTS PASSED PERFECTLY ===");
    console.log("==================================================================");
  } finally {
    // Cleanup fixtures
    await pool.query("DELETE FROM investigation_requests WHERE hospital_id = ?", [hospitalId]).catch(() => {});
    await pool.query("DELETE FROM consultation_vitals WHERE consultation_id = ?", [consultationId || 0]).catch(() => {});
    await pool.query("DELETE FROM prescription_items WHERE prescription_id IN (SELECT id FROM prescriptions WHERE consultation_id = ?)", [consultationId || 0]).catch(() => {});
    await pool.query("DELETE FROM prescriptions WHERE consultation_id = ?", [consultationId || 0]).catch(() => {});
    await pool.query("DELETE FROM consultations WHERE id = ?", [consultationId || 0]).catch(() => {});
    await pool.query("DELETE FROM appointments WHERE id = ?", [appointmentId || 0]).catch(() => {});
    await pool.query("DELETE FROM hospital_lab_tests WHERE hospital_id = ?", [hospitalId]).catch(() => {});
    await pool.query("DELETE FROM master_lab_tests WHERE id IN (?, ?, ?)", [master1Id, master2Id, master3Id]).catch(() => {});
    await pool.query("DELETE FROM patient_profiles WHERE user_id = ?", [patientId]).catch(() => {});
    await pool.query("DELETE FROM users WHERE id IN (?, ?, ?)", [haId, doctorId, patientId]).catch(() => {});
    await pool.query("DELETE FROM departments WHERE id = ?", [deptId]).catch(() => {});
    await pool.query("DELETE FROM hospitals WHERE id = ?", [hospitalId]).catch(() => {});

    await pool.end();
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
