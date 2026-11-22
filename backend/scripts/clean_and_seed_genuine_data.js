const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../db');

async function cleanAndSeedGenuineData() {
  console.log('====================================================');
  console.log('   PURGING TEST FIXTURES & SEEDING GENUINE DATA    ');
  console.log('====================================================\n');

  const connection = await pool.getConnection();

  try {
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    console.log('✔ Disabled foreign key checks for atomic restructuring');

    // 1. Purge Lab Test Fixtures
    console.log('\n--- 1. Cleaning Lab Tests, Reports & Orders ---');
    await connection.query('DELETE FROM lab_payments');
    await connection.query('DELETE FROM lab_reports');
    await connection.query('DELETE FROM investigation_requests');
    await connection.query('DELETE FROM hospital_lab_tests');

    // Clean physical uploaded files in backend/uploads/lab_reports
    const uploadDir = path.join(__dirname, '..', 'uploads', 'lab_reports');
    if (fs.existsSync(uploadDir)) {
      const files = fs.readdirSync(uploadDir);
      for (const file of files) {
        if (file !== '.gitkeep') {
          try {
            fs.unlinkSync(path.join(uploadDir, file));
          } catch (e) {
            console.warn(`Could not delete ${file}:`, e.message);
          }
        }
      }
      console.log(`✔ Cleaned physical files in ${uploadDir}`);
    }

    // Retain only IDs 1..15 in master_lab_tests
    await connection.query('DELETE FROM master_lab_tests WHERE id > 15');
    console.log('✔ Purged all test master lab tests (id > 15)');

    // Ensure the 15 master tests are pristine and active
    const standardMasterTests = [
      { id: 1, code: 'CBC-001', name: 'Complete Blood Count (CBC)', cat: 'Hematology', sample: 'Whole Blood (EDTA)', hours: 4, desc: 'Evaluates overall health and detects a wide range of disorders, including anemia, infection and leukemia.', inst: 'No fasting required. Avoid strenuous exercise immediately before the blood draw.' },
      { id: 2, code: 'FBS-002', name: 'Fasting Blood Sugar (FBS)', cat: 'Biochemistry', sample: 'Fluoride Plasma', hours: 4, desc: 'Measures blood glucose level after an overnight fast to screen for prediabetes and diabetes mellitus.', inst: 'Requires 8-10 hours of overnight fasting. Only plain water is permitted.' },
      { id: 3, code: 'PPBS-003', name: 'Postprandial Blood Sugar (PPBS)', cat: 'Biochemistry', sample: 'Fluoride Plasma', hours: 4, desc: 'Measures blood glucose exactly 2 hours after starting a standardized meal.', inst: 'Sample must be collected exactly 2 hours after commencing meal.' },
      { id: 4, code: 'HBA1C-004', name: 'HbA1c (Glycated Hemoglobin)', cat: 'Biochemistry', sample: 'Whole Blood (EDTA)', hours: 8, desc: 'Provides average blood glucose levels over past 2 to 3 months for long-term glycemic monitoring.', inst: 'No fasting required. Can be done any time of day.' },
      { id: 5, code: 'LIPID-005', name: 'Lipid Profile (Cholesterol, HDL, LDL, TG)', cat: 'Biochemistry', sample: 'Serum', hours: 12, desc: 'Comprehensive panel measuring total cholesterol, HDL, LDL, VLDL and triglycerides for cardiovascular risk assessment.', inst: 'Requires 10-12 hours of overnight fasting. Avoid alcohol 24 hours prior.' },
      { id: 6, code: 'LFT-006', name: 'Liver Function Test (LFT)', cat: 'Biochemistry', sample: 'Serum', hours: 12, desc: 'Assesses hepatic health via Bilirubin, SGOT/AST, SGPT/ALT, Alkaline Phosphatase, Total Protein and Albumin.', inst: 'Overnight fasting of 8 hours recommended. Avoid alcohol 48 hours prior.' },
      { id: 7, code: 'KFT-007', name: 'Kidney Function Test (KFT / RFT)', cat: 'Biochemistry', sample: 'Serum', hours: 12, desc: 'Evaluates renal clearance and glomerular filtration via Blood Urea, BUN, Serum Creatinine and Uric Acid.', inst: 'Avoid high-protein meals and intense exercise 24 hours prior.' },
      { id: 8, code: 'TSH-008', name: 'Thyroid Stimulating Hormone (TSH)', cat: 'Endocrinology', sample: 'Serum', hours: 12, desc: 'Key diagnostic screening for hypothyroidism, hyperthyroidism and pituitary-thyroid axis regulation.', inst: 'Morning sample preferred before taking daily thyroid medication.' },
      { id: 9, code: 'URINE-009', name: 'Urine Routine & Microscopic Examination', cat: 'Clinical Pathology', sample: 'Urine', hours: 2, desc: 'Physical, chemical and microscopic analysis of urine for renal, metabolic, and urinary tract disorders.', inst: 'Collect first morning clean-catch midstream urine sample in sterile container.' },
      { id: 10, code: 'ELYTE-010', name: 'Serum Electrolytes (Na+, K+, Cl-)', cat: 'Biochemistry', sample: 'Serum', hours: 6, desc: 'Measures essential electrolyte balance, hydration status, and acid-base equilibrium.', inst: 'No special fasting required unless requested alongside fasting panels.' },
      { id: 11, code: 'CXR-011', name: 'Chest X-Ray PA View', cat: 'Radiology', sample: 'Imaging', hours: 2, desc: 'High-resolution thoracic radiograph evaluating heart size, pulmonary parenchyma and mediastinum.', inst: 'Remove all metallic objects, jewelry and wear hospital examination gown.' },
      { id: 12, code: 'ECG-012', name: 'ECG 12-Lead Standard', cat: 'Cardiology', sample: 'Diagnostic Tracing', hours: 1, desc: 'Standard 12-lead electrocardiogram recording heart rate, rhythm, conduction abnormalities and ischemia.', inst: 'Avoid caffeine and smoking 2 hours prior. Rest quietly for 10 minutes prior to recording.' },
      { id: 13, code: 'USG-013', name: 'Ultrasound Abdomen & Pelvis', cat: 'Radiology', sample: 'Imaging', hours: 4, desc: 'Sonographic imaging of liver, gallbladder, kidneys, spleen, pancreas, urinary bladder and pelvic organs.', inst: 'Full bladder required for pelvic scan; 6-8 hours fasting for upper abdomen.' },
      { id: 14, code: 'TROP-014', name: 'Troponin I (High Sensitivity)', cat: 'Cardiology', sample: 'Serum', hours: 3, desc: 'High-sensitivity cardiac biomarker for rapid evaluation of acute myocardial infarction and chest pain.', inst: 'Stat test. No preparation required.' },
      { id: 15, code: 'URIC-015', name: 'Serum Uric Acid', cat: 'Biochemistry', sample: 'Serum', hours: 6, desc: 'Assesses hyperuricemia associated with gout, renal stones and metabolic syndrome.', inst: 'Overnight fasting of 8 hours recommended. Avoid alcohol and purine-rich foods.' }
    ];

    for (const t of standardMasterTests) {
      await connection.query(`
        INSERT INTO master_lab_tests (id, test_code, test_name, category, sample_type, standard_turnaround_hours, description, instructions, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
        ON DUPLICATE KEY UPDATE
          test_code = VALUES(test_code),
          test_name = VALUES(test_name),
          category = VALUES(category),
          sample_type = VALUES(sample_type),
          standard_turnaround_hours = VALUES(standard_turnaround_hours),
          description = VALUES(description),
          instructions = VALUES(instructions),
          status = 'active'
      `, [t.id, t.code, t.name, t.cat, t.sample, t.hours, t.desc, t.inst]);
    }
    console.log('✔ Standardized and activated all 15 master lab catalog tests');

    // 2. Clean Hospitals
    console.log('\n--- 2. Cleaning Hospitals ---');
    await connection.query('DELETE FROM hospitals WHERE id NOT IN (1, 2)');
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
    console.log('✔ Restructured hospitals: 2 genuine facilities (Demo General Hospital & St. Jude)');

    // 3. Clean Departments
    console.log('\n--- 3. Cleaning Departments ---');
    await connection.query('DELETE FROM departments WHERE hospital_id NOT IN (1, 2) OR name LIKE "%179%" OR name LIKE "%178%" OR name LIKE "%Test%"');
    
    // Ensure standard departments for Hospital 1
    const h1Depts = [
      { name: 'General Medicine', desc: 'Primary adult care, chronic conditions and acute medical illnesses' },
      { name: 'Cardiology', desc: 'Comprehensive cardiac assessment, diagnostic ECG, echocardiography and heart care' },
      { name: 'Orthopedics', desc: 'Bone, joint, trauma and musculoskeletal care' },
      { name: 'Neurology', desc: 'Central and peripheral nervous system diagnostics and therapy' },
      { name: 'Pathology & Laboratory', desc: 'Diagnostic clinical laboratory, hematology, biochemistry and microbiology' },
      { name: 'Radiology & Imaging', desc: 'Diagnostic radiography, sonography and medical imaging' },
      { name: 'Intensive Care Unit (ICU)', desc: 'Multi-disciplinary advanced critical care and coronary telemetry' },
      { name: 'Pediatrics', desc: 'Comprehensive neonatal, child and adolescent healthcare' }
    ];

    for (const d of h1Depts) {
      const [existing] = await connection.query('SELECT id FROM departments WHERE hospital_id = 1 AND name = ?', [d.name]);
      if (existing.length === 0) {
        await connection.query('INSERT INTO departments (hospital_id, name, description, status) VALUES (1, ?, ?, "active")', [d.name, d.desc]);
      } else {
        await connection.query('UPDATE departments SET description = ?, status = "active" WHERE id = ?', [d.desc, existing[0].id]);
      }
    }

    // Ensure standard departments for Hospital 2
    const h2Depts = [
      { name: 'General Medicine', desc: 'Inpatient and outpatient general medical care' },
      { name: 'Pediatrics', desc: 'Specialized pediatric medicine and adolescent health' },
      { name: 'Cardiology', desc: 'Clinical cardiology and non-invasive cardiac evaluation' }
    ];
    for (const d of h2Depts) {
      const [existing] = await connection.query('SELECT id FROM departments WHERE hospital_id = 2 AND name = ?', [d.name]);
      if (existing.length === 0) {
        await connection.query('INSERT INTO departments (hospital_id, name, description, status) VALUES (2, ?, ?, "active")', [d.name, d.desc]);
      } else {
        await connection.query('UPDATE departments SET description = ?, status = "active" WHERE id = ?', [d.desc, existing[0].id]);
      }
    }
    console.log('✔ Configured clinical departments for genuine hospitals');

    // 4. Clean Users & Roles
    console.log('\n--- 4. Cleaning Users & Roles ---');
    const genuineUserIds = [1, 2, 3, 4, 33, 39, 40, 51, 55, 190, 407, 428, 429, 430, 431, 432, 433, 434, 447];
    const userIdsPlaceholder = genuineUserIds.join(',');

    await connection.query(`DELETE FROM doctor_profiles WHERE user_id NOT IN (39, 428, 429)`);
    await connection.query(`DELETE FROM staff_profiles WHERE user_id NOT IN (40)`);
    await connection.query(`DELETE FROM patient_profiles WHERE user_id NOT IN (${userIdsPlaceholder})`);
    await connection.query(`DELETE FROM doctor_schedules WHERE doctor_id NOT IN (39, 428, 429)`);
    await connection.query(`DELETE FROM otp_verifications`);
    await connection.query(`DELETE FROM users WHERE id NOT IN (${userIdsPlaceholder})`);
    console.log(`✔ Kept only 19 authentic users, purged 540+ test accounts`);

    // Ensure clean doctor schedules for Dr. Sarah Jenkins (39), Dr. Marcus Reed (428), Dr. Liam Patel (429)
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const docs = [39, 428, 429];
    for (const docId of docs) {
      for (const day of days) {
        const [existing] = await connection.query('SELECT id FROM doctor_schedules WHERE doctor_id = ? AND day_of_week = ?', [docId, day]);
        if (existing.length === 0) {
          await connection.query(`
            INSERT INTO doctor_schedules (doctor_id, hospital_id, day_of_week, start_time, end_time, slot_duration_minutes, is_available)
            VALUES (?, 1, ?, '09:00:00', '17:00:00', 30, 1)
          `, [docId, day]);
        }
      }
    }
    console.log('✔ Verified doctor schedules for Dr. Sarah Jenkins, Dr. Marcus Reed, and Dr. Liam Patel');

    // 5. Clean Wards, Beds & Admissions
    console.log('\n--- 5. Restructuring Wards & Beds ---');
    await connection.query('DELETE FROM bed_maintenance_logs');
    await connection.query('DELETE FROM bed_assignments');
    await connection.query('DELETE FROM beds');
    await connection.query('DELETE FROM wards');
    await connection.query('DELETE FROM admission_status_history');
    await connection.query('DELETE FROM admissions');

    const [cardioDept] = await connection.query('SELECT id FROM departments WHERE hospital_id = 1 AND name = "Cardiology"');
    const [genDept] = await connection.query('SELECT id FROM departments WHERE hospital_id = 1 AND name = "General Medicine"');
    const [orthoDept] = await connection.query('SELECT id FROM departments WHERE hospital_id = 1 AND name = "Orthopedics"');

    const cardioDeptId = cardioDept[0]?.id || 23;
    const genDeptId = genDept[0]?.id || 1;
    const orthoDeptId = orthoDept[0]?.id || 86;

    // Ward 1: CCU
    await connection.query(`
      INSERT INTO wards (id, hospital_id, department_id, name, ward_type, capacity, status)
      VALUES (1, 1, ?, 'Coronary Critical Care Unit (CCU)', 'icu', 6, 'active')
    `, [cardioDeptId]);

    // Ward 2: General Inpatient
    await connection.query(`
      INSERT INTO wards (id, hospital_id, department_id, name, ward_type, capacity, status)
      VALUES (2, 1, ?, 'General Medical Inpatient Ward', 'general', 8, 'active')
    `, [genDeptId]);

    // Ward 3: Surgical Recovery
    await connection.query(`
      INSERT INTO wards (id, hospital_id, department_id, name, ward_type, capacity, status)
      VALUES (3, 1, ?, 'Surgical & Orthopedic Recovery Ward', 'surgical', 6, 'active')
    `, [orthoDeptId]);

    // Beds for Ward 1 (CCU)
    const ccuBeds = [
      { num: 'CCU-101', type: 'ventilator_enabled', rate: 4500.00, status: 'occupied' },
      { num: 'CCU-102', type: 'icu', rate: 3500.00, status: 'available' },
      { num: 'CCU-103', type: 'icu', rate: 3500.00, status: 'available' },
      { num: 'CCU-104', type: 'electric', rate: 3000.00, status: 'available' },
      { num: 'CCU-105', type: 'electric', rate: 3000.00, status: 'maintenance', reason: 'Routine telemetry monitor calibration' },
      { num: 'CCU-106', type: 'icu', rate: 3500.00, status: 'available' }
    ];
    for (const b of ccuBeds) {
      await connection.query(`
        INSERT INTO beds (ward_id, bed_number, bed_type, daily_rate, status, maintenance_reason)
        VALUES (1, ?, ?, ?, ?, ?)
      `, [b.num, b.type, b.rate, b.status, b.reason || null]);
    }

    // Beds for Ward 2 (General)
    const genBeds = [
      { num: 'GEN-201', type: 'standard', rate: 1200.00, status: 'occupied' },
      { num: 'GEN-202', type: 'standard', rate: 1200.00, status: 'available' },
      { num: 'GEN-203', type: 'standard', rate: 1200.00, status: 'available' },
      { num: 'GEN-204', type: 'electric', rate: 1500.00, status: 'available' },
      { num: 'GEN-205', type: 'standard', rate: 1200.00, status: 'available' },
      { num: 'GEN-206', type: 'standard', rate: 1200.00, status: 'available' },
      { num: 'GEN-207', type: 'standard', rate: 1200.00, status: 'available' },
      { num: 'GEN-208', type: 'standard', rate: 1200.00, status: 'available' }
    ];
    for (const b of genBeds) {
      await connection.query(`
        INSERT INTO beds (ward_id, bed_number, bed_type, daily_rate, status)
        VALUES (2, ?, ?, ?, ?)
      `, [b.num, b.type, b.rate, b.status]);
    }

    // Beds for Ward 3 (Surgical)
    const surgBeds = [
      { num: 'SURG-301', type: 'standard', rate: 1800.00, status: 'available' },
      { num: 'SURG-302', type: 'electric', rate: 2200.00, status: 'available' },
      { num: 'SURG-303', type: 'standard', rate: 1800.00, status: 'available' },
      { num: 'SURG-304', type: 'electric', rate: 2200.00, status: 'available' },
      { num: 'SURG-305', type: 'standard', rate: 1800.00, status: 'available' },
      { num: 'SURG-306', type: 'standard', rate: 1800.00, status: 'available' }
    ];
    for (const b of surgBeds) {
      await connection.query(`
        INSERT INTO beds (ward_id, bed_number, bed_type, daily_rate, status)
        VALUES (3, ?, ?, ?, ?)
      `, [b.num, b.type, b.rate, b.status]);
    }
    console.log('✔ Cleaned and seeded 3 realistic wards with 20 beds');

    // 6. Seed Inpatient Admissions
    console.log('\n--- 6. Seeding Realistic Admissions ---');
    const [bedCcu101] = await connection.query('SELECT id FROM beds WHERE bed_number = "CCU-101"');
    const [bedGen201] = await connection.query('SELECT id FROM beds WHERE bed_number = "GEN-201"');
    const ccu101Id = bedCcu101[0].id;
    const gen201Id = bedGen201[0].id;

    // Admission 1: Maria Santos in CCU-101
    const [adm1] = await connection.query(`
      INSERT INTO admissions (admission_number, patient_id, hospital_id, doctor_id, department_id, admission_date, reason, status, admitted_by)
      VALUES ('ADM-2026-0001', 447, 1, 39, ?, DATE_SUB(NOW(), INTERVAL 1 DAY), 'Acute coronary syndrome evaluation and continuous ECG telemetry', 'admitted', 39)
    `, [cardioDeptId]);
    await connection.query(`
      INSERT INTO bed_assignments (bed_id, admission_id, patient_id, ward_id, hospital_id, status, assigned_by, assigned_at)
      VALUES (?, ?, 447, 1, 1, 'active', 39, DATE_SUB(NOW(), INTERVAL 1 DAY))
    `, [ccu101Id, adm1.insertId]);
    await connection.query(`
      INSERT INTO admission_status_history (admission_id, previous_status, new_status, changed_by, change_reason)
      VALUES (?, 'admitted', 'admitted', 39, 'Admitted via Emergency Department to CCU-101')
    `, [adm1.insertId]);

    // Admission 2: David Kim in GEN-201
    const [adm2] = await connection.query(`
      INSERT INTO admissions (admission_number, patient_id, hospital_id, doctor_id, department_id, admission_date, reason, status, admitted_by)
      VALUES ('ADM-2026-0002', 434, 1, 429, ?, DATE_SUB(NOW(), INTERVAL 2 DAY), 'Post-operative monitoring and IV antibiotic therapy', 'admitted', 429)
    `, [genDeptId]);
    await connection.query(`
      INSERT INTO bed_assignments (bed_id, admission_id, patient_id, ward_id, hospital_id, status, assigned_by, assigned_at)
      VALUES (?, ?, 434, 2, 1, 'active', 429, DATE_SUB(NOW(), INTERVAL 2 DAY))
    `, [gen201Id, adm2.insertId]);
    await connection.query(`
      INSERT INTO admission_status_history (admission_id, previous_status, new_status, changed_by, change_reason)
      VALUES (?, 'admitted', 'admitted', 429, 'Admitted to General Medical Ward bed GEN-201')
    `, [adm2.insertId]);
    console.log('✔ Seeded 2 genuine active patient admissions');

    // 7. Seed Clean Appointments & Consultations
    console.log('\n--- 7. Seeding Genuine Appointments & Consultations ---');
    await connection.query('DELETE FROM prescription_items');
    await connection.query('DELETE FROM prescriptions');
    await connection.query('DELETE FROM consultation_vitals');
    await connection.query('DELETE FROM consultations');
    await connection.query('DELETE FROM patient_medical_records');
    await connection.query('DELETE FROM appointments');

    // Appointment 1: Harshil Undhad (Completed OPD visit earlier today)
    const [apt1] = await connection.query(`
      INSERT INTO appointments (appointment_number, hospital_id, patient_id, doctor_id, department_id, appointment_date, appointment_time, appointment_type, appointment_mode, status, reason, queue_number, check_in_time)
      VALUES ('APT-20261028-0001', 1, 430, 39, ?, CURDATE(), '09:00:00', 'consultation', 'in_person', 'completed', 'Routine cardiovascular health screening and lipid evaluation', 'Q-101', DATE_SUB(NOW(), INTERVAL 3 HOUR))
    `, [cardioDeptId]);

    // Consultation for Appointment 1
    const [cons1] = await connection.query(`
      INSERT INTO consultations (appointment_id, patient_id, doctor_id, hospital_id, status, chief_complaint, examination_findings, diagnosis, patient_condition, treatment_plan, clinical_notes, advice, started_at, submitted_at)
      VALUES (?, 430, 39, 1, 'submitted',
        'Annual preventive cardiac checkup. Occasional mild fatigue reported after exercise.',
        'BP 120/80 mmHg, HR 72 bpm, regular rhythm. S1 and S2 normal, no murmurs.',
        'Cardiovascular screening - normal baseline profile',
        'stable',
        'Prescribed preventive dietary modifications. Advised 30 min daily aerobic walking.',
        'Normal physical findings. Fasting blood sugar and lipid panels ordered.',
        'Follow up in 3 months with repeat lipid panel.',
        DATE_SUB(NOW(), INTERVAL 3 HOUR), DATE_SUB(NOW(), INTERVAL 2 HOUR))
    `, [apt1.insertId]);

    // Vitals for Consultation 1
    await connection.query(`
      INSERT INTO consultation_vitals (consultation_id, patient_id, systolic_bp, diastolic_bp, pulse_rate, temperature, respiratory_rate, oxygen_saturation, height_cm, weight_kg, bmi, recorded_by)
      VALUES (?, 430, 120, 80, 72, 98.4, 16, 99, 178.0, 74.5, 23.5, 40)
    `, [cons1.insertId]);

    // Prescription for Consultation 1
    const [rx1] = await connection.query(`
      INSERT INTO prescriptions (consultation_id, appointment_id, patient_id, doctor_id, hospital_id, prescription_number, general_instructions)
      VALUES (?, ?, 430, 39, 1, 'RX-20261028-0001', 'Take medication after dinner. Follow up in 3 months.')
    `, [cons1.insertId, apt1.insertId]);
    await connection.query(`
      INSERT INTO prescription_items (prescription_id, medicine_name, dosage, form, frequency, duration, timing, instructions)
      VALUES (?, 'Atorvastatin 10mg', '1 tablet', 'Tablet', 'Once daily at bedtime', '30 days', 'after_food', 'Take after evening meal')
    `, [rx1.insertId]);

    // Appointment 2: Maria Santos (Scheduled tomorrow with Dr. Sarah Jenkins)
    await connection.query(`
      INSERT INTO appointments (appointment_number, hospital_id, patient_id, doctor_id, department_id, appointment_date, appointment_time, appointment_type, appointment_mode, status, reason, queue_number)
      VALUES ('APT-20261029-0002', 1, 447, 39, ?, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '10:00:00', 'follow_up', 'in_person', 'confirmed', 'Cardiology post-admission follow up and review', 'Q-102')
    `, [cardioDeptId]);

    // Appointment 3: Eleanor Vance (Scheduled tomorrow with Dr. Liam Patel)
    await connection.query(`
      INSERT INTO appointments (appointment_number, hospital_id, patient_id, doctor_id, department_id, appointment_date, appointment_time, appointment_type, appointment_mode, status, reason, queue_number)
      VALUES ('APT-20261029-0003', 1, 431, 429, ?, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '11:30:00', 'consultation', 'in_person', 'confirmed', 'General wellness checkup and blood sugar evaluation', 'Q-103')
    `, [genDeptId]);

    // Appointment 4: Robert Chen (Checked in right now for Dr. Marcus Reed)
    await connection.query(`
      INSERT INTO appointments (appointment_number, hospital_id, patient_id, doctor_id, department_id, appointment_date, appointment_time, appointment_type, appointment_mode, status, reason, queue_number, check_in_time)
      VALUES ('APT-20261028-0004', 1, 432, 428, ?, CURDATE(), '14:30:00', 'consultation', 'in_person', 'in_waiting', 'Right knee pain after sports activity', 'Q-104', NOW())
    `, [orthoDeptId]);
    console.log('✔ Seeded genuine appointments, consultation notes, vitals and prescription');

    // 8. Seed Hospital Lab Tests & Pricing
    console.log('\n--- 8. Assigning Standard Tests to Hospitals ---');
    const hospitalPricesH1 = [
      { id: 1, price: 250.00 },   // CBC
      { id: 2, price: 120.00 },   // FBS
      { id: 3, price: 120.00 },   // PPBS
      { id: 4, price: 450.00 },   // HbA1c
      { id: 5, price: 600.00 },   // Lipid Profile
      { id: 6, price: 750.00 },   // LFT
      { id: 7, price: 700.00 },   // KFT
      { id: 8, price: 350.00 },   // TSH
      { id: 9, price: 150.00 },   // Urine
      { id: 10, price: 400.00 },  // Electrolytes
      { id: 11, price: 500.00 },  // Chest X-Ray
      { id: 12, price: 300.00 },  // ECG
      { id: 13, price: 1200.00 }, // Ultrasound
      { id: 14, price: 950.00 },  // Troponin
      { id: 15, price: 200.00 }   // Uric Acid
    ];

    for (const hp of hospitalPricesH1) {
      await connection.query(`
        INSERT INTO hospital_lab_tests (hospital_id, master_test_id, price, status)
        VALUES (1, ?, ?, 'active')
        ON DUPLICATE KEY UPDATE price = VALUES(price), status = 'active'
      `, [hp.id, hp.price]);

      // Also assign to Hospital 2 (St. Jude)
      await connection.query(`
        INSERT INTO hospital_lab_tests (hospital_id, master_test_id, price, status)
        VALUES (2, ?, ?, 'active')
        ON DUPLICATE KEY UPDATE price = VALUES(price), status = 'active'
      `, [hp.id, hp.price]);
    }
    console.log('✔ Configured all 15 active lab tests for Demo General Hospital and St. Jude');

    // 9. Seed Realistic Investigation Requests & Lab Reports
    console.log('\n--- 9. Seeding Realistic Investigation Orders & Reports ---');
    
    // Sample PDF helper
    function createMockPdf(title, patientName, testName, resultSummary) {
      const content = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 250 >> stream
BT
/F1 16 Tf
50 720 Td (${title}) Tj
/F1 12 Tf
0 -30 Td (Patient Name: ${patientName}) Tj
0 -20 Td (Test Conducted: ${testName}) Tj
0 -20 Td (Facility: Demo General Hospital Laboratory) Tj
0 -30 Td (Summary Findings:) Tj
0 -20 Td (${resultSummary}) Tj
ET
endstream
endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000228 00000 n 
0000000530 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
605
%%EOF`;
      return Buffer.from(content);
    }

    // Order 1: Maria Santos - Lipid Profile (Completed with Report)
    const [ord1] = await connection.query(`
      INSERT INTO investigation_requests (order_number, hospital_id, patient_id, doctor_id, master_test_id, test_name, test_category, priority, clinical_notes, price, payment_status, status, sample_collected_at, completed_at, created_at)
      VALUES ('ORD-2026-0001', 1, 447, 39, 5, 'Lipid Profile (Cholesterol, HDL, LDL, TG)', 'Biochemistry', 'routine', 'Cardiovascular risk evaluation following emergency observation', 600.00, 'paid', 'completed', DATE_SUB(NOW(), INTERVAL 8 HOUR), DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 10 HOUR))
    `);
    const ord1Id = ord1.insertId;

    // Payment for Order 1
    await connection.query(`
      INSERT INTO lab_payments (order_id, patient_id, hospital_id, amount, payment_method, payment_status, receipt_number, notes, collected_by)
      VALUES (?, 447, 1, 600.00, 'cash', 'paid', 'RCP-20261028-0001', 'Reception desk payment received in full', 40)
    `, [ord1Id]);

    // Report for Order 1
    const pdf1Data = createMockPdf('CLINICAL LABORATORY DIAGNOSTIC REPORT', 'Maria Santos', 'Lipid Profile', 'Total Cholesterol: 185 mg/dL (Normal: <200), HDL: 48 mg/dL, LDL: 110 mg/dL, Triglycerides: 135 mg/dL.');
    const pdf1Name = 'lab-rpt-maria-santos-lipid.pdf';
    const pdf1Path = path.join(uploadDir, pdf1Name);
    fs.writeFileSync(pdf1Path, pdf1Data);
    const hash1 = crypto.createHash('sha256').update(pdf1Data).digest('hex');

    await connection.query(`
      INSERT INTO lab_reports (order_id, patient_id, hospital_id, report_number, storage_key, original_filename, file_size, mime_type, file_hash, version, uploaded_by, status, notes)
      VALUES (?, 447, 1, 'RPT-20261028-0001-V1', ?, 'Lipid_Profile_Report_MariaSantos.pdf', ?, 'application/pdf', ?, 1, 40, 'final', 'Cholesterol panel within normal clinical thresholds.')
    `, [ord1Id, pdf1Name, pdf1Data.length, hash1]);

    // Order 2: Harshil Undhad - ECG 12-Lead Standard (Completed with Report)
    const [ord2] = await connection.query(`
      INSERT INTO investigation_requests (order_number, hospital_id, patient_id, doctor_id, master_test_id, test_name, test_category, priority, clinical_notes, price, payment_status, status, sample_collected_at, completed_at, created_at)
      VALUES ('ORD-2026-0002', 1, 430, 39, 12, 'ECG 12-Lead Standard', 'Cardiology', 'routine', 'Annual cardiac tracing checkup', 300.00, 'paid', 'completed', DATE_SUB(NOW(), INTERVAL 3 HOUR), DATE_SUB(NOW(), INTERVAL 1 HOUR), DATE_SUB(NOW(), INTERVAL 4 HOUR))
    `);
    const ord2Id = ord2.insertId;

    // Payment for Order 2
    await connection.query(`
      INSERT INTO lab_payments (order_id, patient_id, hospital_id, amount, payment_method, payment_status, receipt_number, notes, collected_by)
      VALUES (?, 430, 1, 300.00, 'upi', 'paid', 'RCP-20261028-0002', 'Digital patient portal online settlement', 40)
    `, [ord2Id]);

    // Report for Order 2
    const pdf2Data = createMockPdf('12-LEAD ELECTROCARDIOGRAM REPORT', 'Harshil Undhad', 'ECG 12-Lead Standard', 'Normal Sinus Rhythm at 72 BPM. PR Interval: 142 ms, QRS Duration: 88 ms. No acute ST-T changes.');
    const pdf2Name = 'lab-rpt-harshil-undhad-ecg.pdf';
    const pdf2Path = path.join(uploadDir, pdf2Name);
    fs.writeFileSync(pdf2Path, pdf2Data);
    const hash2 = crypto.createHash('sha256').update(pdf2Data).digest('hex');

    await connection.query(`
      INSERT INTO lab_reports (order_id, patient_id, hospital_id, report_number, storage_key, original_filename, file_size, mime_type, file_hash, version, uploaded_by, status, notes)
      VALUES (?, 430, 1, 'RPT-20261028-0002-V1', ?, 'ECG_Tracing_HarshilUndhad.pdf', ?, 'application/pdf', ?, 1, 40, 'final', 'Normal sinus rhythm confirmed.')
    `, [ord2Id, pdf2Name, pdf2Data.length, hash2]);

    // Order 3: Eleanor Vance - Complete Blood Count (Sample Collected, In Analysis)
    const [ord3] = await connection.query(`
      INSERT INTO investigation_requests (order_number, hospital_id, patient_id, doctor_id, master_test_id, test_name, test_category, priority, clinical_notes, price, payment_status, status, sample_collected_at, created_at)
      VALUES ('ORD-2026-0003', 1, 431, 429, 1, 'Complete Blood Count (CBC)', 'Hematology', 'routine', 'Evaluation for mild anemia and fatigue', 250.00, 'paid', 'sample_collected', DATE_SUB(NOW(), INTERVAL 45 MINUTE), DATE_SUB(NOW(), INTERVAL 2 HOUR))
    `);
    await connection.query(`
      INSERT INTO lab_payments (order_id, patient_id, hospital_id, amount, payment_method, payment_status, receipt_number, notes, collected_by)
      VALUES (?, 431, 1, 250.00, 'card', 'paid', 'RCP-20261028-0003', 'POS Terminal Visa Card Payment', 40)
    `, [ord3.insertId]);

    // Order 4: Robert Chen - Fasting Blood Sugar (Pending Sample Collection, Unpaid)
    await connection.query(`
      INSERT INTO investigation_requests (order_number, hospital_id, patient_id, doctor_id, master_test_id, test_name, test_category, priority, clinical_notes, price, payment_status, status, created_at)
      VALUES ('ORD-2026-0004', 1, 432, 428, 2, 'Fasting Blood Sugar (FBS)', 'Biochemistry', 'routine', 'Pre-operative glycemic screening prior to knee arthroscopy', 120.00, 'unpaid', 'requested', DATE_SUB(NOW(), INTERVAL 1 HOUR))
    `);

    // Order 5: Amina Yusuf - Thyroid Stimulating Hormone (In Progress)
    const [ord5] = await connection.query(`
      INSERT INTO investigation_requests (order_number, hospital_id, patient_id, doctor_id, master_test_id, test_name, test_category, priority, clinical_notes, price, payment_status, status, sample_collected_at, created_at)
      VALUES ('ORD-2026-0005', 1, 433, 429, 8, 'Thyroid Stimulating Hormone (TSH)', 'Endocrinology', 'routine', 'Routine endocrine monitoring for thyroid function', 350.00, 'paid', 'in_progress', DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 3 HOUR))
    `);
    await connection.query(`
      INSERT INTO lab_payments (order_id, patient_id, hospital_id, amount, payment_method, payment_status, receipt_number, notes, collected_by)
      VALUES (?, 433, 1, 350.00, 'upi', 'paid', 'RCP-20261028-0004', 'UPI QR Code scan at reception desk', 40)
    `, [ord5.insertId]);
    console.log('✔ Seeded 5 genuine clinical investigation orders with receipts and PDF reports');

    // 10. Clean Audit Logs & Notifications
    console.log('\n--- 10. Cleaning Audit Logs & Notifications ---');
    await connection.query(`DELETE FROM notifications WHERE recipient_user_id NOT IN (${userIdsPlaceholder})`);
    await connection.query(`DELETE FROM audit_logs WHERE actor_id NOT IN (${userIdsPlaceholder}) OR details LIKE "%179%"`);
    console.log('✔ Cleaned audit log entries and notifications');

    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('\n✔ Re-enabled foreign key checks');
    console.log('====================================================');
    console.log('       DATA RESTORATION COMPLETED SUCCESSFULLY      ');
    console.log('====================================================');
  } catch (err) {
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    console.error('❌ Error during cleanup:', err);
    throw err;
  } finally {
    connection.release();
    await pool.end();
  }
}

cleanAndSeedGenuineData().catch(console.error);
