const assert = require("assert");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";

async function runTests() {
  console.log("=================================================");
  console.log(" RUNNING TESTS: Lesson 4.1 & Lesson 4.2");
  console.log(" (Master Department Assignment & Hospital Departments)");
  console.log("=================================================\n");

  const connection = await pool.getConnection();

  try {
    // 1. Fetch Super Admin and an active Hospital
    const [superAdmins] = await connection.execute(
      `SELECT u.id, u.email, r.name AS role, u.token_version
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE r.name = 'super_admin' AND u.status = 'active'
       LIMIT 1`
    );
    assert(superAdmins.length > 0, "Super admin account must exist");
    const superAdmin = superAdmins[0];
    const superAdminToken = jwt.sign(
      { sub: superAdmin.id, role: superAdmin.role, tokenVersion: superAdmin.token_version },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    const [hospitals] = await connection.execute(
      "SELECT id, name FROM hospitals WHERE status = 'active' ORDER BY id ASC LIMIT 2"
    );
    assert(hospitals.length >= 1, "At least one active hospital must exist");
    const hospital1 = hospitals[0];
    const hospital2 = hospitals[1] || null;

    // Fetch real Hospital Admin for Hospital 1
    const [hAdmins] = await connection.execute(
      `SELECT u.id, u.email, r.name AS role, u.hospital_id, u.token_version
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE r.name = 'hospital_admin' AND u.hospital_id = ? AND u.status = 'active'
       LIMIT 1`,
      [hospital1.id]
    );
    assert(hAdmins.length > 0, "Hospital admin for hospital 1 must exist");
    const hospitalAdmin1 = hAdmins[0];

    const hospitalAdmin1Token = jwt.sign(
      { sub: hospitalAdmin1.id, role: hospitalAdmin1.role, hospitalId: hospitalAdmin1.hospital_id, tokenVersion: hospitalAdmin1.token_version },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // 2. Fetch Master Departments
    const [masterDepts] = await connection.execute(
      "SELECT id, name, code, status FROM master_departments WHERE status = 'active' ORDER BY id ASC"
    );
    assert(masterDepts.length >= 2, "Master departments must be seeded");
    const mDept1 = masterDepts[0];
    const mDept2 = masterDepts[1];

    console.log(`[SETUP] Hospital 1: #${hospital1.id} (${hospital1.name})`);
    console.log(`[SETUP] Master Dept 1: #${mDept1.id} (${mDept1.name} [${mDept1.code}])`);
    console.log(`[SETUP] Master Dept 2: #${mDept2.id} (${mDept2.name} [${mDept2.code}])`);

    // Clean up any test assignments for mDept1 and mDept2 on Hospital 1 if exist
    await connection.execute(
      `DELETE a FROM appointments a
       JOIN departments d ON d.id = a.department_id
       WHERE d.hospital_id = ? AND (d.master_department_id = ? OR d.master_department_id = ?)`,
      [hospital1.id, mDept1.id, mDept2.id]
    );
    await connection.execute(
      `UPDATE users u
       JOIN departments d ON d.id = u.department_id
       SET u.department_id = NULL
       WHERE d.hospital_id = ? AND (d.master_department_id = ? OR d.master_department_id = ?)`,
      [hospital1.id, mDept1.id, mDept2.id]
    );
    await connection.execute(
      "DELETE FROM departments WHERE hospital_id = ? AND (master_department_id = ? OR master_department_id = ?)",
      [hospital1.id, mDept1.id, mDept2.id]
    );

    // --- TEST 1: Super Admin assigns master department 1 to hospital 1 ---
    console.log("\n[TEST 1] Super Admin assigns master department 1 to hospital 1");
    const BASE_URL = "http://localhost:5000/api";

    let res = await fetch(`${BASE_URL}/departments/assign-master`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        hospital_id: hospital1.id,
        master_department_id: mDept1.id,
        custom_description: "Hospital 1 specialized cardiac wing",
      }),
    });
    let data = await res.json();
    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(data)}`);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.name, mDept1.name);
    assert.strictEqual(data.data.master_department_id, mDept1.id);
    const assignedDept1Id = data.data.id;
    console.log("  ✓ Successfully assigned master department 1. Department ID:", assignedDept1Id);

    // --- TEST 2: Duplicate Assignment Prevention ---
    console.log("\n[TEST 2] Duplicate assignment of master department 1 to hospital 1 must be rejected (409 Conflict)");
    res = await fetch(`${BASE_URL}/departments/assign-master`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        hospital_id: hospital1.id,
        master_department_id: mDept1.id,
      }),
    });
    data = await res.json();
    assert.strictEqual(res.status, 409, `Expected 409 Conflict, got ${res.status}: ${JSON.stringify(data)}`);
    assert.strictEqual(data.success, false);
    assert(data.message.includes("already assigned"), "Error message should mention already assigned");
    console.log("  ✓ Duplicate assignment correctly rejected with 409 Conflict:", data.message);

    // --- TEST 3: Hospital Admin assigns master department 2 to their own hospital ---
    console.log("\n[TEST 3] Hospital Admin assigns master department 2 to their own hospital");
    res = await fetch(`${BASE_URL}/departments/assign-master`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${hospitalAdmin1Token}`,
      },
      body: JSON.stringify({
        master_department_id: mDept2.id,
        custom_description: "Neurology ICU and neuro-diagnostics",
      }),
    });
    data = await res.json();
    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(data)}`);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.name, mDept2.name);
    assert.strictEqual(data.data.master_department_id, mDept2.id);
    console.log("  ✓ Hospital Admin successfully assigned master department 2.");

    // --- TEST 4: Cross-hospital assignment prevention ---
    if (hospital2) {
      console.log("\n[TEST 4] Hospital Admin 1 attempts to assign to Hospital 2 (Cross-hospital forbidden)");
      // Even if hospital admin puts hospital_id = hospital2.id in body, the server forces their assigned hospital
      // If we test accessing another hospital's department:
      res = await fetch(`${BASE_URL}/departments?hospital_id=${hospital2.id}`, {
        headers: { Authorization: `Bearer ${hospitalAdmin1Token}` },
      });
      data = await res.json();
      assert.strictEqual(res.status, 403, `Expected 403 Forbidden for cross-hospital, got ${res.status}`);
      console.log("  ✓ Cross-hospital access strictly blocked with 403 Forbidden.");
    }

    // --- TEST 5: Department listing returns master department linkage ---
    console.log("\n[TEST 5] Department listing returns linked master department code and name");
    res = await fetch(`${BASE_URL}/departments?hospital_id=${hospital1.id}`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    data = await res.json();
    assert.strictEqual(res.status, 200);
    assert(data.data.length >= 2, "Hospital should have at least 2 assigned departments");
    const dept1Record = data.data.find((d) => d.id === assignedDept1Id);
    assert(dept1Record, "Department 1 record must be present");
    assert.strictEqual(dept1Record.master_department_code, mDept1.code);
    assert.strictEqual(dept1Record.master_department_name, mDept1.name);
    console.log("  ✓ Department listing correctly includes master_department_code:", dept1Record.master_department_code);

    // --- TEST 6: Master departments listing with hospital_id annotation ---
    console.log("\n[TEST 6] Master departments listing annotates is_assigned for Hospital 1");
    res = await fetch(`${BASE_URL}/master-departments?hospital_id=${hospital1.id}`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    data = await res.json();
    assert.strictEqual(res.status, 200);
    const mDept1Annotated = data.data.find((m) => m.id === mDept1.id);
    assert.strictEqual(mDept1Annotated.is_assigned, true, "Master Dept 1 must be marked as is_assigned: true");
    console.log("  ✓ Master Dept 1 is_assigned correctly returned as true.");

    // --- TEST 7: Hospital Department Status Toggle (Lesson 4.2) ---
    console.log("\n[TEST 7] Update department status to inactive and back to active");
    res = await fetch(`${BASE_URL}/departments/${assignedDept1Id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${hospitalAdmin1Token}`,
      },
      body: JSON.stringify({ status: "inactive" }),
    });
    data = await res.json();
    assert.strictEqual(res.status, 200);

    const [updatedRow] = await connection.execute("SELECT status FROM departments WHERE id = ?", [assignedDept1Id]);
    assert.strictEqual(updatedRow[0].status, "inactive");
    console.log("  ✓ Department successfully transitioned to inactive.");

    // Restore to active
    await fetch(`${BASE_URL}/departments/${assignedDept1Id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${hospitalAdmin1Token}`,
      },
      body: JSON.stringify({ status: "active" }),
    });
    console.log("  ✓ Department restored to active.");

    console.log("\n=================================================");
    console.log(" ALL TESTS PASSED FOR LESSONS 4.1 & 4.2! ✅");
    console.log("=================================================");
  } finally {
    connection.release();
    await pool.end();
  }
}

runTests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
