const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const jwt = require("jsonwebtoken");
const pool = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_jwt_key_at_least_32_characters_long";
const API_BASE = "http://localhost:5000/api";

async function runTests() {
  console.log("=== Running OPD Patient Schedule & Clinical Queue Comprehensive Tests ===");

  // 1. Get Dr. Sarah Jenkins (Doctor ID 39)
  const [docRows] = await pool.query("SELECT id, email, token_version, hospital_id, department_id FROM users WHERE id = 39");
  const doctor = docRows[0];
  const docToken = jwt.sign(
    { sub: "39", email: doctor.email, role: "doctor", hospitalId: doctor.hospital_id, departmentId: doctor.department_id, tokenVersion: doctor.token_version },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // Staff token
  const [staffRows] = await pool.query("SELECT id, email, token_version, hospital_id FROM users WHERE id = 40");
  const staff = staffRows[0];
  const staffToken = jwt.sign(
    { sub: "40", email: staff.email, role: "staff", hospitalId: staff.hospital_id, tokenVersion: staff.token_version },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  const todayStr = new Date().toISOString().split("T")[0];

  // Test 1: Fetch initial OPD Schedule
  console.log("\n--- TEST 1: Initial OPD Schedule Load from MySQL ---");
  const schedRes = await fetch(`${API_BASE}/appointments?date=${todayStr}`, {
    headers: { Authorization: `Bearer ${docToken}` },
  });
  const schedData = await schedRes.json();
  console.log(`Initial appointments count: ${schedData.count}`);
  console.table(schedData.data.map(a => ({
    id: a.id,
    number: a.appointment_number,
    patient: a.patient_name,
    time: a.appointment_time,
    status: a.status,
    queue: a.queue_number,
  })));

  const apt1 = schedData.data.find(a => a.appointment_number === "APT-DEMO-01"); // in_waiting
  const apt2 = schedData.data.find(a => a.appointment_number === "APT-DEMO-02"); // in_progress
  const apt3 = schedData.data.find(a => a.appointment_number === "APT-DEMO-03"); // confirmed
  const apt4 = schedData.data.find(a => a.appointment_number === "APT-DEMO-04"); // completed

  if (!apt1 || !apt2 || !apt3 || !apt4) {
    throw new Error("Missing required demo appointments in database!");
  }

  // Test 2: Start Consultation on APT-DEMO-01
  console.log(`\n--- TEST 2: Start Consultation on APT-DEMO-01 (ID: ${apt1.id}) ---`);
  const startRes = await fetch(`${API_BASE}/appointments/${apt1.id}/status`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${docToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "in_progress" }),
  });
  const startData = await startRes.json();
  console.log("Start consultation response:", startData);
  if (!startData.success || startData.status !== "in_progress") {
    throw new Error("Failed to start consultation!");
  }

  // Test 3: Mark Completed on APT-DEMO-02
  console.log(`\n--- TEST 3: Mark Completed on APT-DEMO-02 (ID: ${apt2.id}) ---`);
  // Start and submit consultation for APT-DEMO-02 to fulfill Module 8 prerequisite
  await fetch(`${API_BASE}/consultations/start`, {
    method: "POST",
    headers: { Authorization: `Bearer ${docToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ appointment_id: apt2.id }),
  });
  const [c2Row] = await pool.query("SELECT id FROM consultations WHERE appointment_id = ?", [apt2.id]);
  await fetch(`${API_BASE}/consultations/${c2Row[0].id}/submit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${docToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      chief_complaint: "Cardiac follow-up review",
      examination_findings: "Normal S1/S2, clear lung sounds",
      diagnosis: "Essential Hypertension - Controlled",
      treatment_plan: "Continue Amlodipine 5mg once daily",
    }),
  });

  const compRes = await fetch(`${API_BASE}/appointments/${apt2.id}/status`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${docToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "completed" }),
  });
  const compData = await compRes.json();
  console.log("Mark completed response:", compData);
  if (!compData.success || compData.status !== "completed") {
    throw new Error("Failed to mark appointment completed!");
  }

  // Test 4: Admit Patient on APT-DEMO-01
  console.log(`\n--- TEST 4: Admit Patient on APT-DEMO-01 (ID: ${apt1.id}) ---`);
  const admitRes = await fetch(`${API_BASE}/appointments/${apt1.id}/status`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${docToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "admitted", reason: "Admitted to Cardiology CCU" }),
  });
  const admitData = await admitRes.json();
  console.log("Admit response:", admitData);
  if (!admitData.success || admitData.status !== "admitted") {
    throw new Error("Failed to admit patient!");
  }

  // Test 5: Mark Waiting on APT-DEMO-03 (David Kim - currently confirmed, no token)
  console.log(`\n--- TEST 5: Mark Waiting on APT-DEMO-03 (ID: ${apt3.id}) ---`);
  const waitRes = await fetch(`${API_BASE}/appointments/${apt3.id}/status`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${docToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "in_waiting" }),
  });
  const waitData = await waitRes.json();
  console.log("Mark waiting response:", waitData);
  if (!waitData.success || waitData.status !== "in_waiting" || !waitData.data?.queue_number) {
    throw new Error("Failed to transition to in_waiting or missing generated queue token!");
  }
  console.log(`Assigned Queue Token for David Kim: ${waitData.data.queue_number}`);

  // Test 6: Verify Database Persistence after Simulated Page Refresh
  console.log("\n--- TEST 6: Simulated Page Refresh (Querying MySQL Directly) ---");
  const [dbRows] = await pool.query(
    `SELECT id, appointment_number, status, queue_number, check_in_time, reason 
     FROM appointments 
     WHERE id IN (?, ?, ?, ?)
     ORDER BY id ASC`,
    [apt1.id, apt2.id, apt3.id, apt4.id]
  );
  console.table(dbRows);

  const row1 = dbRows.find(r => r.id === apt1.id);
  const row2 = dbRows.find(r => r.id === apt2.id);
  const row3 = dbRows.find(r => r.id === apt3.id);
  const row4 = dbRows.find(r => r.id === apt4.id);

  if (row1.status !== "admitted") throw new Error("APT-DEMO-01 was not persisted as admitted in MySQL!");
  if (row2.status !== "completed") throw new Error("APT-DEMO-02 was not persisted as completed in MySQL!");
  if (row3.status !== "in_waiting" || !row3.queue_number) throw new Error("APT-DEMO-03 was not persisted as in_waiting with token in MySQL!");
  if (row4.status !== "completed") throw new Error("APT-DEMO-04 was not persisted as completed in MySQL!");

  console.log("✓ All status changes confirmed persistently stored in MySQL!");

  // Test 7: Verify Dedicated OPD Router Endpoints
  console.log("\n--- TEST 7: Dedicated OPD Router Endpoints (/api/opd) ---");
  const opdSched = await (await fetch(`${API_BASE}/opd/schedule?date=${todayStr}`, { headers: { Authorization: `Bearer ${docToken}` } })).json();
  console.log(`GET /api/opd/schedule returned ${opdSched.count} appointments.`);
  if (!opdSched.success || opdSched.count === 0) throw new Error("GET /api/opd/schedule failed!");

  const opdQueue = await (await fetch(`${API_BASE}/opd/queue?date=${todayStr}`, { headers: { Authorization: `Bearer ${docToken}` } })).json();
  console.log(`GET /api/opd/queue returned ${opdQueue.count} queue entries.`);
  if (!opdQueue.success) throw new Error("GET /api/opd/queue failed!");

  console.log("\n=======================================================");
  console.log("ALL OPD CLINICAL QUEUE TESTS PASSED! (7 / 7)");
  console.log("=======================================================");

  process.exit(0);
}

runTests().catch(err => {
  console.error("Test failure:", err);
  process.exit(1);
});
