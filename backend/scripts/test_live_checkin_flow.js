const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_jwt_key_at_least_32_characters_long";
const API_BASE = "http://localhost:5000/api";

async function main() {
  console.log("=== Testing End-to-End Staff Queue & Check-In Workflow ===");

  // Staff token for Hospital 1
  const staffToken = jwt.sign(
    { sub: "1", email: "staff@hospital.com", role: "staff", hospitalId: 1, tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // 1. Fetch live queue before check-in
  console.log("\n1. Fetching live queue before check-in...");
  const qRes1 = await fetch(`${API_BASE}/appointments/queue/live`, {
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  const qData1 = await qRes1.json();
  console.log(`Live queue status: ${qRes1.status}`);
  console.log(`Live queue count: ${qData1.queue?.length || 0}`);
  console.log("Queue entries:", (qData1.queue || []).map(q => `${q.queue_number}: ${q.patient_name} (${q.appointment_number}) - ${q.status}`));

  // 2. Perform Check-In for APT-TODAY-01 (ID 141)
  console.log("\n2. Checking in appointment ID 141 (APT-TODAY-01)...");
  const checkInRes = await fetch(`${API_BASE}/appointments/141/check-in`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${staffToken}`,
      "Content-Type": "application/json",
    },
  });
  const checkInData = await checkInRes.json();
  console.log(`Check-in response status: ${checkInRes.status}`);
  console.log("Check-in response data:", checkInData);

  // 3. Re-fetch live queue after check-in
  console.log("\n3. Fetching live queue after check-in (simulating page reload)...");
  const qRes2 = await fetch(`${API_BASE}/appointments/queue/live`, {
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  const qData2 = await qRes2.json();
  console.log(`Live queue count after check-in: ${qData2.queue?.length || 0}`);
  console.log("Queue entries:", (qData2.queue || []).map(q => `${q.queue_number}: ${q.patient_name} (${q.appointment_number}) - ${q.status}`));

  // 4. Test duplicate check-in prevention
  console.log("\n4. Testing duplicate check-in prevention for ID 141...");
  const dupRes = await fetch(`${API_BASE}/appointments/141/check-in`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${staffToken}`,
      "Content-Type": "application/json",
    },
  });
  const dupData = await dupRes.json();
  console.log(`Duplicate check-in response status: ${dupRes.status} (Expected 400)`);
  console.log("Duplicate check-in response data:", dupData);

  console.log("\n=== Flow Completed ===");
}

main().catch(console.error);
