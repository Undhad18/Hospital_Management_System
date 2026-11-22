require("dotenv").config();
const jwt = require("jsonwebtoken");
const pool = require("../db");

async function main() {
  console.log("=== Running Step 5 Integration Tests (Lessons 3.7 & 3.8 — Lifecycle & Isolation) ===");

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

  // User 4 is Hospital Admin for Hospital 2
  const hospAdmin2Token = jwt.sign(
    { sub: 4, role: "hospital_admin", hospitalId: 2, tokenVersion: 1 },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  const baseUrl = `http://localhost:${process.env.PORT || 5000}`;

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

  // --- PART 1: HOSPITAL ACTIVATION & DEACTIVATION (Lesson 3.7) ---

  // 1. Super Admin deactivates Hospital 2
  const deactRes = await api("/api/hospitals/2/status", {
    method: "PATCH",
    body: JSON.stringify({ status: "inactive", reason: "Annual compliance audit pending" }),
  }, superAdminToken);
  console.log("1. Super Admin deactivates Hospital 2:", deactRes.status === 200 && deactRes.data.success ? "PASS" : "FAIL", deactRes.data?.message);

  // 2. Audit log entry verified
  const [logs] = await pool.execute(
    "SELECT id, action, target_type, target_id, details FROM audit_logs WHERE action = 'HOSPITAL_STATUS_CHANGED' AND target_id = 2 ORDER BY id DESC LIMIT 1"
  );
  const auditRecorded = logs.length > 0 && logs[0].target_id === 2;
  console.log("2. Audit trail logged for hospital deactivation:", auditRecorded ? "PASS" : "FAIL", logs[0]?.details);

  // 3. Lockout enforcement: Hospital Admin 2 calls authenticated endpoint while hospital is inactive -> must be 403
  const lockoutRes = await api("/api/hospitals", { method: "GET" }, hospAdmin2Token);
  console.log("3. Inactive hospital user blocked on auth middleware (403):", lockoutRes.status === 403 ? "PASS" : "FAIL", lockoutRes.data?.message);

  // 4. Unauthorized Hospital Admin 1 tries to change Hospital 1 or 2 status -> must be 403
  const unauthStatusChangeRes = await api("/api/hospitals/1/status", {
    method: "PATCH",
    body: JSON.stringify({ status: "inactive" }),
  }, hospAdmin1Token);
  console.log("4. Hospital Admin blocked from modifying hospital status (403):", unauthStatusChangeRes.status === 403 ? "PASS" : "FAIL");

  // 5. Super Admin reactivates Hospital 2
  const reactRes = await api("/api/hospitals/2/status", {
    method: "PATCH",
    body: JSON.stringify({ status: "active", reason: "Compliance verified" }),
  }, superAdminToken);
  console.log("5. Super Admin reactivates Hospital 2:", reactRes.status === 200 && reactRes.data.success ? "PASS" : "FAIL");

  // 6. Hospital Admin 2 can access again once active
  const accessRestoredRes = await api("/api/hospitals", { method: "GET" }, hospAdmin2Token);
  console.log("6. Hospital Admin 2 access restored after reactivation (200):", accessRestoredRes.status === 200 ? "PASS" : "FAIL");

  // --- PART 2: HOSPITAL-LEVEL DATA ISOLATION (Lesson 3.8) ---

  // 7. Hospital Admin 1 viewing Hospital 2 detail -> 403 Forbidden
  const foreignHospDetailRes = await api("/api/hospitals/2", { method: "GET" }, hospAdmin1Token);
  console.log("7. Hospital Admin 1 viewing Hospital 2 blocked (403):", foreignHospDetailRes.status === 403 ? "PASS" : "FAIL", foreignHospDetailRes.data?.message);

  // 8. Hospital Admin 1 requesting another hospital's departments -> 403 Forbidden
  const foreignDeptRes = await api("/api/departments?hospital_id=2", { method: "GET" }, hospAdmin1Token);
  console.log("8. Hospital Admin 1 requesting foreign departments blocked (403):", foreignDeptRes.status === 403 ? "PASS" : "FAIL");

  // 9. Hospital Admin 1 attempting to create user for Hospital 2
  // Server must override or ignore client-supplied hospital_id and assign user to Hospital 1
  const spoofUserRes = await api("/api/users", {
    method: "POST",
    body: JSON.stringify({
      full_name: "Dr. Spoofed Hospital",
      email: `spoofed_${Date.now()}@test.com`,
      password: "TestPassword123!",
      role: "doctor",
      hospital_id: 2, // Attempting to inject Hospital 2!
    }),
  }, hospAdmin1Token);

  const createdUserId = spoofUserRes.data?.data?.id;
  let userBelongsToHosp1 = false;
  if (createdUserId) {
    const [uRows] = await pool.execute("SELECT hospital_id FROM users WHERE id = ?", [createdUserId]);
    userBelongsToHosp1 = uRows[0]?.hospital_id === 1;
    await pool.execute("DELETE FROM users WHERE id = ?", [createdUserId]);
  }
  console.log("9. IDOR protection: Injected hospital_id forced to authenticated hospital:", userBelongsToHosp1 ? "PASS" : "FAIL");

  // 10. Hospital Admin 1 viewing pending approvals only gets Hospital 1 records
  const pendingApprovalsRes = await api("/api/users/pending-approvals", { method: "GET" }, hospAdmin1Token);
  const allHosp1 = pendingApprovalsRes.data?.data?.every(u => u.hospital_id === 1);
  console.log("10. Pending approvals scoped to authenticated hospital:", (pendingApprovalsRes.status === 200 && allHosp1) ? "PASS" : "FAIL");

  console.log("=== All Step 5 Integration Tests Finished ===");
  process.exit(0);
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
