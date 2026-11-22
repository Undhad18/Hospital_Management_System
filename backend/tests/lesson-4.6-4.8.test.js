const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const assert = require("assert");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
const BASE_URL = "http://localhost:5000/api";

async function runTests() {
  console.log("=================================================");
  console.log(" RUNNING TESTS: Lessons 4.6, 4.7 & 4.8");
  console.log(" (Staff Creation, Designations: Receptionist, Nurse,");
  console.log("  Pharmacist, Lab Staff, Accountant, Department & Permissions)");
  console.log("=================================================\n");

  const connection = await pool.getConnection();

  try {
    // 1. Fetch Super Admin, Hospital Admin, and two active Hospitals
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
    assert(hospitals.length >= 2, "At least two active hospitals needed for isolation tests");
    const hospital1 = hospitals[0];
    const hospital2 = hospitals[1];

    // Hospital Admin for Hospital 1
    const [hAdmins1] = await connection.execute(
      `SELECT u.id, u.email, r.name AS role, u.hospital_id, u.token_version
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE r.name = 'hospital_admin' AND u.hospital_id = ? AND u.status = 'active'
       LIMIT 1`,
      [hospital1.id]
    );
    assert(hAdmins1.length > 0, "Hospital admin 1 must exist");
    const hospitalAdmin1 = hAdmins1[0];
    const hospitalAdmin1Token = jwt.sign(
      {
        sub: hospitalAdmin1.id,
        role: hospitalAdmin1.role,
        hospitalId: hospitalAdmin1.hospital_id,
        tokenVersion: hospitalAdmin1.token_version,
      },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Active departments for Hospital 1 and Hospital 2
    let [deptRows1] = await connection.execute(
      "SELECT id, name FROM departments WHERE hospital_id = ? AND status = 'active' LIMIT 1",
      [hospital1.id]
    );
    const dept1 = deptRows1[0];

    let [deptRows2] = await connection.execute(
      "SELECT id, name FROM departments WHERE hospital_id = ? AND status = 'active' LIMIT 1",
      [hospital2.id]
    );
    const dept2 = deptRows2[0];

    // Verify presence of designations (Receptionist, Nurse, Pharmacist, Lab Staff, Accountant)
    const designationsToTest = ["Receptionist", "Nurse", "Pharmacist", "Lab Staff", "Accountant"];
    const [allDesigs] = await connection.execute(
      "SELECT id, name FROM designations WHERE status = 'active'"
    );

    console.log(`[SETUP] Hospital 1: #${hospital1.id} (${hospital1.name})`);
    console.log(`[SETUP] Dept 1 (Hospital 1): #${dept1.id} (${dept1.name})`);
    console.log(`[SETUP] Hospital 2: #${hospital2.id} (${hospital2.name})`);
    console.log(`[SETUP] Dept 2 (Hospital 2): #${dept2.id} (${dept2.name})`);

    for (const dName of designationsToTest) {
      const match = allDesigs.find((d) => d.name.toLowerCase() === dName.toLowerCase());
      assert(match, `Designation '${dName}' must exist in designations pool`);
      console.log(`[SETUP] Verified designation '${dName}': #${match.id}`);
    }

    const receptionistDesig = allDesigs.find((d) => d.name.toLowerCase() === "receptionist");
    const pharmacistDesig = allDesigs.find((d) => d.name.toLowerCase() === "pharmacist");
    const nurseDesig = allDesigs.find((d) => d.name.toLowerCase() === "nurse");

    const testStaffEmail1 = `staff.receptionist_${Date.now()}@example.com`;
    const testStaffEmail2 = `staff.pharmacist_${Date.now()}@example.com`;
    const testStaffEmail3 = `staff.crossdept_${Date.now()}@example.com`;

    // -----------------------------------------------------------------
    // TEST 1: Cross-Hospital Department Assignment Rejection (Lesson 4.8)
    // -----------------------------------------------------------------
    console.log("\n[TEST 1] Validation: Reject staff assignment to department of another hospital");
    let res = await fetch(`${BASE_URL}/staff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${hospitalAdmin1Token}`,
      },
      body: JSON.stringify({
        full_name: "Staff Cross Dept",
        email: testStaffEmail3,
        password: "StaffPassword123!",
        department_id: dept2.id, // dept2 belongs to Hospital 2!
        designation_id: receptionistDesig.id,
      }),
    });
    let data = await res.json();
    assert.strictEqual(res.status, 400, "Should return 400 Bad Request for cross-hospital department assignment");
    assert.strictEqual(data.success, false);
    console.log("  ✓ Cross-hospital department assignment strictly rejected with 400");

    // -----------------------------------------------------------------
    // TEST 2: Create Receptionist Staff with Default Designation Permissions (Lessons 4.6 & 4.7)
    // -----------------------------------------------------------------
    console.log("\n[TEST 2] Create Receptionist staff; verify automatic permission template generation");
    res = await fetch(`${BASE_URL}/staff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${hospitalAdmin1Token}`,
      },
      body: JSON.stringify({
        full_name: "Sarah Jenkins",
        email: testStaffEmail1,
        password: "TempStaffPassword123!",
        phone: "+91 9876500001",
        department_id: dept1.id,
        designation_id: receptionistDesig.id,
        employee_id: "EMP-H1-REC01",
        shift_timing: "Morning (08:00 - 16:00)",
        temporary_password: true,
      }),
    });
    data = await res.json();
    assert.strictEqual(res.status, 201, "Expected 201 Created");
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.status, "pending", "Staff account must be initialized with status 'pending'");
    assert.strictEqual(data.data.employee_id, "EMP-H1-REC01");
    assert.strictEqual(data.data.shift_timing, "Morning (08:00 - 16:00)");
    assert(Array.isArray(data.data.permissions), "Permissions must be an array");
    assert(data.data.permissions.includes("patient_registration"), "Receptionist default permission must include patient_registration");
    assert(data.data.permissions.includes("appointment_booking"), "Receptionist default permission must include appointment_booking");

    const createdStaffId1 = data.data.id;
    console.log(`  ✓ Created Staff #${createdStaffId1} (${data.data.full_name}) with status 'pending'`);
    console.log(`  ✓ Default permissions automatically assigned: ${data.data.permissions.join(", ")}`);

    // Verify staff_profiles table in DB
    const [spRows] = await connection.execute(
      "SELECT * FROM staff_profiles WHERE user_id = ?",
      [createdStaffId1]
    );
    assert.strictEqual(spRows.length, 1, "staff_profiles record must exist");
    assert.strictEqual(spRows[0].employee_id, "EMP-H1-REC01");
    console.log("  ✓ Database staff_profiles record verified");

    // -----------------------------------------------------------------
    // TEST 3: Create Pharmacist Staff with Custom Granular Permissions (Lessons 4.7 & 4.8)
    // -----------------------------------------------------------------
    console.log("\n[TEST 3] Create Pharmacist staff with custom explicit permissions");
    const customPerms = [
      "prescription_dispense",
      "pharmacy_inventory",
      "stock_alerts",
      "narcotics_vault_access",
    ];
    res = await fetch(`${BASE_URL}/staff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${hospitalAdmin1Token}`,
      },
      body: JSON.stringify({
        full_name: "Marcus Aurel",
        email: testStaffEmail2,
        password: "StaffPassword123!",
        phone: "+91 9876500002",
        department_id: dept1.id,
        designation_id: pharmacistDesig.id,
        employee_id: "EMP-H1-PHARM02",
        shift_timing: "Rotating",
        permissions: customPerms,
      }),
    });
    data = await res.json();
    assert.strictEqual(res.status, 201);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.permissions.length, 4);
    assert(data.data.permissions.includes("narcotics_vault_access"));

    const createdStaffId2 = data.data.id;
    console.log(`  ✓ Created Staff #${createdStaffId2} (Pharmacist) with custom permission array`);

    // -----------------------------------------------------------------
    // TEST 4: Fetch Single Staff via GET /api/staff/:id
    // -----------------------------------------------------------------
    console.log("\n[TEST 4] Retrieve single staff details via GET /api/staff/:id");
    res = await fetch(`${BASE_URL}/staff/${createdStaffId1}`, {
      headers: { Authorization: `Bearer ${hospitalAdmin1Token}` },
    });
    data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.id, createdStaffId1);
    assert.strictEqual(data.data.designation_name, "Receptionist");
    assert.strictEqual(data.data.department_name, dept1.name);
    assert(Array.isArray(data.data.permissions));
    console.log("  ✓ Staff details returned with designation and department names and parsed permissions");

    // -----------------------------------------------------------------
    // TEST 5: Hospital Isolation: Admin of Hospital 2 cannot access staff of Hospital 1
    // -----------------------------------------------------------------
    console.log("\n[TEST 5] Hospital Isolation: Admin of Hospital 2 cannot access staff in Hospital 1");
    const [hAdmins2] = await connection.execute(
      `SELECT u.id, u.email, r.name AS role, u.hospital_id, u.token_version
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE r.name = 'hospital_admin' AND u.hospital_id = ? AND u.status = 'active'
       LIMIT 1`,
      [hospital2.id]
    );
    if (hAdmins2.length > 0) {
      const hospitalAdmin2Token = jwt.sign(
        {
          sub: hAdmins2[0].id,
          role: hAdmins2[0].role,
          hospitalId: hAdmins2[0].hospital_id,
          tokenVersion: hAdmins2[0].token_version,
        },
        JWT_SECRET,
        { expiresIn: "1h" }
      );
      res = await fetch(`${BASE_URL}/staff/${createdStaffId1}`, {
        headers: { Authorization: `Bearer ${hospitalAdmin2Token}` },
      });
      assert.strictEqual(res.status, 403, "Should return 403 Forbidden for cross-hospital staff access");
      console.log("  ✓ Cross-hospital access strictly blocked with 403 Forbidden");
    }

    // -----------------------------------------------------------------
    // TEST 6: Administrative Status Approval and Permission Updates via PATCH /api/staff/:id
    // -----------------------------------------------------------------
    console.log("\n[TEST 6] Hospital Admin approves staff account and updates permissions");
    const updatedPerms = [
      "patient_registration",
      "appointment_booking",
      "queue_management",
      "visitor_pass",
      "triage_queue_coordinator",
    ];
    res = await fetch(`${BASE_URL}/staff/${createdStaffId1}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${hospitalAdmin1Token}`,
      },
      body: JSON.stringify({
        status: "active",
        shift_timing: "Evening (16:00 - 00:00)",
        permissions: updatedPerms,
      }),
    });
    data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.status, "active");
    assert.strictEqual(data.data.shift_timing, "Evening (16:00 - 00:00)");
    assert(data.data.permissions.includes("triage_queue_coordinator"));
    console.log("  ✓ Staff account transitioned to 'active' with updated shift timing and permissions");

    // -----------------------------------------------------------------
    // TEST 7: Staff Self-Update: Cannot self-approve or elevate permissions
    // -----------------------------------------------------------------
    console.log("\n[TEST 7] Staff Self-Update: Cannot elevate permissions or self-modify status");
    const [staffUserRow] = await connection.execute(
      "SELECT id, role_id, hospital_id, token_version FROM users WHERE id = ?",
      [createdStaffId1]
    );
    const staffToken = jwt.sign(
      {
        sub: staffUserRow[0].id,
        role: "staff",
        hospitalId: staffUserRow[0].hospital_id,
        tokenVersion: staffUserRow[0].token_version,
      },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Staff attempts to grant themselves super administrative permission
    res = await fetch(`${BASE_URL}/staff/${createdStaffId1}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`,
      },
      body: JSON.stringify({
        permissions: ["all_access_super_grant"],
      }),
    });
    data = await res.json();
    assert.strictEqual(res.status, 403, "Staff self-elevation of permissions must be rejected with 403");
    console.log("  ✓ Permission self-elevation strictly rejected with 403");

    // Staff updates own phone and shift preference
    res = await fetch(`${BASE_URL}/staff/${createdStaffId1}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`,
      },
      body: JSON.stringify({
        phone: "+91 9999988888",
        shift_timing: "Morning Preference",
      }),
    });
    data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.phone, "+91 9999988888");
    assert.strictEqual(data.data.shift_timing, "Morning Preference");
    console.log("  ✓ Staff successfully updated own contact phone and shift preference");

    console.log("\n=================================================");
    console.log(" ALL TESTS FOR LESSONS 4.6 - 4.8 PASSED (100%)");
    console.log("=================================================\n");
  } catch (err) {
    console.error("Test execution failed:", err);
    process.exit(1);
  } finally {
    if (connection) connection.release();
  }
}

runTests().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
