require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pool = require('../db');

async function seedLiveTodayData() {
  console.log("=================================================");
  console.log("  SEEDING COMPREHENSIVE REAL-TIME DATA (TODAY)   ");
  console.log("=================================================\n");

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const hospitalId = 1;
    const staffId = 40; // Robert Vance
    const today = new Date().toISOString().slice(0, 10);
    const nowTimestamp = new Date();

    // 1. Ensure Doctors have full profiles and schedules
    console.log("--- 1. Setting up Doctors & Schedules ---");
    const doctors = [
      { id: 39, name: "Dr. Sarah Jenkins", deptId: 23, spec: "Cardiology", lic: "MED-CARD-8821" },
      { id: 428, name: "Dr. Marcus Reed", deptId: 86, spec: "Orthopedics", lic: "MED-ORTH-4412" },
      { id: 429, name: "Dr. Liam Patel", deptId: 1, spec: "General Medicine", lic: "MED-GEN-9930" },
    ];

    for (const d of doctors) {
      await conn.query(
        `UPDATE users SET department_id = ?, hospital_id = ?, role_id = 3 WHERE id = ?`,
        [d.deptId, hospitalId, d.id]
      );

      const [dp] = await conn.query(`SELECT user_id FROM doctor_profiles WHERE user_id = ?`, [d.id]);
      if (dp.length === 0) {
        await conn.query(
          `INSERT INTO doctor_profiles (user_id, specialization, license_number, consultation_fee, experience_years, bio)
           VALUES (?, ?, ?, 500.00, 10, 'Attending clinical specialist.')`,
          [d.id, d.spec, d.lic]
        );
      } else {
        await conn.query(
          `UPDATE doctor_profiles SET specialization = ?, license_number = ?, consultation_fee = 500.00 WHERE user_id = ?`,
          [d.spec, d.lic, d.id]
        );
      }

      // Add doctor schedules for all 7 days of week
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      for (const day of days) {
        await conn.query(
          `INSERT INTO doctor_schedules (doctor_id, hospital_id, day_of_week, start_time, end_time, slot_duration_minutes, is_available)
           VALUES (?, ?, ?, '09:00:00', '17:00:00', 15, 1)
           ON DUPLICATE KEY UPDATE is_available = 1, start_time = '09:00:00', end_time = '17:00:00'`,
          [d.id, hospitalId, day]
        );
      }
    }
    console.log("✔ 3 Doctors active with departmental profiles and 7-day schedules.");

    // 2. Ensure Patients exist in users and patient_profiles
    console.log("\n--- 2. Setting up Patients ---");
    const patientUsers = [
      { id: 430, name: "Undhad Harshil", email: "harshil.patient@hospital.com", phone: "+91-9876500101", gender: "male" },
      { id: 431, name: "Eleanor Vance", email: "eleanor.v@hospital.com", phone: "+91-9876500102", gender: "female" },
      { id: 432, name: "Robert Chen", email: "robert.c@hospital.com", phone: "+91-9876500103", gender: "male" },
      { id: 447, name: "Maria Santos", email: "maria.s@hospital.com", phone: "+91-9876500104", gender: "female" },
      { id: 448, name: "Amit Shah", email: "amit.shah@hospital.com", phone: "+91-9876500105", gender: "male" },
      { id: 449, name: "Sneha Joshi", email: "sneha.j@hospital.com", phone: "+91-9876500106", gender: "female" },
      { id: 450, name: "Vikram Verma", email: "vikram.v@hospital.com", phone: "+91-9876500107", gender: "male" },
      { id: 451, name: "Ananya Desai", email: "ananya.d@hospital.com", phone: "+91-9876500108", gender: "female" },
      { id: 452, name: "Rajesh Gupta", email: "rajesh.g@hospital.com", phone: "+91-9876500109", gender: "male" },
      { id: 453, name: "Neha Kulkarni", email: "neha.k@hospital.com", phone: "+91-9876500110", gender: "female" },
    ];

    for (const p of patientUsers) {
      await conn.query(
        `INSERT INTO users (id, full_name, email, password_hash, role_id, hospital_id, phone, status)
         VALUES (?, ?, ?, 'demo_hash_secure_dummy', 5, 1, ?, 'active')
         ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), phone = VALUES(phone), role_id = 5, hospital_id = 1, status = 'active'`,
        [p.id, p.name, p.email, p.phone]
      );

      const [pp] = await conn.query(`SELECT user_id FROM patient_profiles WHERE user_id = ?`, [p.id]);
      if (pp.length === 0) {
        await conn.query(
          `INSERT INTO patient_profiles (user_id, gender, blood_group, emergency_contact_phone)
           VALUES (?, ?, 'B+', ?)`,
          [p.id, p.gender, p.phone]
        );
      }
    }
    console.log(`✔ ${patientUsers.length} patients registered.`);

    // 3. Populate 10-Stage Pipeline Appointments for TODAY
    console.log("\n--- 3. Seeding Today's 10-Stage Pipeline Appointments ---");
    const timeStr = Date.now().toString().slice(-5);

    const pipelineData = [
      // Stage 1: Appointment Booked (Confirmed, upcoming)
      {
        patientId: 448, doctorId: 39, deptId: 23, time: "15:00:00",
        status: "confirmed", queueNo: null, checkIn: null, stage: 1, label: "Appointment Booked"
      },
      {
        patientId: 453, doctorId: 429, deptId: 1, time: "16:00:00",
        status: "confirmed", queueNo: null, checkIn: null, stage: 1, label: "Appointment Booked"
      },

      // Stage 2: Check-In (arrived at reception)
      {
        patientId: 449, doctorId: 429, deptId: 1, time: "12:15:00",
        status: "confirmed", queueNo: null, checkIn: `${today} 12:15:00`, stage: 2, label: "Patient Checked-In"
      },

      // Stage 3: Waiting in OPD lobby
      {
        patientId: 432, doctorId: 428, deptId: 86, time: "12:00:00",
        status: "in_waiting", queueNo: "Q-101", checkIn: `${today} 11:50:00`, stage: 3, label: "Waiting in Lobby"
      },
      {
        patientId: 431, doctorId: 39, deptId: 23, time: "12:30:00",
        status: "in_waiting", queueNo: "Q-102", checkIn: `${today} 12:05:00`, stage: 3, label: "Waiting in Lobby"
      },

      // Stage 4: In Consultation
      {
        patientId: 451, doctorId: 39, deptId: 23, time: "11:30:00",
        status: "in_progress", queueNo: "Q-100", checkIn: `${today} 11:20:00`, stage: 4, label: "In Consultation"
      },

      // Stage 5: Diagnostics / Laboratory
      {
        patientId: 452, doctorId: 429, deptId: 1, time: "10:30:00",
        status: "in_progress", queueNo: "Q-098", checkIn: `${today} 10:15:00`, stage: 5, label: "Laboratory Investigation"
      },

      // Stage 6: Prescription Issued
      {
        patientId: 450, doctorId: 39, deptId: 23, time: "10:00:00",
        status: "in_progress", queueNo: "Q-097", checkIn: `${today} 09:45:00`, stage: 6, label: "Prescription Issued"
      },

      // Stage 7: Invoicing / Billing Pending
      {
        patientId: 447, doctorId: 428, deptId: 86, time: "09:30:00",
        status: "in_progress", queueNo: "Q-095", checkIn: `${today} 09:15:00`, stage: 7, label: "Billing & Payment"
      },

      // Stage 8: Pharmacy Formulary Queue
      {
        patientId: 430, doctorId: 429, deptId: 1, time: "09:00:00",
        status: "in_progress", queueNo: "Q-093", checkIn: `${today} 08:45:00`, stage: 8, label: "Pharmacy Queue"
      },

      // Stage 9: Medicine Dispensing
      {
        patientId: 448, doctorId: 428, deptId: 86, time: "08:30:00",
        status: "in_progress", queueNo: "Q-091", checkIn: `${today} 08:15:00`, stage: 9, label: "Medicine Dispensing"
      },

      // Stage 10: Completed & Discharged
      {
        patientId: 430, doctorId: 39, deptId: 23, time: "08:00:00",
        status: "completed", queueNo: "Q-089", checkIn: `${today} 07:45:00`, stage: 10, label: "Encounter Completed"
      },
      {
        patientId: 431, doctorId: 429, deptId: 1, time: "08:15:00",
        status: "completed", queueNo: "Q-090", checkIn: `${today} 08:00:00`, stage: 10, label: "Encounter Completed"
      },
    ];

    for (let i = 0; i < pipelineData.length; i++) {
      const p = pipelineData[i];
      const apptNum = `APT-${today.replace(/-/g, "")}-${timeStr}-${String(i + 1).padStart(2, "0")}`;

      const [res] = await conn.query(
        `INSERT INTO appointments (
          appointment_number, hospital_id, patient_id, doctor_id, department_id,
          appointment_date, appointment_time, status, queue_number, check_in_time
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          apptNum, hospitalId, p.patientId, p.doctorId, p.deptId,
          today, p.time, p.status, p.queueNo, p.checkIn
        ]
      );
      const apptId = res.insertId;

      // Stage 4+: Create consultation
      if (p.stage >= 4) {
        const [cRes] = await conn.query(
          `INSERT INTO consultations (
            appointment_id, patient_id, doctor_id, hospital_id, diagnosis,
            clinical_notes, status, started_at, submitted_at
          ) VALUES (?, ?, ?, ?, 'Clinical Assessment & Workup', 'Patient reviewed. Standard medical protocol followed.', ?, ?, ?)`,
          [
            apptId, p.patientId, p.doctorId, hospitalId,
            p.stage === 10 ? 'submitted' : 'draft',
            p.checkIn || `${today} 09:00:00`,
            p.stage === 10 ? `${today} 09:30:00` : null
          ]
        );
        const consultId = cRes.insertId;

        // Stage 5: Lab request
        if (p.stage === 5) {
          const ordNum = `LAB-ORD-${today.replace(/-/g, "")}-${timeStr}-${String(i)}`;
          await conn.query(
            `INSERT INTO investigation_requests (
              order_number, hospital_id, appointment_id, patient_id, doctor_id, consultation_id,
              master_test_id, test_name, test_category, priority, status, clinical_notes, price, payment_status
            ) VALUES (?, ?, ?, ?, ?, ?, 1, 'Complete Blood Count (CBC)', 'Hematology', 'urgent', 'in_progress', 'STAT Complete Blood Count needed.', 350.00, 'unpaid')`,
            [ordNum, hospitalId, apptId, p.patientId, p.doctorId, consultId]
          );
        }

        // Stage 6+: Prescription
        if (p.stage >= 6) {
          const rxNum = `RX-${today.replace(/-/g, "")}-${timeStr}-${String(i)}`;
          const [rxRes] = await conn.query(
            `INSERT INTO prescriptions (
              prescription_number, hospital_id, appointment_id, patient_id, doctor_id,
              consultation_id, general_instructions, status
            ) VALUES (?, ?, ?, ?, ?, ?, 'Take medications after meals with plenty of water.', 'active')`,
            [rxNum, hospitalId, apptId, p.patientId, p.doctorId, consultId]
          );
          const rxId = rxRes.insertId;

          // Add a prescription item
          await conn.query(
            `INSERT INTO prescription_items (
              prescription_id, medicine_name, dosage, form, frequency, duration, timing, quantity
            ) VALUES (?, 'Amoxicillin 500mg', '500mg', 'Tablet', 'TID (3 times daily)', '5 days', 'after_food', 15)`,
            [rxId]
          );

          // Stage 7+: Consultation Bill
          if (p.stage >= 7) {
            const billNum = `CBILL-${today.replace(/-/g, "")}-${timeStr}-${String(i)}`;
            await conn.query(
              `INSERT INTO consultation_bills (
                bill_number, hospital_id, patient_id, doctor_id, appointment_id,
                consultation_id, fee_amount, total_amount, paid_amount, balance_due, status, created_by
              ) VALUES (?, ?, ?, ?, ?, ?, 500.00, 500.00, ?, ?, ?, ?)`,
              [
                billNum, hospitalId, p.patientId, p.doctorId, apptId, consultId,
                p.stage >= 9 ? 500.00 : 0.00,
                p.stage >= 9 ? 0.00 : 500.00,
                p.stage >= 9 ? 'paid' : 'pending',
                staffId
              ]
            );
          }

          // Stage 8+: Pharmacy Bill
          if (p.stage >= 8) {
            const pbNum = `PBILL-${today.replace(/-/g, "")}-${timeStr}-${String(i)}`;
            await conn.query(
              `INSERT INTO pharmacy_bills (
                bill_number, hospital_id, patient_id, prescription_id, purchase_type,
                subtotal, discount_amount, taxable_amount, gst_rate, gst_amount, grand_total,
                paid_amount, balance_due, status, created_by
              ) VALUES (?, ?, ?, ?, 'hospital', 350.00, 0.00, 350.00, 12.00, 42.00, 392.00, ?, ?, ?, ?)`,
              [
                pbNum, hospitalId, p.patientId, rxId,
                p.stage >= 9 ? 392.00 : 0.00,
                p.stage >= 9 ? 0.00 : 392.00,
                p.stage >= 9 ? 'paid' : 'pending',
                staffId
              ]
            );
          }

          // Stage 9+: Dispensation
          if (p.stage >= 9) {
            const dispNum = `DISP-${today.replace(/-/g, "")}-${timeStr}-${String(i)}`;
            await conn.query(
              `INSERT INTO pharmacy_dispensations (
                dispensation_number, hospital_id, patient_id, prescription_id,
                subtotal, total_amount, payment_status, payment_method, dispensed_by
              ) VALUES (?, ?, ?, ?, 392.00, 392.00, 'paid', 'cash', ?)`,
              [dispNum, hospitalId, p.patientId, rxId, staffId]
            );
          }
        }
      }
    }
    console.log(`✔ ${pipelineData.length} appointments populated covering all 10 workflow stages.`);

    // 4. Inpatient Wards and Spatial Beds Setup
    console.log("\n--- 4. Setting up Inpatient Beds & Admissions ---");
    // Free active bed assignments
    await conn.query(
      `UPDATE bed_assignments ba
       JOIN beds b ON ba.bed_id = b.id
       JOIN wards w ON b.ward_id = w.id
       SET ba.status = 'discharged', ba.released_at = NOW(), ba.released_by = ?
       WHERE w.hospital_id = ? AND ba.status = 'active'`,
      [staffId, hospitalId]
    );

    await conn.query(
      `UPDATE admissions SET status = 'discharged', discharged_at = NOW() WHERE hospital_id = ? AND status = 'admitted'`,
      [hospitalId]
    );

    await conn.query(
      `UPDATE beds b JOIN wards w ON b.ward_id = w.id
       SET b.status = 'available'
       WHERE w.hospital_id = ? AND b.status != 'maintenance'`,
      [hospitalId]
    );

    // Bed allocations (6 active admissions across CCU, General Inpatient, Surgical):
    const bedAdmissions = [
      { bedId: 49, patientId: 447, doctorId: 39, wardId: 1, deptId: 23, reason: "Acute Coronary Syndrome Monitoring" },
      { bedId: 50, patientId: 450, doctorId: 39, wardId: 1, deptId: 23, reason: "Post-Cardiac Angioplasty Observation" },
      { bedId: 55, patientId: 452, doctorId: 429, wardId: 2, deptId: 1, reason: "Pneumonia with Hypoxemia" },
      { bedId: 56, patientId: 448, doctorId: 429, wardId: 2, deptId: 1, reason: "Severe Gastroenteritis & Dehydration" },
      { bedId: 57, patientId: 449, doctorId: 429, wardId: 2, deptId: 1, reason: "Uncontrolled Type 2 Diabetes" },
      { bedId: 63, patientId: 432, doctorId: 428, wardId: 3, deptId: 86, reason: "Post-Operative ACL Reconstruction" },
    ];

    for (let i = 0; i < bedAdmissions.length; i++) {
      const b = bedAdmissions[i];
      const admNum = `ADM-${today.replace(/-/g, "")}-${timeStr}-${String(101 + i)}`;

      // Update bed status to occupied
      await conn.query(`UPDATE beds SET status = 'occupied' WHERE id = ?`, [b.bedId]);

      // Create admission
      const [admRes] = await conn.query(
        `INSERT INTO admissions (
          admission_number, hospital_id, patient_id, doctor_id, department_id,
          admission_date, reason, status, admitted_by
        ) VALUES (?, ?, ?, ?, ?, NOW(), ?, 'admitted', ?)`,
        [admNum, hospitalId, b.patientId, b.doctorId, b.deptId, b.reason, staffId]
      );
      const admId = admRes.insertId;

      // Create active bed assignment
      await conn.query(
        `INSERT INTO bed_assignments (
          bed_id, admission_id, patient_id, ward_id, hospital_id, assigned_at, status, assigned_by
        ) VALUES (?, ?, ?, ?, ?, NOW(), 'active', ?)`,
        [b.bedId, admId, b.patientId, b.wardId, hospitalId, staffId]
      );
    }
    console.log("✔ 6 Inpatient admissions active with bed_assignments across CCU, General, and Surgical Recovery wards (30% occupancy).");

    // 5. Additional Laboratory Investigation Orders
    console.log("\n--- 5. Setting up Diagnostic Laboratory Orders ---");
    const labOrders = [
      { patientId: 447, doctorId: 39, testId: 5, name: "Lipid Profile (Cholesterol, HDL, LDL, TG)", cat: "Biochemistry", priority: "stat", status: "in_progress", notes: "Emergency Troponin & Lipid Panel" },
      { patientId: 450, doctorId: 39, testId: 1, name: "Complete Blood Count (CBC)", cat: "Hematology", priority: "urgent", status: "requested", notes: "Daily Post-Op CBC" },
      { patientId: 452, doctorId: 429, testId: 7, name: "Kidney Function Test (KFT / RFT)", cat: "Biochemistry", priority: "routine", status: "requested", notes: "Kidney Function Evaluation" },
      { patientId: 448, doctorId: 429, testId: 10, name: "Serum Electrolytes (Na+, K+, Cl-)", cat: "Biochemistry", priority: "routine", status: "sample_collected", notes: "Electrolytes Panel" },
      { patientId: 430, doctorId: 429, testId: 2, name: "Fasting Blood Sugar (FBS)", cat: "Biochemistry", priority: "routine", status: "completed", notes: "Fasting Blood Sugar" },
    ];

    for (let i = 0; i < labOrders.length; i++) {
      const l = labOrders[i];
      const ordNum = `LAB-ORD-${today.replace(/-/g, "")}-${timeStr}-${String(100 + i)}`;
      await conn.query(
        `INSERT INTO investigation_requests (
          order_number, hospital_id, patient_id, doctor_id, master_test_id,
          test_name, test_category, priority, status, clinical_notes, price, payment_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 400.00, 'unpaid')`,
        [ordNum, hospitalId, l.patientId, l.doctorId, l.testId, l.name, l.cat, l.priority, l.status, l.notes]
      );
    }
    console.log("✔ 5 Diagnostic laboratory requests seeded (1 in-progress, 2 requested, 1 sample collected, 1 completed).");

    // 6. Ensure Low Stock Medicines with Minimum Stock Alert Levels
    console.log("\n--- 6. Setting up Pharmacy Stock Alert Thresholds ---");
    await conn.query(
      `UPDATE hospital_medicines SET min_stock_alert_level = 50 WHERE hospital_id = ? LIMIT 15`,
      [hospitalId]
    );

    // Set 6 batches to low stock (< min_stock_alert_level)
    await conn.query(
      `UPDATE medicine_batches SET current_quantity = 8 WHERE hospital_id = ? AND status = 'active' LIMIT 6`,
      [hospitalId]
    );

    // Set 4 batches to expire within 45 days
    await conn.query(
      `UPDATE medicine_batches SET expiry_date = DATE_ADD(CURDATE(), INTERVAL 25 DAY) WHERE hospital_id = ? AND status = 'active' LIMIT 4`,
      [hospitalId]
    );
    console.log("✔ Pharmacy stock alerts and expiring batches configured with realistic formulary thresholds.");

    await conn.commit();
    console.log("\n=================================================");
    console.log("  REAL-TIME CLINICAL & OPERATIONAL DATA SEEDED!  ");
    console.log("=================================================");
    process.exit(0);
  } catch (err) {
    await conn.rollback();
    console.error("Seeding error:", err);
    process.exit(1);
  } finally {
    conn.release();
  }
}

seedLiveTodayData();
