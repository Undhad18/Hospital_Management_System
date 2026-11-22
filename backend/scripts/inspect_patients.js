const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const pool = require("../db");

async function check() {
  const [rows] = await pool.query(`
    SELECT u.id, u.full_name, u.email 
    FROM users u 
    WHERE u.full_name LIKE '%Santos%' OR u.full_name LIKE '%David Kim%'
    LIMIT 20
  `);
  console.table(rows);
  process.exit(0);
}

check().catch(console.error);
