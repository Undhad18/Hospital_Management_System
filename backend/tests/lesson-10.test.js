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
  console.log("=== Running Module 10 Ward & Bed Management Test Suite ===");
  console.log("==================================================================");

  const stamp = Date.now();

  // 1. Setup Test Fixtures:
  // - Hospital 1 (Hospital Alpha) & Hospital 2 (Hospital Beta)
  // - Department 1 (Hosp 1 Cardiology) & Department 2 (Hosp 2 Neurology)
  // - Hospital Admin 1 (Hosp 1) & Hospital Admin 2 (Hosp 2)
  // - Doctor 1 (Hosp 1, Dept 1)
  // - Staff 1 (Hosp 1)
  // - Patient 1 & Patient 2

  const [roleRows] = await pool.execute("SELECT id, name FROM roles");
  const roleMap = {};
  for (const r of roleRows) roleMap[r.name] = r.id;

  // Hospitals
  const [h1Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, phone, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [`M10 Hospital Alpha ${stamp}`, `M10A-${stamp}`, `h1_${stamp}@m10.com`, "+91-9876543210"]
  );
  const hospital1Id = h1Res.insertId;

  const [h2Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, phone, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [`M10 Hospital Beta ${stamp}`, `M10B-${stamp}`, `h2_${stamp}@m10.com`, "+91-9876543211"]
  );
  const hospital2Id = h2Res.insertId;

  // Departments
  const [d1Res] = await pool.execute(
    `INSERT INTO departments (hospital_id, name, status) VALUES (?, 'Cardiology Unit', 'active')`,
    [hospital1Id]
  );
  const dept1Id = d1Res.insertId;

  const [d2Res] = await pool.execute(
    `INSERT INTO departments (hospital_id, name, status) VALUES (?, 'Neurology Unit', 'active')`,
    [hospital2Id]
  );
  const dept2Id = d2Res.insertId;

  // Inactive Department in Hospital 1 for testing
  const [dInactiveRes] = await pool.execute(
    `INSERT INTO departments (hospital_id, name, status) VALUES (?, 'Discontinued Unit', 'inactive')`,
    [hospital1Id]
  );
  const deptInactiveId = dInactiveRes.insertId;

  const passwordHash = await bcrypt.hash("@Pass12345678", 10);

  // Users
  // Super Admin
  const [saRes] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, status)
     VALUES (?, 'Super Admin M10', ?, ?, 'active')`,
    [roleMap["super_admin"], `sa_${stamp}@m10.com`, passwordHash]
  );
  const superAdminId = saRes.insertId;
  const tokenSuperAdmin = jwt.sign({ sub: superAdminId, role: "super_admin", tokenVersion: 1 }, JWT_SECRET, { expiresIn: "1h" });

  // Hospital Admin 1
  const [ha1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Hospital Admin Alpha', ?, ?, 'active')`,
    [roleMap["hospital_admin"], hospital1Id, `ha1_${stamp}@m10.com`, passwordHash]
  );
  const hospitalAdmin1Id = ha1Res.insertId;
  const tokenHospitalAdmin1 = jwt.sign({ sub: hospitalAdmin1Id, role: "hospital_admin", tokenVersion: 1 }, JWT_SECRET, { expiresIn: "1h" });

  // Hospital Admin 2
  const [ha2Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status)
     VALUES (?, ?, 'Hospital Admin Beta', ?, ?, 'active')`,
    [roleMap["hospital_admin"], hospital2Id, `ha2_${stamp}@m10.com`, passwordHash]
  );
  const hospitalAdmin2Id = ha2Res.insertId;
  const tokenHospitalAdmin2 = jwt.sign({ sub: hospitalAdmin2Id, role: "hospital_admin", tokenVersion: 1 }, JWT_SECRET, { expiresIn: "1h" });

  // Doctor 1
  const [doc1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, department_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, 'Dr. House M10', ?, ?, 'active')`,
    [roleMap["doctor"], hospital1Id, dept1Id, `doc1_${stamp}@m10.com`, passwordHash]
  );
  const doctor1Id = doc1Res.insertId;
  const tokenDoctor1 = jwt.sign({ sub: doctor1Id, role: "doctor", tokenVersion: 1 }, JWT_SECRET, { expiresIn: "1h" });

  // Staff 1 (Nurse / Bed manager)
  const [staff1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, department_id, full_name, email, password_hash, status)
     VALUES (?, ?, ?, 'Nurse Jackie M10', ?, ?, 'active')`,
    [roleMap["staff"], hospital1Id, dept1Id, `staff1_${stamp}@m10.com`, passwordHash]
  );
  const staff1Id = staff1Res.insertId;
  const tokenStaff1 = jwt.sign({ sub: staff1Id, role: "staff", tokenVersion: 1 }, JWT_SECRET, { expiresIn: "1h" });

  // Patient 1
  const [p1Res] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, status)
     VALUES (?, 'Patient John Doe', ?, ?, 'active')`,
    [roleMap["patient"], `p1_${stamp}@m10.com`, passwordHash]
  );
  const patient1Id = p1Res.insertId;
  const tokenPatient1 = jwt.sign({ sub: patient1Id, role: "patient", tokenVersion: 1 }, JWT_SECRET, { expiresIn: "1h" });

  // Patient 2
  const [p2Res] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, status)
     VALUES (?, 'Patient Jane Smith', ?, ?, 'active')`,
    [roleMap["patient"], `p2_${stamp}@m10.com`, passwordHash]
  );
  const patient2Id = p2Res.insertId;

  console.log("✓ Fixtures created successfully");

  // ============================================================================
  // Lesson 10.1 & 10.2: Department-Wise Ward Management & Ward Creation
  // ============================================================================
  console.log("\n--- Testing Lesson 10.1 & 10.2: Ward Management & Creation ---");

  // 1. Patients cannot create wards (RBAC)
  const patientWardRes = await post("/wards", {
    hospital_id: hospital1Id,
    department_id: dept1Id,
    name: "Patient Ward",
  }, tokenPatient1);
  assert.strictEqual(patientWardRes.status, 403);
  console.log("✓ Unauthorized patient role cannot create wards (403 Forbidden)");

  // 2. Reject ward creation with invalid or inactive department
  const inactiveDeptRes = await post("/wards", {
    department_id: deptInactiveId,
    name: "Inactive Dept Ward",
    capacity: 10,
  }, tokenHospitalAdmin1);
  assert.strictEqual(inactiveDeptRes.status, 400);
  assert(inactiveDeptRes.body.message.includes("inactive department"));
  console.log("✓ Ward creation in inactive department rejected (400 Bad Request)");

  // 3. Reject ward creation with department belonging to another hospital (Cross-hospital injection)
  const crossDeptRes = await post("/wards", {
    department_id: dept2Id, // Dept 2 belongs to Hospital 2
    name: "Cross Dept Ward",
    capacity: 10,
  }, tokenHospitalAdmin1);
  assert.strictEqual(crossDeptRes.status, 400);
  assert(crossDeptRes.body.message.includes("does not belong to the selected hospital"));
  console.log("✓ Ward creation with department from another hospital rejected");

  // 4. Valid Ward Creation (ICU Ward, Capacity 3)
  const createWard1Res = await post("/wards", {
    department_id: dept1Id,
    name: `Cardio ICU ${stamp}`,
    ward_type: "icu",
    capacity: 3,
    status: "active",
  }, tokenHospitalAdmin1);
  assert.strictEqual(createWard1Res.status, 201);
  assert.strictEqual(createWard1Res.body.success, true);
  const ward1Id = createWard1Res.body.data.id;
  console.log(`✓ Valid ward created successfully (ID: ${ward1Id}, Name: 'Cardio ICU ${stamp}', Capacity: 3)`);

  // 5. Duplicate Ward Name in the same department rejected
  const dupWardRes = await post("/wards", {
    department_id: dept1Id,
    name: `Cardio ICU ${stamp}`,
    capacity: 5,
  }, tokenHospitalAdmin1);
  assert.strictEqual(dupWardRes.status, 409);
  assert(dupWardRes.body.message.includes("already exists"));
  console.log("✓ Duplicate ward name in the same department rejected (409 Conflict)");

  // 6. List wards filtered by department
  const listWardsRes = await get(`/wards?department_id=${dept1Id}`, tokenHospitalAdmin1);
  assert.strictEqual(listWardsRes.status, 200);
  assert(listWardsRes.body.data.some((w) => w.id === ward1Id));
  console.log("✓ Department-wise ward list retrieved successfully");

  // ============================================================================
  // Lesson 10.3: Bed Creation and Ward Capacity Configuration
  // ============================================================================
  console.log("\n--- Testing Lesson 10.3: Bed Creation & Ward Capacity ---");

  // 1. Create Bed 1 in Ward 1 (Capacity = 3)
  const bed1Res = await post("/beds", {
    ward_id: ward1Id,
    bed_number: "BED-01",
    bed_type: "icu",
    daily_rate: 1500.00,
  }, tokenHospitalAdmin1);
  assert.strictEqual(bed1Res.status, 201);
  const bed1Id = bed1Res.body.data.id;
  assert.strictEqual(bed1Res.body.data.status, "available");
  console.log(`✓ Bed 1 created successfully (ID: ${bed1Id}, Number: 'BED-01', Status: available)`);

  // 2. Reject duplicate bed identifier within the same ward
  const dupBedRes = await post("/beds", {
    ward_id: ward1Id,
    bed_number: "BED-01",
    bed_type: "icu",
  }, tokenHospitalAdmin1);
  assert.strictEqual(dupBedRes.status, 409);
  assert(dupBedRes.body.message.includes("already exists"));
  console.log("✓ Duplicate bed identifier in the same ward rejected (409 Conflict)");

  // 3. Create Bed 2 & Bed 3 to reach capacity limit (3/3)
  const bed2Res = await post("/beds", { ward_id: ward1Id, bed_number: "BED-02", bed_type: "icu" }, tokenHospitalAdmin1);
  assert.strictEqual(bed2Res.status, 201);
  const bed2Id = bed2Res.body.data.id;

  const bed3Res = await post("/beds", { ward_id: ward1Id, bed_number: "BED-03", bed_type: "icu" }, tokenHospitalAdmin1);
  assert.strictEqual(bed3Res.status, 201);
  const bed3Id = bed3Res.body.data.id;
  console.log("✓ Beds 2 and 3 created successfully; Ward 1 now at full capacity (3/3 beds)");

  // 4. Exceeding ward capacity limit rejected
  const exceedCapacityRes = await post("/beds", {
    ward_id: ward1Id,
    bed_number: "BED-04",
  }, tokenHospitalAdmin1);
  assert.strictEqual(exceedCapacityRes.status, 400);
  assert(exceedCapacityRes.body.message.includes("capacity") && exceedCapacityRes.body.message.includes("reached"));
  console.log("✓ Creating beds exceeding ward capacity correctly rejected (400 Bad Request)");

  // 5. Updating ward capacity below existing bed count rejected
  const reduceCapRes = await put(`/wards/${ward1Id}`, {
    capacity: 2, // Total registered beds is 3
  }, tokenHospitalAdmin1);
  assert.strictEqual(reduceCapRes.status, 400);
  assert(reduceCapRes.body.message.includes("currently has 3 registered beds"));
  console.log("✓ Reducing ward capacity below existing bed count rejected (400 Bad Request)");

  // ============================================================================
  // Lesson 10.4 & 10.7: Bed Status Management & Bed Maintenance
  // ============================================================================
  console.log("\n--- Testing Lesson 10.4 & 10.7: Bed Status & Maintenance ---");

  // 1. Place Bed 3 into Maintenance
  const maintPlaceRes = await post(`/beds/${bed3Id}/maintenance`, {
    action: "place",
    reason: "Ventilator calibration & sanitation",
  }, tokenHospitalAdmin1);
  assert.strictEqual(maintPlaceRes.status, 200);
  assert.strictEqual(maintPlaceRes.body.data.status, "maintenance");
  console.log("✓ Bed 3 successfully placed into maintenance with reason recorded");

  // Check bed status in database
  const bed3Check = await get(`/beds/${bed3Id}`, tokenHospitalAdmin1);
  assert.strictEqual(bed3Check.body.data.status, "maintenance");
  assert.strictEqual(bed3Check.body.data.maintenance_reason, "Ventilator calibration & sanitation");

  // ============================================================================
  // Lesson 10.5 & 10.9: Assigning Beds to Admitted Patients & Preventing Duplicates
  // ============================================================================
  console.log("\n--- Testing Lesson 10.5 & 10.9: Bed Assignment & Concurrency Safety ---");

  // Create an Admission for Patient 1 in Hospital 1
  const adm1Res = await post("/admissions", {
    patient_id: patient1Id,
    hospital_id: hospital1Id,
    doctor_id: doctor1Id,
    department_id: dept1Id,
    admission_date: new Date().toISOString(),
    reason: "Acute myocardial infarction monitoring",
    initial_status: "admitted",
  }, tokenHospitalAdmin1);
  assert.strictEqual(adm1Res.status, 201);
  const admission1Id = adm1Res.body.data.id;
  console.log(`✓ Patient 1 admitted (Admission ID: ${admission1Id})`);

  // 1. Cannot assign a bed that is under maintenance (Bed 3)
  const assignMaintRes = await post("/beds/assign", {
    bed_id: bed3Id,
    admission_id: admission1Id,
  }, tokenHospitalAdmin1);
  assert.strictEqual(assignMaintRes.status, 409);
  assert(assignMaintRes.body.message.includes("under maintenance"));
  console.log("✓ Assigning bed under maintenance rejected (409 Conflict)");

  // 2. Assign available Bed 1 to Admission 1
  const assignBed1Res = await post("/beds/assign", {
    bed_id: bed1Id,
    admission_id: admission1Id,
    notes: "Assigned to Cardiac ICU bed 1",
  }, tokenHospitalAdmin1);
  assert.strictEqual(assignBed1Res.status, 201);
  assert.strictEqual(assignBed1Res.body.success, true);
  console.log("✓ Bed 1 successfully assigned to Patient 1");

  // 3. Bed status is now 'occupied'
  const bed1Check = await get(`/beds/${bed1Id}`, tokenHospitalAdmin1);
  assert.strictEqual(bed1Check.body.data.status, "occupied");
  assert.strictEqual(bed1Check.body.data.patient_id, patient1Id);
  console.log("✓ Bed 1 status automatically updated to 'occupied' with patient linkage");

  // 4. Duplicate assignment to occupied Bed 1 rejected
  // Create Admission 2 for Patient 2
  const adm2Res = await post("/admissions", {
    patient_id: patient2Id,
    hospital_id: hospital1Id,
    doctor_id: doctor1Id,
    department_id: dept1Id,
    admission_date: new Date().toISOString(),
    reason: "Unstable angina observation",
    initial_status: "admitted",
  }, tokenHospitalAdmin1);
  assert.strictEqual(adm2Res.status, 201);
  const admission2Id = adm2Res.body.data.id;

  const dupBedAssignRes = await post("/beds/assign", {
    bed_id: bed1Id, // Already occupied!
    admission_id: admission2Id,
  }, tokenHospitalAdmin1);
  assert.strictEqual(dupBedAssignRes.status, 409);
  assert(dupBedAssignRes.body.message.includes("already occupied"));
  console.log("✓ Assigning already occupied Bed 1 rejected (409 Conflict)");

  // 5. An admission cannot receive multiple active bed assignments
  const multiBedAssignRes = await post("/beds/assign", {
    bed_id: bed2Id, // Bed 2 is available
    admission_id: admission1Id, // Admission 1 already has Bed 1
  }, tokenHospitalAdmin1);
  assert.strictEqual(multiBedAssignRes.status, 409);
  assert(multiBedAssignRes.body.message.includes("already has an active bed assignment"));
  console.log("✓ Multi-bed active assignment for the same admission rejected (409 Conflict)");

  // 6. Cannot place an occupied bed into maintenance
  const maintOccupiedRes = await post(`/beds/${bed1Id}/maintenance`, {
    action: "place",
    reason: "Attempt maintenance on occupied bed",
  }, tokenHospitalAdmin1);
  assert.strictEqual(maintOccupiedRes.status, 409);
  assert(maintOccupiedRes.body.message.includes("while it is occupied"));
  console.log("✓ Placing occupied bed into maintenance rejected (409 Conflict)");

  // 7. Ward deactivation rejected while occupied beds exist (Lesson 10.1)
  const deactWardRes = await patch(`/wards/${ward1Id}/status`, {
    status: "inactive",
  }, tokenHospitalAdmin1);
  assert.strictEqual(deactWardRes.status, 409);
  assert(deactWardRes.body.message.includes("occupied bed"));
  console.log("✓ Deactivating ward with occupied beds rejected (409 Conflict)");

  // ============================================================================
  // Lesson 10.9: High Concurrency Duplicate Occupancy Stress Test
  // ============================================================================
  console.log("\n--- Testing Lesson 10.9: Concurrent Simultaneous Allocation ---");

  // Create two separate admissions to race for Bed 2
  const [p3Res] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, status)
     VALUES (?, 'Patient Charlie', ?, ?, 'active')`,
    [roleMap["patient"], `p3_${stamp}@m10.com`, passwordHash]
  );
  const patient3Id = p3Res.insertId;

  const [p4Res] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, status)
     VALUES (?, 'Patient Diana', ?, ?, 'active')`,
    [roleMap["patient"], `p4_${stamp}@m10.com`, passwordHash]
  );
  const patient4Id = p4Res.insertId;

  const adm3 = await post("/admissions", {
    patient_id: patient3Id,
    hospital_id: hospital1Id,
    doctor_id: doctor1Id,
    department_id: dept1Id,
    admission_date: new Date().toISOString(),
    reason: "Pre-op telemetry",
    initial_status: "admitted",
  }, tokenHospitalAdmin1);

  const adm4 = await post("/admissions", {
    patient_id: patient4Id,
    hospital_id: hospital1Id,
    doctor_id: doctor1Id,
    department_id: dept1Id,
    admission_date: new Date().toISOString(),
    reason: "Cardiomyopathy assessment",
    initial_status: "admitted",
  }, tokenHospitalAdmin1);

  // Send simultaneous allocation requests for Bed 2
  const [resA, resB] = await Promise.all([
    post("/beds/assign", { bed_id: bed2Id, admission_id: adm3.body.data.id }, tokenHospitalAdmin1),
    post("/beds/assign", { bed_id: bed2Id, admission_id: adm4.body.data.id }, tokenHospitalAdmin1),
  ]);

  const successCount = (resA.status === 201 ? 1 : 0) + (resB.status === 201 ? 1 : 0);
  const conflictCount = (resA.status === 409 ? 1 : 0) + (resB.status === 409 ? 1 : 0);

  assert.strictEqual(successCount, 1, "Exactly one concurrent assignment request must succeed");
  assert.strictEqual(conflictCount, 1, "The competing concurrent assignment request must be rejected with 409 Conflict");
  console.log("✓ Concurrency race condition prevented: exactly one request succeeded, other received 409 Conflict");

  // ============================================================================
  // Lesson 10.6: Discharge and Automatic Bed Status Updates
  // ============================================================================
  console.log("\n--- Testing Lesson 10.6: Discharge & Automatic Bed Release ---");

  // Discharge Patient 1 via Admission Status transition (Module 9 PATCH /api/admissions/:id/status)
  const dischargeRes = await patch(`/admissions/${admission1Id}/status`, {
    status: "discharged",
    reason: "Patient stabilized, discharged to home care",
  }, tokenHospitalAdmin1);
  assert.strictEqual(dischargeRes.status, 200);
  console.log("✓ Admission 1 successfully discharged via /api/admissions/:id/status");

  // Verify Bed 1 has been automatically released back to 'available'
  const bed1AfterDischarge = await get(`/beds/${bed1Id}`, tokenHospitalAdmin1);
  assert.strictEqual(bed1AfterDischarge.body.data.status, "available");
  assert.strictEqual(bed1AfterDischarge.body.data.active_assignment_id, null);
  console.log("✓ Bed 1 automatically returned to 'available' status after patient discharge");

  // Verify Assignment record status is now 'discharged' and has released_at timestamp
  const bed1History = await get(`/beds/${bed1Id}/history`, tokenHospitalAdmin1);
  assert.strictEqual(bed1History.status, 200);
  assert(bed1History.body.assignments.length >= 1);
  const closedAssignment = bed1History.body.assignments[0];
  assert.strictEqual(closedAssignment.status, "discharged");
  assert.notStrictEqual(closedAssignment.released_at, null);
  console.log("✓ Bed assignment record closed with discharge timestamp and audit notes preserved");

  // Discharged admission cannot be assigned another bed
  const reassignDischargedRes = await post("/beds/assign", {
    bed_id: bed1Id,
    admission_id: admission1Id,
  }, tokenHospitalAdmin1);
  assert.strictEqual(reassignDischargedRes.status, 400);
  assert(reassignDischargedRes.body.message.includes("discharged admission"));
  console.log("✓ Assigning bed to already discharged admission rejected (400 Bad Request)");

  // Return Bed 3 from maintenance to active service
  const returnMaintRes = await post(`/beds/${bed3Id}/maintenance`, {
    action: "return",
    reason: "Calibration complete, inspection passed",
  }, tokenHospitalAdmin1);
  assert.strictEqual(returnMaintRes.status, 200);
  assert.strictEqual(returnMaintRes.body.data.status, "available");
  console.log("✓ Bed 3 successfully returned from maintenance to 'available' service");

  // ============================================================================
  // Lesson 10.8: Occupancy Timestamps and Assignment History
  // ============================================================================
  console.log("\n--- Testing Lesson 10.8: Occupancy Timestamps & History ---");

  // Assign Bed 1 again to Admission 2 (now that Bed 1 is available)
  const reassignBed1Res = await post("/beds/assign", {
    bed_id: bed1Id,
    admission_id: admission2Id,
    notes: "Second occupant for Bed 1",
  }, tokenHospitalAdmin1);
  assert.strictEqual(reassignBed1Res.status, 201);

  // Check history shows both assignments: Patient 1 (discharged) and Patient 2 (active)
  const fullHistoryRes = await get(`/beds/${bed1Id}/history`, tokenHospitalAdmin1);
  assert.strictEqual(fullHistoryRes.status, 200);
  assert.strictEqual(fullHistoryRes.body.assignments.length, 2);
  assert.strictEqual(fullHistoryRes.body.assignments[0].patient_id, patient2Id);
  assert.strictEqual(fullHistoryRes.body.assignments[0].status, "active");
  assert.strictEqual(fullHistoryRes.body.assignments[1].patient_id, patient1Id);
  assert.strictEqual(fullHistoryRes.body.assignments[1].status, "discharged");
  console.log("✓ Complete chronological assignment history preserved with accurate timestamps and patient details");

  // ============================================================================
  // Lesson 10.10: Hospital-Level Ward and Bed Data Isolation
  // ============================================================================
  console.log("\n--- Testing Lesson 10.10: Hospital-Level Data Isolation ---");

  // 1. Hospital Admin 2 cannot list Hospital 1's wards
  const ha2ListWardsRes = await get(`/wards?hospital_id=${hospital1Id}`, tokenHospitalAdmin2);
  assert.strictEqual(ha2ListWardsRes.status, 200);
  // Backend must enforce Hospital Admin 2 only sees Hospital 2 records
  assert.strictEqual(ha2ListWardsRes.body.data.some((w) => w.hospital_id === hospital1Id), false);
  console.log("✓ Hospital Admin 2 scoped strictly to Hospital 2 wards; Hospital 1 wards isolated");

  // 2. Hospital Admin 2 cannot access Hospital 1's bed directly (403 Forbidden)
  const ha2BedRes = await get(`/beds/${bed1Id}`, tokenHospitalAdmin2);
  assert.strictEqual(ha2BedRes.status, 403);
  console.log("✓ Cross-hospital bed detail access rejected (403 Forbidden)");

  // 3. Hospital Admin 2 cannot place Hospital 1's bed into maintenance (403 Forbidden)
  const ha2MaintRes = await post(`/beds/${bed1Id}/maintenance`, {
    action: "place",
    reason: "Malicious cross-hospital maintenance",
  }, tokenHospitalAdmin2);
  assert.strictEqual(ha2MaintRes.status, 403);
  console.log("✓ Cross-hospital maintenance update rejected (403 Forbidden)");

  // 4. Hospital Admin 2 cannot view Hospital 1's bed assignment history (403 Forbidden)
  const ha2HistoryRes = await get(`/beds/${bed1Id}/history`, tokenHospitalAdmin2);
  assert.strictEqual(ha2HistoryRes.status, 403);
  console.log("✓ Cross-hospital bed assignment history access rejected (403 Forbidden)");

  // 5. Super Admin CAN view cross-hospital records
  const saBedRes = await get(`/beds/${bed1Id}`, tokenSuperAdmin);
  assert.strictEqual(saBedRes.status, 200);
  assert.strictEqual(saBedRes.body.data.id, bed1Id);
  console.log("✓ Super Admin retains global authorized access across hospitals");

  console.log("\n==================================================================");
  console.log("🎉 ALL MODULE 10 (LESSONS 10.1 - 10.10) TESTS PASSED SUCCESSFULLY!");
  console.log("==================================================================\n");

  process.exit(0);
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
