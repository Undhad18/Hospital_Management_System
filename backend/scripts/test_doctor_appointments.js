const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const jwt = require("jsonwebtoken");
const pool = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_jwt_key_at_least_32_characters_long";

async function main() {
  const [uRows] = await pool.query("SELECT id, email, token_version, status, hospital_id FROM users WHERE id = 39");
  console.log("User 39 in DB:", uRows[0]);

  const docToken = jwt.sign(
    { sub: "39", email: "doctor@hms.com", role: "doctor", hospitalId: 1, departmentId: 23, tokenVersion: uRows[0].token_version },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  const today = new Date().toISOString().split("T")[0];
  const res = await fetch(`http://localhost:5000/api/appointments?date=${today}`, {
    headers: { Authorization: `Bearer ${docToken}` },
  });
  const data = await res.json();
  console.log("Doctor appointments response status:", res.status);
  console.log("Doctor appointments response body:", data);
  process.exit(0);
}

main().catch(console.error);
