require("dotenv").config();
const jwt = require("jsonwebtoken");
const pool = require("../db");

async function main() {
  console.log("=== Running Step 4 Integration Tests (Lessons 3.5 & 3.6 — Departments & Designations) ===");

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

  // --- PART 1: DEPARTMENTS (Lesson 3.5) ---

  // 1. List departments for Hospital 1
  const listDeptRes = await api("/api/departments", { method: "GET" }, hospAdmin1Token);
  console.log("1. List Departments for Hospital Admin 1:", listDeptRes.status === 200 && listDeptRes.data.success ? "PASS" : "FAIL", `(found ${listDeptRes.data.count})`);

  // 2. Create department in Hospital 1
  const testDeptName = `Cardiology_${Date.now()}`;
  const createDeptRes = await api("/api/departments", {
    method: "POST",
    body: JSON.stringify({
      name: testDeptName,
      description: "Heart and cardiovascular care",
    }),
  }, hospAdmin1Token);
  console.log("2. Create Department in Hospital 1:", createDeptRes.status === 201 && createDeptRes.data.success ? "PASS" : "FAIL");
  const deptId = createDeptRes.data?.data?.id;

  // 3. Duplicate department in same hospital rejected -> 409
  const dupDeptRes = await api("/api/departments", {
    method: "POST",
    body: JSON.stringify({
      name: testDeptName,
      description: "Duplicate test",
    }),
  }, hospAdmin1Token);
  console.log("3. Duplicate department in same hospital rejected (409):", dupDeptRes.status === 409 ? "PASS" : "FAIL");

  // 4. Hospital Admin 2 attempts to edit Hospital 1's department -> 404 or 403 (unauthorized scope)
  const unauthDeptEditRes = await api(`/api/departments/${deptId}`, {
    method: "PATCH",
    body: JSON.stringify({ name: "Hacked Dept" }),
  }, hospAdmin2Token);
  console.log("4. Cross-hospital department edit blocked:", (unauthDeptEditRes.status === 403 || unauthDeptEditRes.status === 404) ? "PASS" : "FAIL");

  // --- PART 2: DESIGNATIONS (Lesson 3.6) ---

  // 5. Super Admin lists all designations
  const listDesigRes = await api("/api/designations", { method: "GET" }, superAdminToken);
  console.log("5. List Designations (Super Admin):", listDesigRes.status === 200 && listDesigRes.data.success ? "PASS" : "FAIL", `(found ${listDesigRes.data.count})`);

  // 6. Super Admin creates Global Designation
  const globalDesigName = `Chief Specialist_${Date.now()}`;
  const createGlobalDesigRes = await api("/api/designations", {
    method: "POST",
    body: JSON.stringify({
      name: globalDesigName,
      description: "System-wide senior medical specialist",
      hospital_id: null,
    }),
  }, superAdminToken);
  console.log("6. Create Global Designation (Super Admin):", createGlobalDesigRes.status === 201 && createGlobalDesigRes.data.success ? "PASS" : "FAIL");
  const globalDesigId = createGlobalDesigRes.data?.data?.id;

  // 7. Hospital Admin 1 creates Hospital-Specific Designation
  const hospDesigName = `Hospital 1 Fellow_${Date.now()}`;
  const createHospDesigRes = await api("/api/designations", {
    method: "POST",
    body: JSON.stringify({
      name: hospDesigName,
      description: "Hospital 1 internal trainee",
    }),
  }, hospAdmin1Token);
  console.log("7. Create Hospital-Specific Designation (Hosp Admin 1):", createHospDesigRes.status === 201 && createHospDesigRes.data.success ? "PASS" : "FAIL");
  const hospDesigId = createHospDesigRes.data?.data?.id;

  // 8. Hospital Admin 1 tries to edit Global Designation -> 403 Forbidden
  const editGlobalByHospAdminRes = await api(`/api/designations/${globalDesigId}`, {
    method: "PATCH",
    body: JSON.stringify({ name: "Hijacked Global Designation" }),
  }, hospAdmin1Token);
  console.log("8. Hospital Admin blocked from editing Global Designation (403):", editGlobalByHospAdminRes.status === 403 ? "PASS" : "FAIL");

  // 9. Hospital Admin 2 tries to edit Hospital 1 Designation -> 403 Forbidden
  const crossHospDesigRes = await api(`/api/designations/${hospDesigId}`, {
    method: "PATCH",
    body: JSON.stringify({ name: "Cross Hospital Hijack" }),
  }, hospAdmin2Token);
  console.log("9. Hospital Admin 2 blocked from editing Hospital 1 Designation (403):", crossHospDesigRes.status === 403 ? "PASS" : "FAIL");

  // 10. Hospital Admin 1 updates their own Designation -> 200 OK
  const updateOwnDesigRes = await api(`/api/designations/${hospDesigId}`, {
    method: "PATCH",
    body: JSON.stringify({
      description: "Updated fellow description",
      status: "active",
    }),
  }, hospAdmin1Token);
  console.log("10. Hospital Admin 1 updates own Designation (200):", updateOwnDesigRes.status === 200 && updateOwnDesigRes.data.success ? "PASS" : "FAIL");

  // Clean up
  if (deptId) await pool.execute("DELETE FROM departments WHERE id = ?", [deptId]);
  if (globalDesigId) await pool.execute("DELETE FROM designations WHERE id = ?", [globalDesigId]);
  if (hospDesigId) await pool.execute("DELETE FROM designations WHERE id = ?", [hospDesigId]);
  console.log("Cleaned up test department and designation records.");

  console.log("=== All Step 4 Integration Tests Finished ===");
  process.exit(0);
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
