require("dotenv").config();
const http = require("http");
const app = require("../server"); // We can test against running server or launch an ephemeral instance
const pool = require("../db");
const bcrypt = require("bcryptjs");

async function runTests() {
  console.log("=== Running Lesson 2.1 Tests ===");

  // Create or ensure test users exist:
  // 1. active user (admin@hms.com)
  // 2. pending user (pending.doctor@example.com)
  // 3. suspended user (suspended.staff@example.com)
  const password = "@abcd_123456";
  const passwordHash = await bcrypt.hash(password, 10);

  const [roles] = await pool.query("SELECT id, name FROM roles");
  const doctorRole = roles.find((r) => r.name === "doctor");
  const staffRole = roles.find((r) => r.name === "staff");

  // Clean up previous test users if any
  await pool.query("DELETE FROM users WHERE email IN ('pending.doc@test.com', 'suspended.staff@test.com')");

  await pool.query(
    `INSERT INTO users (role_id, full_name, email, password_hash, status)
     VALUES (?, 'Pending Doctor', 'pending.doc@test.com', ?, 'pending')`,
    [doctorRole.id, passwordHash]
  );

  await pool.query(
    `INSERT INTO users (role_id, full_name, email, password_hash, status)
     VALUES (?, 'Suspended Staff', 'suspended.staff@test.com', ?, 'suspended')`,
    [staffRole.id, passwordHash]
  );

  const BASE_URL = `http://localhost:${process.env.PORT || 5000}/api`;

  async function post(endpoint, body, headers = {}) {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return { status: res.status, data };
  }

  async function get(endpoint, headers = {}) {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: "GET",
      headers,
    });
    const data = await res.json();
    return { status: res.status, data };
  }

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  // 1. Valid login
  const validRes = await post("/auth/login", { email: "admin@hms.com", password });
  assert(validRes.status === 200 && validRes.data.success === true, "Valid login returns 200 and success=true");
  assert(typeof validRes.data.token === "string", "Valid login returns JWT token");
  assert(validRes.data.user && validRes.data.user.role === "super_admin", "Valid login returns correct user object");

  const token = validRes.data.token;

  // 2. Invalid password
  const badPassRes = await post("/auth/login", { email: "admin@hms.com", password: "wrongpassword123" });
  assert(badPassRes.status === 401 && badPassRes.data.success === false, "Invalid password returns 401");

  // 3. Non-existent email
  const badEmailRes = await post("/auth/login", { email: "nonexistent@test.com", password });
  assert(badEmailRes.status === 401 && badEmailRes.data.success === false, "Nonexistent email returns 401");

  // 4. Pending user login rejection
  const pendingRes = await post("/auth/login", { email: "pending.doc@test.com", password });
  assert(pendingRes.status === 403 && pendingRes.data.status === "pending", "Pending account login rejected with 403 and status=pending");

  // 5. Suspended user login rejection
  const suspendedRes = await post("/auth/login", { email: "suspended.staff@test.com", password });
  assert(suspendedRes.status === 403 && suspendedRes.data.status === "suspended", "Suspended account login rejected with 403 and status=suspended");

  // 6. Protected route without token
  const noTokenRes = await get("/auth/me");
  assert(noTokenRes.status === 401, "Protected route /auth/me returns 401 when no token provided");

  // 7. Protected route with valid token
  const meRes = await get("/auth/me", { Authorization: `Bearer ${token}` });
  assert(meRes.status === 200 && meRes.data.user.email === "admin@hms.com", "Protected route /auth/me returns 200 with user data when token valid");

  // Clean up test users
  await pool.query("DELETE FROM users WHERE email IN ('pending.doc@test.com', 'suspended.staff@test.com')");

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test execution error:", err);
    process.exit(1);
  });
