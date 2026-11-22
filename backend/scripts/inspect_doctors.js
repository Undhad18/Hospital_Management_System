const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const pool = require("../db");

async function check() {
  const [rows] = await pool.query(`
    SELECT u.id, u.full_name, u.email, r.name as role, u.hospital_id, u.department_id, d.name as dept_name
    FROM users u
    JOIN roles r ON u.role_id = r.id
    LEFT JOIN departments d ON u.department_id = d.id
    WHERE r.name = 'doctor'
  `);
  console.table(rows);
  process.exit(0);
}

check().catch(console.error);
