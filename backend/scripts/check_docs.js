const pool = require("../db");

async function checkDoctors() {
  const [docs] = await pool.execute(`
    SELECT u.id, u.full_name, u.email, u.department_id, d.name as dept_name
    FROM users u
    JOIN roles r ON r.id = u.role_id
    LEFT JOIN departments d ON d.id = u.department_id
    WHERE r.name = 'doctor' AND u.hospital_id = 1
  `);
  console.log("Doctors in Hospital 1:", docs);
  process.exit(0);
}

checkDoctors().catch(console.error);
