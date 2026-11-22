const assert = require("assert");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { io } = require("socket.io-client");
const pool = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "3d4a415aad83b711038c10d4348c49db55e76fbd28d48be03abca423acfa47f1";
const API_BASE = "http://localhost:5000/api";
const SOCKET_URL = "http://localhost:5000";

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

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const s = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: false,
      timeout: 5000,
    });

    s.on("connect", () => resolve(s));
    s.on("connect_error", (err) => reject(err));
  });
}

function waitForEvent(socket, eventName, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, listener);
      reject(new Error(`Timeout waiting for event '${eventName}' after ${timeoutMs}ms`));
    }, timeoutMs);

    function listener(payload) {
      clearTimeout(timer);
      socket.off(eventName, listener);
      resolve(payload);
    }

    socket.on(eventName, listener);
  });
}

async function runRealtimeSyncSuite() {
  console.log("==================================================================");
  console.log("=== Running HMS Real-Time Data Synchronization Test Suite ===");
  console.log("==================================================================");

  const stamp = Date.now();
  let passed = 0;
  let total = 0;

  function recordPass(testName) {
    passed++;
    total++;
    console.log(`[PASS] Test ${total}: ${testName}`);
  }

  function recordFail(testName, err) {
    total++;
    console.error(`[FAIL] Test ${total}: ${testName} ->`, err.message);
    throw err;
  }

  // --- Step 1: Create Test Fixtures ---
  console.log("\n--- Creating Test Fixtures for Hospital 1 & Hospital 2 ---");

  const [roleRows] = await pool.execute("SELECT id, name FROM roles");
  const roleMap = {};
  for (const r of roleRows) roleMap[r.name] = r.id;

  // Hospital 1 (Alpha)
  const [h1Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, phone, status, payee_name, upi_id)
     VALUES (?, ?, ?, ?, 'active', 'Alpha Medical Corp', 'alpha@upi')`,
    [`Sync Hospital Alpha ${stamp}`, `SHA-${stamp}`, `h1_${stamp}@sync.test`, "+91-9000000001"]
  );
  const hospital1Id = h1Res.insertId;

  // Hospital 2 (Beta) - Data Isolation Check
  const [h2Res] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, phone, status, payee_name, upi_id)
     VALUES (?, ?, ?, ?, 'active', 'Beta Medical Corp', 'beta@upi')`,
    [`Sync Hospital Beta ${stamp}`, `SHB-${stamp}`, `h2_${stamp}@sync.test`, "+91-9000000002"]
  );
  const hospital2Id = h2Res.insertId;

  // Department in Hospital 1
  const [d1Res] = await pool.execute(
    "INSERT INTO departments (hospital_id, name, status) VALUES (?, 'Emergency Trauma', 'active')",
    [hospital1Id]
  );
  const dept1Id = d1Res.insertId;

  // Department in Hospital 2
  const [d2Res] = await pool.execute(
    "INSERT INTO departments (hospital_id, name, status) VALUES (?, 'Beta Cardiology', 'active')",
    [hospital2Id]
  );
  const dept2Id = d2Res.insertId;

  const passwordHash = await bcrypt.hash("@Pass12345678", 10);

  // Admin for Hospital 1
  const [adm1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status, token_version)
     VALUES (?, ?, 'Admin Alpha', ?, ?, 'active', 1)`,
    [roleMap["hospital_admin"], hospital1Id, `adm1_${stamp}@sync.test`, passwordHash]
  );
  const admin1Id = adm1Res.insertId;
  const tokenAdmin1 = jwt.sign({ sub: admin1Id, role: "hospital_admin", tokenVersion: 1 }, JWT_SECRET, { expiresIn: "1h" });

  // Staff for Hospital 1
  const [stf1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, department_id, full_name, email, password_hash, status, token_version)
     VALUES (?, ?, ?, 'Staff Nurse Alpha', ?, ?, 'active', 1)`,
    [roleMap["staff"], hospital1Id, dept1Id, `stf1_${stamp}@sync.test`, passwordHash]
  );
  const staff1Id = stf1Res.insertId;
  const tokenStaff1 = jwt.sign({ sub: staff1Id, role: "staff", tokenVersion: 1 }, JWT_SECRET, { expiresIn: "1h" });

  // Doctor for Hospital 1
  const [doc1Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, department_id, full_name, email, password_hash, status, token_version)
     VALUES (?, ?, ?, 'Dr. Alpha Specialist', ?, ?, 'active', 1)`,
    [roleMap["doctor"], hospital1Id, dept1Id, `doc1_${stamp}@sync.test`, passwordHash]
  );
  const doctor1Id = doc1Res.insertId;

  // Admin for Hospital 2 (Isolated)
  const [adm2Res] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, full_name, email, password_hash, status, token_version)
     VALUES (?, ?, 'Admin Beta', ?, ?, 'active', 1)`,
    [roleMap["hospital_admin"], hospital2Id, `adm2_${stamp}@sync.test`, passwordHash]
  );
  const admin2Id = adm2Res.insertId;
  const tokenAdmin2 = jwt.sign({ sub: admin2Id, role: "hospital_admin", tokenVersion: 1 }, JWT_SECRET, { expiresIn: "1h" });

  // Patient for admissions
  const [patRes] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, phone, password_hash, status, token_version)
     VALUES (?, 'Patient John Sync', ?, '+91-9111111111', ?, 'active', 1)`,
    [roleMap["patient"], `pat_${stamp}@sync.test`, passwordHash]
  );
  const patientId = patRes.insertId;

  let socketAdmin1 = null;
  let socketStaff1 = null;
  let socketAdmin2 = null;

  try {
    // --- Test 0: Security & Authentication Enforcement on Sockets ---
    console.log("\n--- Executing Test 0: Security & Socket Authentication ---");
    try {
      await connectSocket("invalid-token-here");
      assert.fail("Should have rejected invalid JWT token");
    } catch (err) {
      assert(err.message.includes("jwt") || err.message.includes("Authentication") || err.message.includes("token"), "Rejected invalid token");
      recordPass("Socket connection rejected without valid JWT authentication token");
    }

    // Connect authorized sockets
    socketAdmin1 = await connectSocket(tokenAdmin1);
    socketStaff1 = await connectSocket(tokenStaff1);
    socketAdmin2 = await connectSocket(tokenAdmin2);
    assert(socketAdmin1.connected && socketStaff1.connected && socketAdmin2.connected, "All authorized sockets connected");
    recordPass("Authorized Hospital Admin 1, Staff 1, and Hospital Admin 2 connected securely");

    // --- Test 1: Hospital Configuration Sync ---
    console.log("\n--- Executing Test 1: Hospital Configuration Real-Time Sync ---");
    {
      const staffPromise = waitForEvent(socketStaff1, "hospital:updated");

      // Hospital 2 socket should NOT receive Hospital 1's event
      let h2Received = false;
      const h2Listener = () => { h2Received = true; };
      socketAdmin2.on("hospital:updated", h2Listener);

      const updateRes = await patch(
        `/hospitals/${hospital1Id}/profile`,
        { phone: "+91-9999988888", address: "404 Realtime Boulevard" },
        tokenAdmin1
      );
      assert.strictEqual(updateRes.status, 200, "Hospital update succeeded");

      const eventPayload = await staffPromise;
      assert.strictEqual(Number(eventPayload.hospitalId), Number(hospital1Id), "Payload matches updated hospitalId");
      assert.strictEqual(eventPayload.action, "profile_updated", "Payload action is profile_updated");

      // Give 200ms to ensure Hospital 2 received nothing
      await new Promise((r) => setTimeout(r, 200));
      socketAdmin2.off("hospital:updated", h2Listener);
      assert.strictEqual(h2Received, false, "Hospital 2 did NOT receive Hospital 1 configuration event (Data Isolation)");

      recordPass("Hospital Admin profile change automatically propagated to Staff Panel socket with Hospital isolation");
    }

    // --- Test 2: Department Mapping Sync ---
    console.log("\n--- Executing Test 2: Department Mapping Real-Time Sync ---");
    {
      const staffPromise = waitForEvent(socketStaff1, "departments:updated");

      const createDeptRes = await post(
        "/departments",
        { hospital_id: hospital1Id, name: `Pediatric ICU ${stamp}`, description: "Specialized pediatric emergency unit" },
        tokenAdmin1
      );
      assert.strictEqual(createDeptRes.status, 201, "Department created");
      const newDeptId = createDeptRes.body.data.id;

      const eventPayload = await staffPromise;
      assert.strictEqual(Number(eventPayload.hospitalId), Number(hospital1Id));
      assert.strictEqual(eventPayload.action, "created");
      assert.strictEqual(Number(eventPayload.departmentId), Number(newDeptId));

      recordPass("Department creation by Admin emitted departments:updated to Staff panel without page refresh");
    }

    // --- Test 3: Ward and Bed Creation & Status Synchronization ---
    console.log("\n--- Executing Test 3: Ward & Bed Status Real-Time Sync ---");
    let wardId = null;
    let bedId = null;

    // 3a. Ward Creation
    {
      const staffWardPromise = waitForEvent(socketStaff1, "wards:updated");

      const createWardRes = await post(
        "/wards",
        {
          hospital_id: hospital1Id,
          department_id: dept1Id,
          name: `Sync Trauma Ward ${stamp}`,
          ward_type: "general",
          capacity: 5,
        },
        tokenAdmin1
      );
      assert.strictEqual(createWardRes.status, 201, "Ward created");
      wardId = createWardRes.body.data.id;

      const wardEvent = await staffWardPromise;
      assert.strictEqual(Number(wardEvent.hospitalId), Number(hospital1Id));
      assert.strictEqual(wardEvent.action, "created");
      assert.strictEqual(Number(wardEvent.wardId), Number(wardId));

      recordPass("Ward creation emitted wards:updated to Staff panel");
    }

    // 3b. Bed Creation
    {
      const staffBedPromise = waitForEvent(socketStaff1, "beds:updated");

      const createBedRes = await post(
        "/beds",
        {
          ward_id: wardId,
          bed_number: `BED-S1-${stamp}`,
          bed_type: "standard",
          daily_rate: 150.0,
        },
        tokenAdmin1
      );
      assert.strictEqual(createBedRes.status, 201, "Bed created");
      bedId = createBedRes.body.data.id;

      const bedEvent = await staffBedPromise;
      assert.strictEqual(Number(bedEvent.hospitalId), Number(hospital1Id));
      assert.strictEqual(bedEvent.action, "created");
      assert.strictEqual(Number(bedEvent.bedId), Number(bedId));
      assert.strictEqual(bedEvent.status, "available");

      recordPass("Bed creation emitted beds:updated with status 'available' to Staff panel");
    }

    // 3c. Bed Maintenance Toggle (Available -> Maintenance -> Available)
    {
      const maintenancePromise = waitForEvent(socketStaff1, "beds:updated");

      const maintRes = await post(
        `/beds/${bedId}/maintenance`,
        { action: "place", reason: "Sterilization and sanitation check" },
        tokenAdmin1
      );
      assert.strictEqual(maintRes.status, 200, "Bed placed under maintenance");

      const maintEvent = await maintenancePromise;
      assert.strictEqual(maintEvent.action, "maintenance_placed");
      assert.strictEqual(Number(maintEvent.bedId), Number(bedId));
      assert.strictEqual(maintEvent.status, "maintenance");

      recordPass("Bed maintenance status change instantly notified Staff panel as 'maintenance'");

      const returnPromise = waitForEvent(socketStaff1, "beds:updated");
      const returnRes = await post(
        `/beds/${bedId}/maintenance`,
        { action: "return", reason: "Service complete" },
        tokenAdmin1
      );
      assert.strictEqual(returnRes.status, 200, "Bed returned to service");

      const returnEvent = await returnPromise;
      assert.strictEqual(returnEvent.action, "maintenance_returned");
      assert.strictEqual(returnEvent.status, "available");

      recordPass("Bed return to service instantly notified Staff panel as 'available'");
    }

    // --- Test 4: Patient Admission and Bed Allocation Sync ---
    console.log("\n--- Executing Test 4: Admission & Bed Allocation Cross-Sync ---");
    let admissionId = null;
    {
      const adminAdmPromise = waitForEvent(socketAdmin1, "admissions:updated");

      // Staff creates admission
      const admRes = await post(
        "/admissions",
        {
          patient_id: patientId,
          hospital_id: hospital1Id,
          doctor_id: doctor1Id,
          department_id: dept1Id,
          admission_date: new Date().toISOString(),
          reason: "Emergency observation and monitoring",
        },
        tokenStaff1
      );
      assert.strictEqual(admRes.status, 201, "Admission created");
      admissionId = admRes.body.data.id;

      const admEvent = await adminAdmPromise;
      assert.strictEqual(Number(admEvent.admissionId), Number(admissionId));
      assert.strictEqual(admEvent.action, "created");
      recordPass("Staff admission creation notified Hospital Admin panel in real time");

      // Staff assigns bed to patient -> Admin receives beds:updated with 'occupied'
      const adminBedAssignPromise = waitForEvent(socketAdmin1, "beds:updated");
      const assignRes = await post(
        "/beds/assign",
        { bed_id: bedId, admission_id: admissionId, notes: "Allocated trauma bed" },
        tokenStaff1
      );
      assert.strictEqual(assignRes.status, 201, "Bed assigned");

      const assignEvent = await adminBedAssignPromise;
      assert.strictEqual(assignEvent.action, "assigned");
      assert.strictEqual(Number(assignEvent.bedId), Number(bedId));
      assert.strictEqual(assignEvent.status, "occupied");
      recordPass("Bed allocation by Staff updated Admin panel to 'occupied' in real time");

      // Staff discharges patient -> Admin receives admissions:updated and beds:updated
      const adminDischargePromise = waitForEvent(socketAdmin1, "admissions:updated");
      const adminBedReleasePromise = waitForEvent(socketAdmin1, "beds:updated");

      const dischargeRes = await patch(
        `/admissions/${admissionId}/status`,
        { status: "discharged", reason: "Patient fully recovered" },
        tokenStaff1
      );
      assert.strictEqual(dischargeRes.status, 200, "Patient discharged");

      const dischargeEvent = await adminDischargePromise;
      assert.strictEqual(dischargeEvent.status, "discharged");

      const releaseEvent = await adminBedReleasePromise;
      assert.strictEqual(releaseEvent.action, "released_via_discharge");
      recordPass("Discharge automatically released bed and notified both panels in real time");
    }

    // --- Test 5: Persistence Verification in MySQL ---
    console.log("\n--- Executing Test 5: MySQL Database Persistence Check ---");
    {
      const [bedCheck] = await pool.execute("SELECT status, maintenance_reason FROM beds WHERE id = ?", [bedId]);
      assert.strictEqual(bedCheck.length, 1);
      assert.strictEqual(bedCheck[0].status, "available", "Bed status persisted in MySQL as available");

      const [admCheck] = await pool.execute("SELECT status, discharged_at FROM admissions WHERE id = ?", [admissionId]);
      assert.strictEqual(admCheck.length, 1);
      assert.strictEqual(admCheck[0].status, "discharged", "Admission status persisted in MySQL as discharged");
      assert(admCheck[0].discharged_at !== null, "discharged_at timestamp recorded");

      const getBedApiRes = await get(`/beds/${bedId}`, tokenStaff1);
      assert.strictEqual(getBedApiRes.status, 200);
      assert.strictEqual(getBedApiRes.body.data.status, "available");

      recordPass("REST API and MySQL database confirm all real-time synced records accurately persisted");
    }

    // --- Test 6: Security: Prevention of Cross-Hospital Subscriptions ---
    console.log("\n--- Executing Test 6: Security & Cross-Hospital Subscription Protection ---");
    {
      // Staff 1 (belongs to Hospital 1) attempts to subscribe to Hospital 2's room
      const unauthorizedPromise = waitForEvent(socketStaff1, "error:unauthorized");
      socketStaff1.emit("subscribe:hospital", hospital2Id);

      const errorPayload = await unauthorizedPromise;
      assert(errorPayload.message.includes("Unauthorized"), "Backend caught and rejected cross-hospital subscription");
      recordPass("Backend rejected unauthorized attempt to subscribe to another hospital's room");
    }

    // --- Test 7: Failure Recovery and Reconnection ---
    console.log("\n--- Executing Test 7: Failure Recovery and Auto-Reconnection ---");
    {
      // Disconnect socketStaff1 temporarily
      socketStaff1.disconnect();
      assert(!socketStaff1.connected, "Socket disconnected");

      // While disconnected, Admin updates hospital phone
      const phoneAfter = "+91-9123456789";
      await patch(`/hospitals/${hospital1Id}/profile`, { phone: phoneAfter }, tokenAdmin1);

      // Reconnect socket
      socketStaff1 = await connectSocket(tokenStaff1);
      assert(socketStaff1.connected, "Socket successfully reconnected");

      // Verify that after reconnection, GET /hospitals accurately retrieves latest persisted state
      const refreshedHosp = await get("/hospitals", tokenStaff1);
      const alphaHosp = refreshedHosp.body.data.find((h) => Number(h.id) === Number(hospital1Id));
      assert.strictEqual(alphaHosp.phone, phoneAfter, "Latest data retrieved after reconnection");

      recordPass("Client recovered from connection loss and accurately retrieved current database state");
    }

    // --- Test 8: Regression Testing on Core System APIs ---
    console.log("\n--- Executing Test 8: Regression Validation ---");
    {
      const healthRes = await get("/health");
      assert.strictEqual(healthRes.status, 200);
      assert.strictEqual(healthRes.body.success, true);

      const dbHealthRes = await get("/health/db");
      assert.strictEqual(dbHealthRes.status, 200);
      assert.strictEqual(dbHealthRes.body.database, true);

      const bedsListRes = await get(`/beds?hospital_id=${hospital1Id}`, tokenStaff1);
      assert.strictEqual(bedsListRes.status, 200);
      assert(Array.isArray(bedsListRes.body.data));

      recordPass("Health check, database integration, and core endpoints passed regression checks");
    }

    console.log("\n==================================================================");
    console.log(`=== ALL ${passed}/${total} REAL-TIME SYNCHRONIZATION TESTS PASSED ===`);
    console.log("==================================================================");
  } catch (err) {
    recordFail("Real-time Synchronization Suite Execution", err);
  } finally {
    if (socketAdmin1) socketAdmin1.disconnect();
    if (socketStaff1) socketStaff1.disconnect();
    if (socketAdmin2) socketAdmin2.disconnect();
    await pool.end();
  }
}

runRealtimeSyncSuite();
