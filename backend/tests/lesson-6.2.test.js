const assert = require("assert");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_jwt_key_at_least_32_characters_long";
const API_BASE = "http://localhost:5000/api";

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

async function put(endpoint, body, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body: data };
}

async function runTests() {
  console.log("=== Running Lesson 6.2 Automated Test Suite ===");
  const stamp = Date.now();

  // 1. Setup Test Fixtures: Hospital, Department, Doctor, Patient
  const [hospRes] = await pool.execute(
    `INSERT INTO hospitals (name, code, email, phone, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [`L62 Hospital ${stamp}`, `L62-${stamp}`, `hosp62_${stamp}@test.com`, "+91-9876500010"]
  );
  const hospitalId = hospRes.insertId;

  const [deptRes] = await pool.execute(
    `INSERT INTO departments (hospital_id, name, description, status)
     VALUES (?, 'Orthopedics', 'Bone and joint surgery', 'active')`,
    [hospitalId]
  );
  const departmentId = deptRes.insertId;

  const [docRoleRows] = await pool.execute("SELECT id FROM roles WHERE name = 'doctor' LIMIT 1");
  const docRoleId = docRoleRows[0].id;
  const [patRoleRows] = await pool.execute("SELECT id FROM roles WHERE name = 'patient' LIMIT 1");
  const patRoleId = patRoleRows[0].id;

  const passHash = await bcrypt.hash("P@ssw0rd12345!", 10);

  // Insert Doctor
  const doctorEmail = `doc62_${stamp}@test.com`;
  const [docRes] = await pool.execute(
    `INSERT INTO users (role_id, hospital_id, department_id, full_name, email, password_hash, phone, status)
     VALUES (?, ?, ?, 'Dr. Marcus Welby', ?, ?, '+91-9876500011', 'active')`,
    [docRoleId, hospitalId, departmentId, doctorEmail, passHash]
  );
  const doctorId = docRes.insertId;

  await pool.execute(
    `INSERT INTO doctor_profiles (user_id, specialization, qualifications, experience_years, consultation_fee)
     VALUES (?, 'Orthopedic Surgeon', 'MS Orthopedics', 15, 800.00)`,
    [doctorId]
  );

  const doctorToken = jwt.sign(
    { sub: String(doctorId), email: doctorEmail, role: "doctor", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  // Insert Patient
  const patientEmail = `pat62_${stamp}@test.com`;
  const [patRes] = await pool.execute(
    `INSERT INTO users (role_id, full_name, email, password_hash, phone, status)
     VALUES (?, 'Patient 6.2 Test', ?, ?, '+91-9876500012', 'active')`,
    [patRoleId, patientEmail, passHash]
  );
  const patientId = patRes.insertId;

  const patientToken = jwt.sign(
    { sub: String(patientId), email: patientEmail, role: "patient", tokenVersion: 1 },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  try {
    // TEST 1: Schedule validation error handling
    console.log("TEST 1: Validating doctor schedule inputs...");
    const invalidTimeRes = await put(
      `/doctors/${doctorId}/schedules`,
      {
        schedules: [
          {
            day_of_week: "monday",
            start_time: "17:00:00",
            end_time: "09:00:00", // Start is after End!
            slot_duration_minutes: 30,
          },
        ],
      },
      doctorToken
    );
    assert.strictEqual(invalidTimeRes.status, 400);
    assert.ok(invalidTimeRes.body.message.includes("start_time must be strictly earlier than end_time"));

    const invalidBreakRes = await put(
      `/doctors/${doctorId}/schedules`,
      {
        schedules: [
          {
            day_of_week: "monday",
            start_time: "09:00:00",
            end_time: "17:00:00",
            break_start: "18:00:00", // Break outside working hours!
            break_end: "19:00:00",
            slot_duration_minutes: 30,
          },
        ],
      },
      doctorToken
    );
    assert.strictEqual(invalidBreakRes.status, 400);
    assert.ok(invalidBreakRes.body.message.includes("Break period must fall completely within working hours"));
    console.log("✓ TEST 1 Passed: Schedule validation rejects invalid hours and breaks.");

    // TEST 2: Setting weekly recurring schedules (Monday & Tuesday, 09:00 - 17:00, lunch 13:00 - 14:00, 30m slots)
    console.log("TEST 2: Saving doctor recurring weekly schedules...");
    const saveRes = await put(
      `/doctors/${doctorId}/schedules`,
      {
        schedules: [
          {
            day_of_week: "monday",
            start_time: "09:00:00",
            end_time: "17:00:00",
            slot_duration_minutes: 30,
            break_start: "13:00:00",
            break_end: "14:00:00",
            is_available: true,
          },
          {
            day_of_week: "tuesday",
            start_time: "09:00:00",
            end_time: "17:00:00",
            slot_duration_minutes: 30,
            break_start: "13:00:00",
            break_end: "14:00:00",
            is_available: true,
          },
        ],
      },
      doctorToken
    );
    assert.strictEqual(saveRes.status, 200);
    assert.strictEqual(saveRes.body.count, 2);

    const getSchedRes = await get(`/doctors/${doctorId}/schedules`, doctorToken);
    assert.strictEqual(getSchedRes.status, 200);
    assert.strictEqual(getSchedRes.body.count, 2);
    const days = getSchedRes.body.data.map((s) => s.day_of_week);
    assert.ok(days.includes("monday"));
    assert.ok(days.includes("tuesday"));
    console.log("✓ TEST 2 Passed: Doctor schedules saved and retrieved successfully.");

    // TEST 3: Doctor leave management
    console.log("TEST 3: Marking doctor leave / holiday...");
    // Find next upcoming Monday and Tuesday dates
    const d = new Date();
    d.setDate(d.getDate() + 1); // Start tomorrow
    while (d.getUTCDay() !== 1) { // 1 = Monday
      d.setDate(d.getDate() + 1);
    }
    const nextMondayStr = d.toISOString().split("T")[0];

    d.setDate(d.getDate() + 1); // Tuesday
    const nextTuesdayStr = d.toISOString().split("T")[0];

    d.setDate(d.getDate() + 5); // Sunday (unscheduled)
    const nextSundayStr = d.toISOString().split("T")[0];

    // Mark next Monday as leave
    const leaveRes = await post(
      `/doctors/${doctorId}/leaves`,
      { leave_date: nextMondayStr, reason: "Attending Annual Orthopedic Conference" },
      doctorToken
    );
    assert.strictEqual(leaveRes.status, 201);
    assert.strictEqual(leaveRes.body.data.leave_date.slice(0, 10), nextMondayStr);

    const leavesList = await get(`/doctors/${doctorId}/leaves`, doctorToken);
    assert.strictEqual(leavesList.status, 200);
    assert.strictEqual(leavesList.body.count, 1);
    console.log("✓ TEST 3 Passed: Doctor leave date scheduled successfully.");

    // TEST 4: Dynamic slot computation
    console.log("TEST 4: Computing dynamic slots for normal working day (Tuesday)...");
    const tuesdaySlots = await get(`/doctors/${doctorId}/available-slots?date=${nextTuesdayStr}`, patientToken);
    assert.strictEqual(tuesdaySlots.status, 200);
    assert.strictEqual(tuesdaySlots.body.available, true);
    assert.strictEqual(tuesdaySlots.body.day_of_week, "tuesday");

    // 09:00 to 17:00 = 8 hours = 16 30-min slots minus 1 hr lunch (2 slots: 13:00, 13:30) = 14 slots
    assert.strictEqual(tuesdaySlots.body.total_slots, 14);
    assert.strictEqual(tuesdaySlots.body.available_count, 14);

    // Verify break slots are NOT included in slots
    const hasLunchSlot = tuesdaySlots.body.all_slots.some((s) => s.start_time.startsWith("13:"));
    assert.strictEqual(hasLunchSlot, false, "Break time slots (13:00 - 14:00) must not be generated");

    // TEST 5: Leave day slot computation
    console.log("TEST 5: Computing slots on leave date (Monday)...");
    const mondaySlots = await get(`/doctors/${doctorId}/available-slots?date=${nextMondayStr}`, patientToken);
    assert.strictEqual(mondaySlots.status, 200);
    assert.strictEqual(mondaySlots.body.available, false);
    assert.strictEqual(mondaySlots.body.is_on_leave, true);
    assert.strictEqual(mondaySlots.body.slots.length, 0);
    assert.ok(mondaySlots.body.message.includes("unavailable on this date due to scheduled leave"));
    console.log("✓ TEST 5 Passed: Doctor blocked on leave day.");

    // TEST 6: Unscheduled day slot computation
    console.log("TEST 6: Computing slots on unscheduled day (Sunday)...");
    const sundaySlots = await get(`/doctors/${doctorId}/available-slots?date=${nextSundayStr}`, patientToken);
    assert.strictEqual(sundaySlots.status, 200);
    assert.strictEqual(sundaySlots.body.available, false);
    assert.strictEqual(sundaySlots.body.is_off_duty, true);
    assert.strictEqual(sundaySlots.body.slots.length, 0);
    console.log("✓ TEST 6 Passed: Doctor blocked on unscheduled day.");

    // TEST 7: Booked appointment reduces available slots dynamically
    console.log("TEST 7: Booking a slot dynamically reduces available slots on Tuesday...");
    const aptNumber = `APT-TEST62-${stamp}`;
    await pool.execute(
      `INSERT INTO appointments
         (appointment_number, patient_id, hospital_id, department_id, doctor_id,
          appointment_date, appointment_time, start_time, end_time, status, reason)
       VALUES (?, ?, ?, ?, ?, ?, '10:00:00', '10:00:00', '10:30:00', 'confirmed', 'Joint pain consultation')`,
      [aptNumber, patientId, hospitalId, departmentId, doctorId, nextTuesdayStr]
    );

    const updatedTuesdaySlots = await get(`/doctors/${doctorId}/available-slots?date=${nextTuesdayStr}`, patientToken);
    assert.strictEqual(updatedTuesdaySlots.status, 200);
    assert.strictEqual(updatedTuesdaySlots.body.total_slots, 14);
    assert.strictEqual(updatedTuesdaySlots.body.available_count, 13);
    assert.strictEqual(updatedTuesdaySlots.body.booked_count, 1);

    const slot10 = updatedTuesdaySlots.body.all_slots.find((s) => s.start_time.startsWith("10:00"));
    assert.ok(slot10);
    assert.strictEqual(slot10.is_booked, true);
    assert.strictEqual(slot10.is_available, false);

    const slot1030 = updatedTuesdaySlots.body.all_slots.find((s) => s.start_time.startsWith("10:30"));
    assert.ok(slot1030);
    assert.strictEqual(slot1030.is_booked, false);
    assert.strictEqual(slot1030.is_available, true);
    console.log("✓ TEST 7 Passed: Booked slots dynamically deducted from availability.");

    console.log("\n=======================================================");
    console.log("ALL LESSON 6.2 TESTS PASSED SUCCESSFULLY! (7 / 7)");
    console.log("=======================================================\n");
  } finally {
    // Cleanup fixtures
    await pool.execute("DELETE FROM appointments WHERE doctor_id = ?", [doctorId]);
    await pool.execute("DELETE FROM doctor_leaves WHERE doctor_id = ?", [doctorId]);
    await pool.execute("DELETE FROM doctor_schedules WHERE doctor_id = ?", [doctorId]);
    await pool.execute("DELETE FROM doctor_profiles WHERE user_id = ?", [doctorId]);
    await pool.execute("DELETE FROM users WHERE id IN (?, ?)", [doctorId, patientId]);
    await pool.execute("DELETE FROM departments WHERE id = ?", [departmentId]);
    await pool.execute("DELETE FROM hospitals WHERE id = ?", [hospitalId]);
  }
}

runTests()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("Lesson 6.2 Test Suite Failed:", err);
    await pool.end();
    process.exit(1);
  });
