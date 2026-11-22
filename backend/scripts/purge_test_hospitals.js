const pool = require('../db');

async function purgeTestHospitals() {
  console.log('====================================================');
  console.log('       PURGING TEST HOSPITALS & FIXTURES            ');
  console.log('====================================================\n');

  const connection = await pool.getConnection();

  try {
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    console.log('✔ Foreign key checks temporarily disabled');

    // 1. Purge child tables referencing hospitals NOT IN (1, 2)
    console.log('\n--- 1. Cleaning child hospital records ---');

    await connection.query(`
      DELETE FROM pharmacy_dispensation_items 
      WHERE dispensation_id IN (SELECT id FROM pharmacy_dispensations WHERE hospital_id NOT IN (1, 2))
    `);
    await connection.query('DELETE FROM pharmacy_dispensations WHERE hospital_id NOT IN (1, 2)');
    await connection.query('DELETE FROM pharmacy_refunds WHERE hospital_id NOT IN (1, 2)');
    await connection.query('DELETE FROM pharmacy_payments WHERE hospital_id NOT IN (1, 2)');
    await connection.query(`
      DELETE FROM pharmacy_bill_items 
      WHERE bill_id IN (SELECT id FROM pharmacy_bills WHERE hospital_id NOT IN (1, 2))
    `);
    await connection.query('DELETE FROM pharmacy_bills WHERE hospital_id NOT IN (1, 2)');
    await connection.query('DELETE FROM stock_movements WHERE hospital_id NOT IN (1, 2)');
    await connection.query('DELETE FROM medicine_batches WHERE hospital_id NOT IN (1, 2)');
    await connection.query('DELETE FROM hospital_medicines WHERE hospital_id NOT IN (1, 2)');
    await connection.query('DELETE FROM medicine_categories WHERE hospital_id NOT IN (1, 2)');
    await connection.query('DELETE FROM suppliers WHERE hospital_id NOT IN (1, 2)');
    console.log('✔ Cleaned pharmacy records for test hospitals');

    await connection.query(`
      DELETE FROM prescription_items 
      WHERE prescription_id IN (SELECT id FROM prescriptions WHERE hospital_id NOT IN (1, 2))
    `);
    await connection.query(`
      DELETE FROM prescription_status_history 
      WHERE prescription_id IN (SELECT id FROM prescriptions WHERE hospital_id NOT IN (1, 2))
    `);
    await connection.query('DELETE FROM prescriptions WHERE hospital_id NOT IN (1, 2)');
    await connection.query(`
      DELETE FROM consultation_vitals 
      WHERE consultation_id IN (SELECT id FROM consultations WHERE hospital_id NOT IN (1, 2))
    `);
    await connection.query('DELETE FROM consultations WHERE hospital_id NOT IN (1, 2)');
    await connection.query('DELETE FROM appointments WHERE hospital_id NOT IN (1, 2)');
    await connection.query('DELETE FROM patient_medical_records WHERE hospital_id NOT IN (1, 2)');
    await connection.query('DELETE FROM doctor_schedules WHERE hospital_id NOT IN (1, 2)');
    console.log('✔ Cleaned clinical OPD, consultations, appointments & schedules for test hospitals');

    await connection.query('DELETE FROM lab_payments WHERE hospital_id NOT IN (1, 2)');
    await connection.query('DELETE FROM lab_reports WHERE hospital_id NOT IN (1, 2)');
    await connection.query('DELETE FROM investigation_requests WHERE hospital_id NOT IN (1, 2)');
    await connection.query('DELETE FROM hospital_lab_tests WHERE hospital_id NOT IN (1, 2)');
    console.log('✔ Cleaned lab test assignments, orders & payments for test hospitals');

    await connection.query(`
      DELETE FROM bed_maintenance_logs 
      WHERE bed_id IN (SELECT b.id FROM beds b JOIN wards w ON b.ward_id = w.id WHERE w.hospital_id NOT IN (1, 2))
    `);
    await connection.query('DELETE FROM bed_assignments WHERE hospital_id NOT IN (1, 2)');
    await connection.query(`
      DELETE FROM beds 
      WHERE ward_id IN (SELECT id FROM wards WHERE hospital_id NOT IN (1, 2))
    `);
    await connection.query(`
      DELETE FROM admission_status_history 
      WHERE admission_id IN (SELECT id FROM admissions WHERE hospital_id NOT IN (1, 2))
    `);
    await connection.query('DELETE FROM admissions WHERE hospital_id NOT IN (1, 2)');
    await connection.query('DELETE FROM wards WHERE hospital_id NOT IN (1, 2)');
    console.log('✔ Cleaned inpatient wards, beds & admissions for test hospitals');

    await connection.query('DELETE FROM designations WHERE hospital_id NOT IN (1, 2)');
    await connection.query('DELETE FROM departments WHERE hospital_id NOT IN (1, 2)');
    await connection.query('DELETE FROM notifications WHERE hospital_id NOT IN (1, 2)');
    console.log('✔ Cleaned departments, designations & notifications for test hospitals');

    // 2. Clean test users
    console.log('\n--- 2. Cleaning Test Users ---');
    const genuineUserIds = [1, 2, 3, 4, 33, 39, 40, 51, 55, 190, 407, 428, 429, 430, 431, 432, 433, 434, 447];
    const userIdsPlaceholder = genuineUserIds.join(',');

    await connection.query(`DELETE FROM doctor_profiles WHERE user_id NOT IN (${userIdsPlaceholder})`);
    await connection.query(`DELETE FROM staff_profiles WHERE user_id NOT IN (${userIdsPlaceholder})`);
    await connection.query(`DELETE FROM patient_profiles WHERE user_id NOT IN (${userIdsPlaceholder})`);
    await connection.query('DELETE FROM otp_verifications');
    await connection.query(`DELETE FROM notifications WHERE recipient_user_id NOT IN (${userIdsPlaceholder})`);
    await connection.query(`DELETE FROM audit_logs WHERE actor_id NOT IN (${userIdsPlaceholder}) OR details LIKE "%179%" OR details LIKE "%Test%"`);
    await connection.query(`DELETE FROM users WHERE id NOT IN (${userIdsPlaceholder})`);
    console.log('✔ Retained only genuine users, purged test users');

    // 3. Purge Hospitals
    console.log('\n--- 3. Purging Test Hospitals ---');
    const [delResult] = await connection.query('DELETE FROM hospitals WHERE id NOT IN (1, 2)');
    console.log(`✔ Deleted ${delResult.affectedRows} testing hospital records`);

    // Ensure Hospital 1 and Hospital 2 have exact names and status 'active'
    await connection.query(`
      UPDATE hospitals SET 
        name = 'Demo General Hospital',
        code = 'DEMO-001',
        email = 'contact@demogeneral.com',
        phone = '+1-555-0199',
        address = '123 Healthcare Boulevard, Medical District',
        status = 'active'
      WHERE id = 1
    `);
    await connection.query(`
      UPDATE hospitals SET 
        name = 'St. Jude General Hospital',
        code = 'SJH-002',
        email = 'admin@stjude.org',
        phone = '+1-555-0288',
        address = '456 Hope Street, Metro City',
        status = 'active'
      WHERE id = 2
    `);
    console.log('✔ Verified Hospital #1: Demo General Hospital and Hospital #2: St. Jude General Hospital');

    // 4. Verify count
    const [finalHospitals] = await connection.query('SELECT id, name, code, status FROM hospitals ORDER BY id ASC');
    console.log('\n--- Final Hospitals in Database ---');
    console.table(finalHospitals);

    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('✔ Foreign key checks restored');

    console.log('\n====================================================');
    console.log('       PURGE COMPLETE: ONLY 2 HOSPITALS REMAIN      ');
    console.log('====================================================');
  } catch (err) {
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    console.error('❌ Error during purge:', err);
    throw err;
  } finally {
    connection.release();
    await pool.end();
  }
}

purgeTestHospitals().catch((err) => {
  console.error(err);
  process.exit(1);
});
