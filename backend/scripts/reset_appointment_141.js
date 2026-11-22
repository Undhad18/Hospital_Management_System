const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const pool = require("../db");

async function reset() {
  await pool.query(
    "UPDATE appointments SET status = 'confirmed', queue_number = NULL, check_in_time = NULL, checked_in_by = NULL WHERE id = 141"
  );
  console.log("Appointment 141 (APT-TODAY-01) reset to confirmed, awaiting check-in.");
  process.exit(0);
}

reset().catch(console.error);
