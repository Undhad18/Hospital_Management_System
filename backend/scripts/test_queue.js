const pool = require("../db");

async function check() {
  const [res] = await pool.execute("SELECT CURDATE() as curdate, DATE(NOW()) as date_now, UTC_DATE() as udate");
  console.log("MySQL Dates:", res);
  const [apts] = await pool.execute("SELECT id, DATE_FORMAT(appointment_date, '%Y-%m-%d') as formatted_date FROM appointments WHERE id = 115");
  console.log("Apt 115 formatted_date:", apts);

  // Check what GET /queue/live returns
  const today = new Date().toISOString().split("T")[0];
  console.log("Node today:", today);
  const [queueRows] = await pool.execute(`
    SELECT
      a.id, a.appointment_number, a.queue_number, a.patient_id,
      a.doctor_id, a.department_id, a.status, a.check_in_time,
      a.appointment_time,
      pat.full_name AS patient_name,
      doc.full_name AS doctor_name,
      d.name AS department_name
    FROM appointments a
    JOIN users pat ON pat.id = a.patient_id
    JOIN users doc ON doc.id = a.doctor_id
    JOIN departments d ON d.id = a.department_id
    WHERE a.appointment_date = ? AND a.status IN ('in_waiting', 'in_progress')
  `, [today]);
  console.log("Queue rows for today in DB:", queueRows);

  const [confirmedToday] = await pool.execute(`
    SELECT a.id, a.appointment_number, pat.full_name as patient_name, doc.full_name as doctor_name, d.name as department_name, a.appointment_time, a.status
    FROM appointments a
    JOIN users pat ON pat.id = a.patient_id
    JOIN users doc ON doc.id = a.doctor_id
    JOIN departments d ON d.id = a.department_id
    WHERE (a.appointment_date = ? OR DATE_FORMAT(a.appointment_date, '%Y-%m-%d') = ?) AND a.status = 'confirmed'
  `, [today, today]);
  console.log("Confirmed appointments for today in DB:", confirmedToday);

  process.exit(0);
}

check().catch(console.error);
