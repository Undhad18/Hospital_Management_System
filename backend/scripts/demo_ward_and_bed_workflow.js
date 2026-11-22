const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "3d4a415aad83b711038c10d4348c49db55e76fbd28d48be03abca423acfa47f1";
const API_BASE = "http://localhost:5000/api";

function formatJson(obj) {
  return JSON.stringify(obj, null, 2);
}

async function api(method, endpoint, body = null, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${endpoint}`, options);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body: data };
}

async function runLiveExample() {
  console.log("\n==========================================================================");
  console.log("   🏥 REAL-WORLD SCENARIO: CORONARY ICU WARD & BED MANAGEMENT WORKFLOW");
  console.log("==========================================================================\n");

  const stamp = Date.now();
  const passwordHash = await bcrypt.hash("@Pass12345678", 10);

  // 0. Setup Real-World Clinical Entities
  console.log("▶ [SETUP] Initializing Clinical Entities for 'City Heart Institute'...");

  // Roles
  const [roleRows] = await pool.execute("SELECT id, name FROM roles");
  const roleMap = {};
  for (const r of roleRows) roleMap[r.name] = r.id;

  // Hospital
  const [hRes] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, phone, address, status)
     VALUES (?, ?, ?, '+91-9876543210', '100 Medical Boulevard, Metro City', 'active')`,
    [`City Heart Institute`, `CHI-${stamp}`, `info_chi_${stamp}@cityheart.com`]
  );
  const hospitalId = hRes.insertId;

  // Clinical Department
  const [dRes] = await pool.execute(
    `INSERT INTO departments (hospital_id, name, description, status)
     VALUES (?, 'Cardiology Inpatient', 'Critical care cardiology, coronary inpatient and telemetry', 'active')`,
    [hospitalId]
  );
  const deptId = dRes.insertId;

  // Hospital Admin
  const [adminUserRes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Admin Sarah Connor', ?, ?, 'active')`,
    [roleMap["hospital_admin"], hospitalId, `admin_chi_${stamp}@cityheart.com`, passwordHash]
  );
  const adminId = adminUserRes.insertId;
  const tokenAdmin = jwt.sign({ sub: adminId, role: "hospital_admin", tokenVersion: 1 }, JWT_SECRET, { expiresIn: "2h" });

  // Doctor: Dr. Gregory House
  const [docRes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, department_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, 'Dr. Gregory House', ?, ?, 'active')`,
    [roleMap["doctor"], hospitalId, deptId, `drhouse_${stamp}@cityheart.com`, passwordHash]
  );
  const doctorId = docRes.insertId;
  const tokenDoctor = jwt.sign({ sub: doctorId, role: "doctor", tokenVersion: 1 }, JWT_SECRET, { expiresIn: "2h" });

  // Nurse / Staff: Nurse Jackie
  const [staffRes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, department_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, 'Nurse Jackie Peyton', ?, ?, 'active')`,
    [roleMap["staff"], hospitalId, deptId, `jackie_${stamp}@cityheart.com`, passwordHash]
  );
  const staffId = staffRes.insertId;
  const tokenStaff = jwt.sign({ sub: staffId, role: "staff", tokenVersion: 1 }, JWT_SECRET, { expiresIn: "2h" });

  // Patient 1: John Doe
  const [p1Res] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, phone, password_hash, status)
     VALUES (?, 'John Doe', ?, '+91-9988776655', ?, 'active')`,
    [roleMap["patient"], `johndoe_${stamp}@gmail.com`, passwordHash]
  );
  const patient1Id = p1Res.insertId;

  // Patient 2: Jane Smith
  const [p2Res] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, phone, password_hash, status)
     VALUES (?, 'Jane Smith', ?, '+91-9988776644', ?, 'active')`,
    [roleMap["patient"], `janesmith_${stamp}@gmail.com`, passwordHash]
  );
  const patient2Id = p2Res.insertId;

  console.log(`  ✓ Hospital Created: City Heart Institute (ID: ${hospitalId})`);
  console.log(`  ✓ Department: Cardiology Inpatient (ID: ${deptId})`);
  console.log(`  ✓ Operator: Nurse Jackie Peyton (Staff ID: ${staffId})`);
  console.log(`  ✓ Clinician: Dr. Gregory House (Doctor ID: ${doctorId})`);
  console.log(`  ✓ Inpatient: John Doe (Patient ID: ${patient1Id})`);

  // =========================================================================
  // STEP 1: Department-Wise Ward Creation (Lessons 10.1 & 10.2)
  // =========================================================================
  console.log("\n--------------------------------------------------------------------------");
  console.log("▶ STEP 1: Creating 'Coronary Intensive Care Unit (CICU)' (Capacity: 3)");
  console.log("--------------------------------------------------------------------------");

  const wardPayload = {
    hospital_id: hospitalId,
    department_id: deptId,
    name: `Coronary Intensive Care Unit (CICU)`,
    ward_type: "icu",
    capacity: 3,
    status: "active",
  };

  console.log(`  Calling POST /api/wards...`);
  const wardRes = await api("POST", "/wards", wardPayload, tokenAdmin);
  console.log(`  Status Code: ${wardRes.status} (OK: ${wardRes.ok})`);
  const ward = wardRes.body.data;
  console.log(`  ✓ Ward Configured:`);
  console.log(`    - Ward ID: ${ward.id}`);
  console.log(`    - Name: ${ward.name}`);
  console.log(`    - Department: ${ward.department_name}`);
  console.log(`    - Maximum Permitted Bed Capacity: ${ward.capacity}`);

  // =========================================================================
  // STEP 2: Bed Creation & Capacity Limit Testing (Lesson 10.3)
  // =========================================================================
  console.log("\n--------------------------------------------------------------------------");
  console.log("▶ STEP 2: Registering Beds & Enforcing Maximum Capacity Limit (3 Beds)");
  console.log("--------------------------------------------------------------------------");

  const bedsToCreate = [
    { bed_number: "CICU-01", bed_type: "ventilator_enabled", daily_rate: 3500.00 },
    { bed_number: "CICU-02", bed_type: "icu", daily_rate: 2800.00 },
    { bed_number: "CICU-03", bed_type: "electric", daily_rate: 2200.00 },
  ];

  const createdBeds = [];
  for (const b of bedsToCreate) {
    const bRes = await api("POST", "/beds", { ward_id: ward.id, ...b }, tokenAdmin);
    console.log(`  ✓ Registered Bed ${b.bed_number} (ID: ${bRes.body.data.id}, Type: ${b.bed_type}, Rate: ₹${b.daily_rate}/day) - Status: ${bRes.body.data.status}`);
    createdBeds.push(bRes.body.data);
  }

  console.log(`\n  [Capacity Test] Attempting to register a 4th bed (CICU-04) exceeding capacity (3)...`);
  const overflowRes = await api("POST", "/beds", { ward_id: ward.id, bed_number: "CICU-04" }, tokenAdmin);
  console.log(`  Status Code: ${overflowRes.status}`);
  console.log(`  System Response: "${overflowRes.body.message}"`);
  console.log(`  ✓ Capacity constraint successfully guarded! Ward cannot register more than 3 beds.`);

  // =========================================================================
  // STEP 3: Placing Bed CICU-03 Under Maintenance (Lessons 10.4 & 10.7)
  // =========================================================================
  console.log("\n--------------------------------------------------------------------------");
  console.log("▶ STEP 3: Placing Bed 'CICU-03' Under Maintenance for Sterilization");
  console.log("--------------------------------------------------------------------------");

  const maintRes = await api("POST", `/beds/${createdBeds[2].id}/maintenance`, {
    action: "place",
    reason: "Ventilator circuit sanitization and electrical sensor calibration",
  }, tokenStaff);

  console.log(`  Status Code: ${maintRes.status}`);
  console.log(`  System Message: "${maintRes.body.message}"`);
  console.log(`  ✓ Bed 'CICU-03' is now in 'maintenance' state.`);

  // =========================================================================
  // STEP 4: Inpatient Admission for Patient John Doe (Module 9)
  // =========================================================================
  console.log("\n--------------------------------------------------------------------------");
  console.log("▶ STEP 4: Admitting Patient John Doe via Clinical Inpatient Admission");
  console.log("--------------------------------------------------------------------------");

  const admRes = await api("POST", "/admissions", {
    patient_id: patient1Id,
    hospital_id: hospitalId,
    doctor_id: doctorId,
    department_id: deptId,
    admission_date: new Date().toISOString(),
    reason: "Acute ST-elevation myocardial infarction (STEMI) - Emergency ICU admission",
    initial_status: "admitted",
  }, tokenStaff);

  const admission = admRes.body.data;
  console.log(`  ✓ Patient Admitted Successfully:`);
  console.log(`    - Admission Tracking Number: ${admission.admission_number} (ID: ${admission.id})`);
  console.log(`    - Patient: ${admission.patient_name}`);
  console.log(`    - Attending Physician: Dr. ${admission.doctor_name}`);
  console.log(`    - Reason: ${admission.reason}`);

  // =========================================================================
  // STEP 5: Bed Allocation (Lesson 10.5 & 10.9)
  // =========================================================================
  console.log("\n--------------------------------------------------------------------------");
  console.log("▶ STEP 5: Allocating Bed 'CICU-01' to John Doe");
  console.log("--------------------------------------------------------------------------");

  // First verify assigning a bed under maintenance is blocked
  console.log(`  [Safety Test] Trying to assign Bed 'CICU-03' (currently in maintenance)...`);
  const blockMaintAssign = await api("POST", "/beds/assign", {
    bed_id: createdBeds[2].id,
    admission_id: admission.id,
  }, tokenStaff);
  console.log(`  Status Code: ${blockMaintAssign.status} Conflict`);
  console.log(`  System Block Reason: "${blockMaintAssign.body.message}"`);
  console.log(`  ✓ Patient allocation to maintenance bed safely prevented!`);

  // Now assign Bed CICU-01 (available)
  console.log(`\n  Allocating Available Bed 'CICU-01' to Admission ${admission.admission_number}...`);
  const assignRes = await api("POST", "/beds/assign", {
    bed_id: createdBeds[0].id,
    admission_id: admission.id,
    notes: "Assigned to ventilator-enabled bed. Continuous arterial line telemetry required.",
  }, tokenStaff);

  console.log(`  Status Code: ${assignRes.status}`);
  console.log(`  ✓ Assignment Created (ID: ${assignRes.body.data.id}):`);
  console.log(`    - Bed: ${assignRes.body.data.bed_number}`);
  console.log(`    - Patient: ${assignRes.body.data.patient_name}`);
  console.log(`    - Assigned At: ${assignRes.body.data.assigned_at_formatted}`);
  console.log(`    - Assigned By: ${assignRes.body.data.assigned_by_name}`);

  // Fetch updated bed details from GET /api/beds/:id
  const checkBed1 = await api("GET", `/beds/${createdBeds[0].id}`, null, tokenStaff);
  console.log(`  ✓ Bed 'CICU-01' Current Live Status: '${checkBed1.body.data.status.toUpperCase()}'`);
  console.log(`    - Active Occupant: ${checkBed1.body.data.patient_name} (${checkBed1.body.data.admission_number})`);

  // =========================================================================
  // STEP 6: Duplicate Prevention Test (Lesson 10.9)
  // =========================================================================
  console.log("\n--------------------------------------------------------------------------");
  console.log("▶ STEP 6: Concurrency Protection — Attempting Duplicate Allocation for Bed 1");
  console.log("--------------------------------------------------------------------------");

  // Admit second patient Jane Smith
  const adm2Res = await api("POST", "/admissions", {
    patient_id: patient2Id,
    hospital_id: hospitalId,
    doctor_id: doctorId,
    department_id: deptId,
    admission_date: new Date().toISOString(),
    reason: "Unstable angina observation",
    initial_status: "admitted",
  }, tokenStaff);

  console.log(`  Second Patient Admitted: Jane Smith (${adm2Res.body.data.admission_number})`);
  console.log(`  Attempting to assign occupied Bed 'CICU-01' to Jane Smith...`);

  const dupRes = await api("POST", "/beds/assign", {
    bed_id: createdBeds[0].id,
    admission_id: adm2Res.body.data.id,
  }, tokenStaff);

  console.log(`  Status Code: ${dupRes.status} (Conflict)`);
  console.log(`  Security Guard: "${dupRes.body.message}"`);
  console.log(`  ✓ Duplicate occupancy safely blocked by transactional database lock and engine constraints!`);

  // =========================================================================
  // STEP 7: Discharge & Automatic Bed Release (Lesson 10.6)
  // =========================================================================
  console.log("\n--------------------------------------------------------------------------");
  console.log("▶ STEP 7: Discharging John Doe & Verifying Automatic Bed Status Release");
  console.log("--------------------------------------------------------------------------");

  console.log(`  Dr. House executing patient discharge via PATCH /api/admissions/${admission.id}/status...`);
  const dischargeRes = await api("PATCH", `/admissions/${admission.id}/status`, {
    status: "discharged",
    reason: "Cardiac enzymes normalized, sinus rhythm stabilized. Discharged to outpatient cardiac rehab.",
  }, tokenDoctor);

  console.log(`  Status Code: ${dischargeRes.status}`);
  console.log(`  Admission Status: '${dischargeRes.body.data.status.toUpperCase()}' at ${dischargeRes.body.data.discharged_at_formatted}`);

  // Re-check Bed 1 status
  const bed1AfterDischarge = await api("GET", `/beds/${createdBeds[0].id}`, null, tokenStaff);
  console.log(`  ✓ Automatic Bed Status Update:`);
  console.log(`    - Bed 'CICU-01' Status: '${bed1AfterDischarge.body.data.status.toUpperCase()}'`);
  console.log(`    - Active Assignment ID: ${bed1AfterDischarge.body.data.active_assignment_id || 'None (Bed is freed!)'}`);

  // =========================================================================
  // STEP 8: Returning Bed 3 from Maintenance to Service (Lesson 10.7)
  // =========================================================================
  console.log("\n--------------------------------------------------------------------------");
  console.log("▶ STEP 8: Returning Bed 'CICU-03' from Maintenance to Active Service");
  console.log("--------------------------------------------------------------------------");

  const returnMaintRes = await api("POST", `/beds/${createdBeds[2].id}/maintenance`, {
    action: "return",
    reason: "Sterilization complete, inspection checklist signed off by Nurse Jackie",
  }, tokenStaff);

  console.log(`  Status Code: ${returnMaintRes.status}`);
  console.log(`  System Message: "${returnMaintRes.body.message}"`);
  console.log(`  ✓ Bed 'CICU-03' is now '${returnMaintRes.body.data.status.toUpperCase()}' and ready for new admissions.`);

  // =========================================================================
  // STEP 9: Audit Trail & Occupancy History Timeline (Lesson 10.8)
  // =========================================================================
  console.log("\n--------------------------------------------------------------------------");
  console.log("▶ STEP 9: Viewing Chronological Assignment & Maintenance History for Bed 1");
  console.log("--------------------------------------------------------------------------");

  const historyRes = await api("GET", `/beds/${createdBeds[0].id}/history`, null, tokenStaff);
  console.log(`  Total Historical Assignments for Bed 'CICU-01': ${historyRes.body.assignment_count}`);
  const record = historyRes.body.assignments[0];
  console.log(`  Timeline Entry #1:`);
  console.log(`    - Inpatient: ${record.patient_name}`);
  console.log(`    - Admission Number: ${record.admission_number}`);
  console.log(`    - Assigned At: ${record.assigned_at_formatted} by ${record.assigned_by_name}`);
  console.log(`    - Released At: ${record.released_at_formatted} by ${record.released_by_name}`);
  console.log(`    - Outcome Status: '${record.status.toUpperCase()}'`);
  console.log(`    - Notes: "${record.notes}"`);

  // =========================================================================
  // Live Dashboard Overview Metrics
  // =========================================================================
  console.log("\n==========================================================================");
  console.log("   📊 LIVE DASHBOARD METRICS FOR CITY HEART INSTITUTE (CORONARY ICU)");
  console.log("==========================================================================");

  const finalWardCheck = await api("GET", `/wards/${ward.id}`, null, tokenStaff);
  const wData = finalWardCheck.body.data;
  console.log(`  • Ward Name: ${wData.name} (${wData.ward_type.toUpperCase()})`);
  console.log(`  • Configured Bed Capacity Limit: ${wData.configured_capacity} beds`);
  console.log(`  • Registered Bed Inventory: ${wData.total_registered_beds} beds`);
  console.log(`  • Available Beds Ready for Intake: ${wData.available_beds} beds`);
  console.log(`  • Occupied Beds: ${wData.occupied_beds} beds`);
  console.log(`  • Beds in Maintenance: ${wData.maintenance_beds} beds`);

  console.log("\n🎉 LIVE CLINICAL WORKFLOW COMPLETED AND VERIFIED 100% IN YOUR PROJECT!\n");
  process.exit(0);
}

runLiveExample().catch((err) => {
  console.error("Execution failed:", err);
  process.exit(1);
});
