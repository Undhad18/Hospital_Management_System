const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const assert = require("assert");
const http = require("http");
const jwt = require("jsonwebtoken");
const { io: Client } = require("socket.io-client");
const pool = require("../db");
const { initSocketServer, emitHospitalEvent, emitDigitalTwinEvent } = require("../services/socketService");

function waitForEvent(socket, eventName, timeoutMs = 4000) {
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

async function runTests() {
  console.log("================================================================================");
  console.log("=== PHASE 7: DIGITAL TWIN REAL-TIME SYNCHRONIZATION TEST SUITE ===");
  console.log("================================================================================\n");

  const TEST_PORT = 5055;
  const server = http.createServer();
  initSocketServer(server);

  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`Ephemeral test Socket.IO server running on port ${TEST_PORT}`);

  // Fetch real users from DB
  const [hosp1AdminRows] = await pool.query(
    "SELECT u.id, u.hospital_id, u.token_version, r.name as role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.hospital_id = 1 AND r.name = 'hospital_admin' LIMIT 1"
  );
  const hosp1Admin = hosp1AdminRows[0] || { id: 2, hospital_id: 1, role: "hospital_admin" };

  const [superAdminRows] = await pool.query(
    "SELECT u.id, u.token_version, r.name as role FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'super_admin' LIMIT 1"
  );
  const superAdmin = superAdminRows[0] || { id: 1, role: "super_admin" };

  const [hosp2AdminRows] = await pool.query(
    "SELECT u.id, u.hospital_id, u.token_version, r.name as role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.hospital_id = 2 AND r.name = 'hospital_admin' LIMIT 1"
  );
  let hosp2Admin = hosp2AdminRows[0];
  if (!hosp2Admin) {
    // Pick any user from another hospital
    const [altRows] = await pool.query(
      "SELECT u.id, u.hospital_id, u.token_version, r.name as role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.hospital_id > 1 LIMIT 1"
    );
    hosp2Admin = altRows[0] || { id: 9999, hospital_id: 2, role: "hospital_admin" };
  }

  // Create JWT tokens
  const tokenHosp1 = jwt.sign(
    { sub: hosp1Admin.id, role: hosp1Admin.role, hospitalId: hosp1Admin.hospital_id, tokenVersion: hosp1Admin.token_version || 1 },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  const tokenSuper = jwt.sign(
    { sub: superAdmin.id, role: superAdmin.role, hospitalId: null, tokenVersion: superAdmin.token_version || 1 },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  const tokenHosp2 = jwt.sign(
    { sub: hosp2Admin.id, role: hosp2Admin.role, hospitalId: hosp2Admin.hospital_id, tokenVersion: hosp2Admin.token_version || 1 },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  // Connect client sockets
  const clientHosp1 = Client(`http://localhost:${TEST_PORT}`, {
    auth: { token: tokenHosp1 },
    transports: ["websocket"],
    reconnection: false,
  });

  const clientSuper = Client(`http://localhost:${TEST_PORT}`, {
    auth: { token: tokenSuper },
    transports: ["websocket"],
    reconnection: false,
  });

  const clientHosp2 = Client(`http://localhost:${TEST_PORT}`, {
    auth: { token: tokenHosp2 },
    transports: ["websocket"],
    reconnection: false,
  });

  await Promise.all([
    new Promise((resolve) => clientHosp1.on("connect", resolve)),
    new Promise((resolve) => clientSuper.on("connect", resolve)),
    new Promise((resolve) => clientHosp2.on("connect", resolve)),
  ]);

  console.log("✓ Connected 3 authenticated test sockets: Hospital 1, Super Admin, Hospital 2\n");

  // ============================================================================
  // TEST 7.1: OPERATIONAL EVENT TO DIGITAL TWIN AUTOMATIC MIRRORING
  // ============================================================================
  console.log("--- Test 7.1: Operational Event Mirroring (appointments:updated -> digital_twin:update) ---");
  const p1 = waitForEvent(clientHosp1, "digital_twin:update");
  const pSuper = waitForEvent(clientSuper, "digital_twin:update");

  let hosp2Received = false;
  const hosp2Listener = () => { hosp2Received = true; };
  clientHosp2.on("digital_twin:update", hosp2Listener);

  emitHospitalEvent(1, "appointments:updated", {
    action: "status_changed",
    appointmentId: 501,
    status: "in_waiting",
  });

  const [receivedHosp1, receivedSuper] = await Promise.all([p1, pSuper]);

  assert.strictEqual(receivedHosp1.subsystem, "appointments");
  assert.strictEqual(receivedHosp1.hospitalId, 1);
  assert.strictEqual(receivedHosp1.status, "in_waiting");
  assert.strictEqual(receivedSuper.subsystem, "appointments");
  assert.strictEqual(receivedSuper.hospitalId, 1);
  console.log(`✓ Hospital 1 socket received digital_twin:update: subsystem=[${receivedHosp1.subsystem}], status=[${receivedHosp1.status}]`);
  console.log(`✓ Super Admin socket received digital_twin:update via hospital:all`);

  // Allow 200ms to verify Hospital 2 socket NEVER received Hospital 1's event
  await new Promise((r) => setTimeout(r, 200));
  clientHosp2.off("digital_twin:update", hosp2Listener);
  assert.strictEqual(hosp2Received, false, "Hospital 2 socket must NEVER receive Hospital 1's Digital Twin events");
  console.log("✓ Multi-Tenant Isolation verified: Hospital 2 received 0 events from Hospital 1");

  // ============================================================================
  // TEST 7.2: INPATIENT WARD & BED DIGITAL TWIN SYNCHRONIZATION
  // ============================================================================
  console.log("\n--- Test 7.2: Ward & Bed Digital Twin Event Broadcast ---");
  const pBedHosp1 = waitForEvent(clientHosp1, "digital_twin:beds");
  const pBedUpdate = waitForEvent(clientHosp1, "digital_twin:update");

  emitDigitalTwinEvent(1, "beds", "status_changed", {
    bedId: 101,
    bedNumber: "ICU-01",
    status: "occupied",
    admissionId: 88,
  });

  const [bedSubsystemPayload, bedUpdatePayload] = await Promise.all([pBedHosp1, pBedUpdate]);

  assert.strictEqual(bedSubsystemPayload.subsystem, "beds");
  assert.strictEqual(bedSubsystemPayload.action, "status_changed");
  assert.strictEqual(bedSubsystemPayload.details.status, "occupied");
  assert.strictEqual(bedUpdatePayload.subsystem, "beds");
  console.log(`✓ Bed status transition received in real-time: [${bedSubsystemPayload.details.bedNumber}] -> ${bedSubsystemPayload.details.status}`);

  // ============================================================================
  // TEST 7.3: CLINICAL CONSULTATION FLOW SYNCHRONIZATION
  // ============================================================================
  console.log("\n--- Test 7.3: Consultation Journey Stage Synchronization ---");
  const pConsult = waitForEvent(clientHosp1, "digital_twin:consultations");

  emitDigitalTwinEvent(1, "consultations", "started", {
    consultationId: 201,
    appointmentId: 501,
    status: "in_progress",
  });

  const consultPayload = await pConsult;
  assert.strictEqual(consultPayload.subsystem, "consultations");
  assert.strictEqual(consultPayload.action, "started");
  assert.strictEqual(consultPayload.details.status, "in_progress");
  console.log(`✓ Consultation start event received: ID=[${consultPayload.details.consultationId}] -> Stage 4 (Consultation In Progress)`);

  // ============================================================================
  // TEST 7.4: PHARMACY & LABORATORY TELEMETRY SYNCHRONIZATION
  // ============================================================================
  console.log("\n--- Test 7.4: Laboratory & Pharmacy Subsystem Synchronization ---");
  const pLab = waitForEvent(clientHosp1, "digital_twin:laboratory");
  const pPharm = waitForEvent(clientHosp1, "digital_twin:pharmacy");

  emitDigitalTwinEvent(1, "laboratory", "order_completed", { orderId: 77, testName: "CBC" });
  emitDigitalTwinEvent(1, "pharmacy", "dispensed", { dispensationId: 44, medicine: "Paracetamol" });

  const [labPayload, pharmPayload] = await Promise.all([pLab, pPharm]);
  assert.strictEqual(labPayload.subsystem, "laboratory");
  assert.strictEqual(pharmPayload.subsystem, "pharmacy");
  console.log(`✓ Laboratory & Pharmacy telemetry events verified: Lab=[${labPayload.details.testName}], Pharmacy=[${pharmPayload.details.medicine}]`);

  // Clean up sockets & server
  clientHosp1.disconnect();
  clientSuper.disconnect();
  clientHosp2.disconnect();

  await new Promise((resolve) => server.close(resolve));
  console.log("\n✓ Test sockets and server closed cleanly");

  console.log("\n================================================================================");
  console.log("=== PHASE 7: ALL REAL-TIME SYNCHRONIZATION TESTS PASSED (4/4) ===");
  console.log("================================================================================\n");

  await pool.end();
  await new Promise((resolve) => setTimeout(resolve, 100));
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
