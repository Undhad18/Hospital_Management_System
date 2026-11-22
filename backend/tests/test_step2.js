require("dotenv").config();
const jwt = require("jsonwebtoken");
const pool = require("../db");

async function main() {
  console.log("=== Running Step 2 Integration Tests (Lessons 3.1, 3.2, 3.3) ===");

  // 1. Generate JWT tokens for test roles
  const superAdminToken = jwt.sign(
    { sub: 1, role: "super_admin", tokenVersion: 1 },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  const hospAdmin1Token = jwt.sign(
    { sub: 2, role: "hospital_admin", hospitalId: 1, tokenVersion: 1 },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  const baseUrl = `http://localhost:${process.env.PORT || 5000}`;

  // Helper fetch function
  async function api(path, options = {}, token = null) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  // TEST 1: Super Admin lists hospitals
  const listRes = await api("/api/hospitals", { method: "GET" }, superAdminToken);
  console.log("1. Super Admin list hospitals:", listRes.status === 200 && listRes.data.success ? "PASS" : "FAIL", `(found ${listRes.data.count})`);

  // TEST 2: Super Admin creates a new hospital with Lesson 3.1, 3.2, 3.3 fields
  const testCode = `TEST_${Date.now()}`;
  const createPayload = {
    name: "Apex Multi-Specialty Hospital",
    code: testCode,
    email: "contact@apexhospital.org",
    phone: "+91-9876543210",
    address: "42 Healthcare Boulevard, Tech City",
    postal_code: "400001",
    working_hours: {
      is_24_7: true,
      emergency: true,
      regular_hours: "08:00 - 20:00",
    },
    upi_id: "apexhospital@okhdfcbank",
    payee_name: "Apex Hospital Billing",
  };

  const createRes = await api("/api/hospitals", {
    method: "POST",
    body: JSON.stringify(createPayload),
  }, superAdminToken);

  console.log("2. Create hospital with working hours & UPI:", createRes.status === 201 && createRes.data.success ? "PASS" : "FAIL", createRes.data);
  const createdId = createRes.data?.data?.id;

  // TEST 3: Duplicate hospital code prevention
  const dupRes = await api("/api/hospitals", {
    method: "POST",
    body: JSON.stringify(createPayload),
  }, superAdminToken);
  console.log("3. Duplicate code rejection (409):", dupRes.status === 409 ? "PASS" : "FAIL", dupRes.data?.message);

  // TEST 4: Invalid UPI format validation
  const badUpiRes = await api("/api/hospitals", {
    method: "POST",
    body: JSON.stringify({
      name: "Bad UPI Hospital",
      code: `BAD_${Date.now()}`,
      upi_id: "not-a-valid-upi",
    }),
  }, superAdminToken);
  console.log("4. Invalid UPI format rejection (400):", badUpiRes.status === 400 ? "PASS" : "FAIL", badUpiRes.data?.message);

  // TEST 5: Get hospital detail by ID
  const detailRes = await api(`/api/hospitals/${createdId}`, { method: "GET" }, superAdminToken);
  console.log("5. Get hospital detail by ID:", detailRes.status === 200 && detailRes.data.data.name === "Apex Multi-Specialty Hospital" ? "PASS" : "FAIL");

  // TEST 6: Get generated UPI QR code
  const qrRes = await api(`/api/hospitals/${createdId}/qr`, { method: "GET" }, superAdminToken);
  const hasQr = qrRes.status === 200 && qrRes.data.data.qr_code && qrRes.data.data.qr_code.startsWith("data:image/png;base64,");
  console.log("6. Dynamic UPI QR Code generation:", hasQr ? "PASS" : "FAIL", `(URI: ${qrRes.data?.data?.payment_uri})`);

  // TEST 7: Hospital-level isolation on profile updates
  // HospAdmin 1 (assigned to hospital 1) attempts to edit created hospital (createdId != 1) -> must be 403 Forbidden
  const forbiddenProfileRes = await api(`/api/hospitals/${createdId}/profile`, {
    method: "PATCH",
    body: JSON.stringify({ phone: "+91-1111111111" }),
  }, hospAdmin1Token);
  console.log("7. Hospital Admin editing foreign hospital blocked (403):", forbiddenProfileRes.status === 403 ? "PASS" : "FAIL", forbiddenProfileRes.data?.message);

  // TEST 8: HospAdmin 1 updating own hospital (id: 1) profile -> must be 200 OK
  const ownProfileRes = await api(`/api/hospitals/1/profile`, {
    method: "PATCH",
    body: JSON.stringify({
      phone: "+91-9998887776",
      upi_id: "citygeneral@okhdfcbank",
      payee_name: "City General Trust",
      working_hours: {
        monday_friday: "09:00 - 18:00",
        emergency_24x7: true,
      },
    }),
  }, hospAdmin1Token);
  console.log("8. Hospital Admin updating own hospital profile (200):", ownProfileRes.status === 200 ? "PASS" : "FAIL", ownProfileRes.data?.message);

  // Clean up test hospital
  if (createdId) {
    await pool.execute("DELETE FROM hospitals WHERE id = ?", [createdId]);
    console.log("Cleaned up test hospital record.");
  }

  console.log("=== All Step 2 Integration Tests Finished ===");
  process.exit(0);
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
