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
  console.log(" RUNNING TESTS: Lessons 4.3, 4.4 & 4.5");
  console.log(" (Doctor Account, Department & Designation Assignment,");
  console.log("  Experience, Education, License & Consultation Fees)");
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
    assert(hospitals.length >= 2, "At least two active hospitals are needed for multi-tenant isolation tests");
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

    // Fetch active department in hospital 1
    let [deptRows1] = await connection.execute(
      "SELECT id, name FROM departments WHERE hospital_id = ? AND status = 'active' LIMIT 1",
      [hospital1.id]
    );
    if (!deptRows1.length) {
      // create a quick department for test
      const [ins] = await connection.execute(
        "INSERT INTO departments (hospital_id, name, status) VALUES (?, 'Internal Medicine Test', 'active')",
        [hospital1.id]
      );
      deptRows1 = [{ id: ins.insertId, name: "Internal Medicine Test" }];
    }
    const dept1 = deptRows1[0];

    // Fetch active department in hospital 2
    let [deptRows2] = await connection.execute(
      "SELECT id, name FROM departments WHERE hospital_id = ? AND status = 'active' LIMIT 1",
      [hospital2.id]
    );
    if (!deptRows2.length) {
      const [ins] = await connection.execute(
        "INSERT INTO departments (hospital_id, name, status) VALUES (?, 'Neurology Unit Test', 'active')",
        [hospital2.id]
      );
      deptRows2 = [{ id: ins.insertId, name: "Neurology Unit Test" }];
    }
    const dept2 = deptRows2[0];

    // Fetch active designation
    const [desigRows] = await connection.execute(
      "SELECT id, name FROM designations WHERE status = 'active' AND (hospital_id IS NULL OR hospital_id = ?) LIMIT 1",
      [hospital1.id]
    );
    assert(desigRows.length > 0, "Active designation must exist");
    const designation1 = desigRows[0];

    console.log(`[SETUP] Hospital 1: #${hospital1.id} (${hospital1.name})`);
    console.log(`[SETUP] Dept 1 (Hospital 1): #${dept1.id} (${dept1.name})`);
    console.log(`[SETUP] Hospital 2: #${hospital2.id} (${hospital2.name})`);
    console.log(`[SETUP] Dept 2 (Hospital 2): #${dept2.id} (${dept2.name})`);
    console.log(`[SETUP] Designation: #${designation1.id} (${designation1.name})`);

    // Clean up any old test doctor emails
    const testDoctorEmail1 = `dr.step3.test_${Date.now()}@example.com`;
    const testDoctorEmail2 = `dr.step3.negfee_${Date.now()}@example.com`;

    // -----------------------------------------------------------------
    // TEST 1: Lesson 4.5 Validation - Negative Consultation Fee should fail
    // -----------------------------------------------------------------
    console.log("\n[TEST 1] Validation: Reject creation when consultation_fee is negative");
    let res = await fetch(`${BASE_URL}/doctors`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${hospitalAdmin1Token}`,
      },
      body: JSON.stringify({
        full_name: "Dr. Gregory House",
        email: testDoctorEmail2,
        password: "Password123456!",
        department_id: dept1.id,
        designation_id: designation1.id,
        consultation_fee: -150.0,
      }),
    });
    let data = await res.json();
    assert.strictEqual(res.status, 400, "Should return 400 for negative fee");
    assert.strictEqual(data.success, false);
    console.log("  ✓ Correctly rejected negative fee with 400 Bad Request");

    // -----------------------------------------------------------------
    // TEST 2: Lesson 4.4 Validation - Cross-Hospital Department Assignment
    // -----------------------------------------------------------------
    console.log("\n[TEST 2] Validation: Reject department that does not belong to doctor's hospital");
    res = await fetch(`${BASE_URL}/doctors`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${hospitalAdmin1Token}`,
      },
      body: JSON.stringify({
        full_name: "Dr. Cross Dept",
        email: testDoctorEmail2,
        password: "Password123456!",
        department_id: dept2.id, // dept2 belongs to Hospital 2!
        designation_id: designation1.id,
      }),
    });
    data = await res.json();
    assert.strictEqual(res.status, 400, "Should return 400 when assigning department from another hospital");
    assert.strictEqual(data.success, false);
    console.log("  ✓ Cross-hospital department assignment strictly rejected");

    // -----------------------------------------------------------------
    // TEST 3: Lesson 4.3 & 4.5 - Create Doctor with full clinical profile
    // -----------------------------------------------------------------
    console.log("\n[TEST 3] Create Doctor with full clinical profile & pending status");
    res = await fetch(`${BASE_URL}/doctors`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${hospitalAdmin1Token}`,
      },
      body: JSON.stringify({
        full_name: "Dr. Eleanor Vance",
        email: testDoctorEmail1,
        password: "TempDoctorPass1234!",
        phone: "+91 9876543210",
        department_id: dept1.id,
        designation_id: designation1.id,
        experience_years: 12,
        qualifications: "MBBS, MD (Cardiology), DM",
        specialization: "Interventional Cardiology",
        license_number: "MED-IN-2024-9871",
        license_expiry_date: "2030-12-31",
        consultation_fee: 750.0,
        bio: "Senior interventional cardiologist with over a decade of complex coronary intervention experience.",
        temporary_password: true,
      }),
    });
    data = await res.json();
    assert.strictEqual(res.status, 201, "Expected 201 Created");
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.status, "pending", "Doctor account must be initialized with status 'pending'");
    assert.strictEqual(data.data.consultation_fee, 750.0);
    assert.strictEqual(data.data.experience_years, 12);
    assert.strictEqual(data.data.must_change_password, true);

    const createdDoctorId = data.data.id;
    console.log(`  ✓ Created Doctor #${createdDoctorId} with pending status & fee ₹750`);

    // Verify database record in doctor_profiles table
    const [profRows] = await connection.execute(
      "SELECT * FROM doctor_profiles WHERE user_id = ?",
      [createdDoctorId]
    );
    assert.strictEqual(profRows.length, 1, "doctor_profiles record must exist in database");
    assert.strictEqual(profRows[0].experience_years, 12);
    assert.strictEqual(profRows[0].specialization, "Interventional Cardiology");
    assert.strictEqual(profRows[0].license_number, "MED-IN-2024-9871");
    assert.strictEqual(Number(profRows[0].consultation_fee), 750.0);
    console.log("  ✓ Database doctor_profiles record verified with all credentials");

    // -----------------------------------------------------------------
    // TEST 4: Fetch single doctor profile via GET /api/doctors/:id
    // -----------------------------------------------------------------
    console.log("\n[TEST 4] Retrieve single doctor via GET /api/doctors/:id");
    res = await fetch(`${BASE_URL}/doctors/${createdDoctorId}`, {
      headers: { Authorization: `Bearer ${hospitalAdmin1Token}` },
    });
    data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.id, createdDoctorId);
    assert.strictEqual(data.data.department_name, dept1.name);
    assert.strictEqual(data.data.designation_name, designation1.name);
    assert.strictEqual(data.data.license_number, "MED-IN-2024-9871");
    console.log("  ✓ Doctor joined profile retrieved with department & designation names");

    // -----------------------------------------------------------------
    // TEST 5: Hospital Isolation check - Admin from another hospital cannot access this doctor
    // -----------------------------------------------------------------
    console.log("\n[TEST 5] Hospital Isolation: Admin of Hospital 2 cannot access doctor in Hospital 1");
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
      res = await fetch(`${BASE_URL}/doctors/${createdDoctorId}`, {
        headers: { Authorization: `Bearer ${hospitalAdmin2Token}` },
      });
      assert.strictEqual(res.status, 403, "Should return 403 Forbidden for cross-hospital doctor access");
      console.log("  ✓ Cross-hospital access strictly blocked with 403 Forbidden");
    }

    // -----------------------------------------------------------------
    // TEST 6: Administrative Approval & Fee / Profile Update via PATCH /api/doctors/:id
    // -----------------------------------------------------------------
    console.log("\n[TEST 6] Hospital Admin approves doctor account and updates consultation fee");
    res = await fetch(`${BASE_URL}/doctors/${createdDoctorId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${hospitalAdmin1Token}`,
      },
      body: JSON.stringify({
        status: "active",
        consultation_fee: 900.0,
        experience_years: 13,
      }),
    });
    data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.status, "active");
    assert.strictEqual(Number(data.data.consultation_fee), 900.0);
    assert.strictEqual(data.data.experience_years, 13);
    console.log("  ✓ Doctor approved to 'active' with updated fee ₹900 and experience 13 yrs");

    // -----------------------------------------------------------------
    // TEST 7: Doctor Self-Update permissions & Self-Approval Prevention
    // -----------------------------------------------------------------
    console.log("\n[TEST 7] Doctor Self-Update: Can edit bio/phone/fee, forbidden from changing status");
    // Create doctor token
    const [docUserRow] = await connection.execute(
      "SELECT id, role_id, hospital_id, token_version FROM users WHERE id = ?",
      [createdDoctorId]
    );
    const doctorToken = jwt.sign(
      {
        sub: docUserRow[0].id,
        role: "doctor",
        hospitalId: docUserRow[0].hospital_id,
        tokenVersion: docUserRow[0].token_version,
      },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Attempt self-modification of status (attempting to self-reinstate if suspended or self-promote)
    res = await fetch(`${BASE_URL}/doctors/${createdDoctorId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${doctorToken}`,
      },
      body: JSON.stringify({
        status: "suspended", // Doctor attempts status modification
      }),
    });
    data = await res.json();
    assert.strictEqual(res.status, 403, "Doctor cannot modify account status");
    console.log("  ✓ Doctor self-status change correctly forbidden with 403");

    // Doctor updates own bio & phone
    res = await fetch(`${BASE_URL}/doctors/${createdDoctorId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${doctorToken}`,
      },
      body: JSON.stringify({
        phone: "+91 9123456789",
        bio: "Updated clinical biography highlighting research in arrhythmia.",
        consultation_fee: 950.0,
      }),
    });
    data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.phone, "+91 9123456789");
    assert.strictEqual(Number(data.data.consultation_fee), 950.0);
    console.log("  ✓ Doctor successfully updated own phone, bio, and consultation fee");

    console.log("\n=================================================");
    console.log(" ALL TESTS FOR LESSONS 4.3 - 4.5 PASSED (100%)");
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
