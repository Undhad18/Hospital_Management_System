const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const pool = require("../db");

async function check() {
  const [rows] = await pool.query(`
    SELECT 
      a.id, 
      a.appointment_number, 
      u.full_name AS patient_name, 
      doc.full_name AS doctor_name, 
      d.name AS department_name, 
      a.status, 
      a.queue_number, 
      a.check_in_time 
    FROM appointments a
    LEFT JOIN users u ON a.patient_id = u.id
    LEFT JOIN users doc ON a.doctor_id = doc.id
    LEFT JOIN departments d ON a.department_id = d.id
    WHERE a.hospital_id = 1 AND a.appointment_date = CURDATE()
    ORDER BY a.id ASC
  `);
  console.log("Today's appointments in DB for Hospital 1:");
  console.table(rows);
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
