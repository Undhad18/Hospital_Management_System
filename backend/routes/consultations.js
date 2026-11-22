const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");
const { logAudit } = require("../services/auditService");
const { emitHospitalEvent } = require("../services/socketService");
const {
  notifyAppointmentCompleted,
  notifyFollowUpScheduled,
} = require("../services/notificationService");

const router = express.Router();
router.use(requireAuth);

/**
 * Helper: Fetch enriched appointment details for notification dispatch
 */
async function getAppointmentNotificationDetails(appointmentId) {
  const [rows] = await pool.execute(
    `SELECT a.*,
            DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
            h.name AS hospital_name,
            d.name AS department_name,
            doc.full_name AS doctor_name,
            doc.email AS doctor_email,
            pat.full_name AS patient_name,
            pat.email AS patient_email,
            pat.phone AS patient_phone
     FROM appointments a
     LEFT JOIN hospitals h ON h.id = a.hospital_id
     LEFT JOIN departments d ON d.id = a.department_id
     LEFT JOIN users doc ON doc.id = a.doctor_id
     LEFT JOIN users pat ON pat.id = a.patient_id
     WHERE a.id = ? LIMIT 1`,
    [appointmentId]
  );
  return rows[0] || null;
}

/**
 * Helper: Validate vital signs numeric ranges (Lesson 8.3)
 */
function validateVitalSigns(vitals) {
  const errors = [];
  if (!vitals || typeof vitals !== "object") return { valid: true, errors: [] };

  const {
    systolic_bp,
    diastolic_bp,
    pulse_rate,
    temperature,
    respiratory_rate,
    oxygen_saturation,
    height_cm,
    weight_kg,
  } = vitals;

  if (systolic_bp !== undefined && systolic_bp !== null && systolic_bp !== "") {
    const v = Number(systolic_bp);
    if (isNaN(v) || v < 50 || v > 260) {
      errors.push("Systolic BP must be a number between 50 and 260 mmHg.");
    }
  }

  if (diastolic_bp !== undefined && diastolic_bp !== null && diastolic_bp !== "") {
    const v = Number(diastolic_bp);
    if (isNaN(v) || v < 30 || v > 160) {
      errors.push("Diastolic BP must be a number between 30 and 160 mmHg.");
    }
  }

  if (pulse_rate !== undefined && pulse_rate !== null && pulse_rate !== "") {
    const v = Number(pulse_rate);
    if (isNaN(v) || v < 30 || v > 250) {
      errors.push("Pulse rate must be a number between 30 and 250 bpm.");
    }
  }

  if (temperature !== undefined && temperature !== null && temperature !== "") {
    const v = Number(temperature);
    if (isNaN(v) || v < 85.0 || v > 110.0) {
      errors.push("Temperature must be a number between 85.0°F and 110.0°F.");
    }
  }

  if (respiratory_rate !== undefined && respiratory_rate !== null && respiratory_rate !== "") {
    const v = Number(respiratory_rate);
    if (isNaN(v) || v < 5 || v > 60) {
      errors.push("Respiratory rate must be a number between 5 and 60 breaths/min.");
    }
  }

  if (oxygen_saturation !== undefined && oxygen_saturation !== null && oxygen_saturation !== "") {
    const v = Number(oxygen_saturation);
    if (isNaN(v) || v < 50 || v > 100) {
      errors.push("Oxygen saturation (SpO2) must be a number between 50% and 100%.");
    }
  }

  if (height_cm !== undefined && height_cm !== null && height_cm !== "") {
    const v = Number(height_cm);
    if (isNaN(v) || v < 30 || v > 250) {
      errors.push("Height must be a number between 30 and 250 cm.");
    }
  }

  if (weight_kg !== undefined && weight_kg !== null && weight_kg !== "") {
    const v = Number(weight_kg);
    if (isNaN(v) || v < 1 || v > 400) {
      errors.push("Weight must be a number between 1 and 400 kg.");
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Helper: Calculate BMI
 */
function calculateBmi(heightCm, weightKg) {
  if (!heightCm || !weightKg) return null;
  const hM = Number(heightCm) / 100;
  const wKg = Number(weightKg);
  if (hM <= 0 || wKg <= 0) return null;
  const bmi = wKg / (hM * hM);
  return Number(bmi.toFixed(1));
}

/**
 * Helper: Validate mandatory consultation fields (Lesson 8.2)
 */
function validateMandatoryFields(data) {
  const errors = [];
  const chief = (data.chief_complaint || "").trim();
  const exam = (data.examination_findings || "").trim();
  const diag = (data.diagnosis || "").trim();
  const plan = (data.treatment_plan || "").trim();

  if (!chief || chief.length < 3) {
    errors.push("Chief complaint is mandatory (minimum 3 characters).");
  }
  if (!exam || exam.length < 3) {
    errors.push("Clinical examination findings are mandatory (minimum 3 characters).");
  }
  if (!diag || diag.length < 2) {
    errors.push("Working or recorded diagnosis is mandatory (minimum 2 characters).");
  }
  if (!plan || plan.length < 3) {
    errors.push("Treatment plan is mandatory (minimum 3 characters).");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * ============================================================================
 * Lesson 8.4 & 8.5: Catalogs & Masters
 * GET /api/consultations/masters/medicines
 * GET /api/consultations/masters/lab-tests
 * ============================================================================
 */
router.get("/masters/medicines", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, generic_name, form, strength, category
       FROM master_medicines
       WHERE status = 'active'
       ORDER BY name ASC`
    );
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Master medicines error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve medicines catalog." });
  }
});

router.get("/masters/lab-tests", async (req, res) => {
  try {
    const { hospital_id } = req.query;
    const explicitHospitalId = hospital_id ? parseInt(hospital_id, 10) : null;

    let rows;
    if (explicitHospitalId) {
      const [hospRows] = await pool.query(
        `SELECT
           mlt.id,
           mlt.id AS master_test_id,
           hlt.id AS hospital_test_id,
           mlt.test_code,
           mlt.test_name,
           mlt.category,
           mlt.sample_type,
           mlt.standard_turnaround_hours,
           hlt.price,
           hlt.status AS offering_status
         FROM hospital_lab_tests hlt
         JOIN master_lab_tests mlt ON mlt.id = hlt.master_test_id
         WHERE hlt.hospital_id = ? AND hlt.status = 'active' AND mlt.status = 'active'
         ORDER BY mlt.category ASC, mlt.test_name ASC`,
        [explicitHospitalId]
      );
      rows = hospRows;
    } else {
      const userHospId = req.user && req.user.hospitalId ? parseInt(req.user.hospitalId, 10) : null;
      if (userHospId) {
        const [masterWithHospRows] = await pool.query(
          `SELECT
             mlt.id,
             mlt.id AS master_test_id,
             hlt.id AS hospital_test_id,
             mlt.test_code,
             mlt.test_name,
             mlt.category,
             mlt.sample_type,
             mlt.standard_turnaround_hours,
             COALESCE(hlt.price, 0.00) AS price,
             COALESCE(hlt.status, 'unassigned') AS offering_status
           FROM master_lab_tests mlt
           LEFT JOIN hospital_lab_tests hlt ON hlt.master_test_id = mlt.id AND hlt.hospital_id = ?
           WHERE mlt.status = 'active'
           ORDER BY mlt.category ASC, mlt.test_name ASC`,
          [userHospId]
        );
        rows = masterWithHospRows;
      } else {
        const [masterRows] = await pool.query(
          `SELECT
             id,
             id AS master_test_id,
             test_code,
             test_name,
             category,
             sample_type,
             standard_turnaround_hours,
             0.00 AS price
           FROM master_lab_tests
           WHERE status = 'active'
           ORDER BY category ASC, test_name ASC`
        );
        rows = masterRows;
      }
    }

    return res.json({ success: true, data: rows, hospital_id: explicitHospitalId });
  } catch (error) {
    console.error("Master lab tests error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve lab tests catalog." });
  }
});

/**
 * ============================================================================
 * Lesson 8.1: Starting Consultation from the Doctor Panel
 * POST /api/consultations/start
 * ============================================================================
 */
router.post("/start", async (req, res) => {
  const connection = await pool.getConnection();
  try {
    if (req.user.role !== "doctor") {
      return res.status(403).json({
        success: false,
        message: "Only authorized medical doctors can start a consultation.",
      });
    }

    const { appointment_id } = req.body || {};
    const appointmentId = Number(appointment_id);

    if (!appointmentId || isNaN(appointmentId) || appointmentId < 1) {
      return res.status(400).json({ success: false, message: "Valid appointment_id is required." });
    }

    // 1. Fetch appointment details
    const [apptRows] = await connection.execute(
      `SELECT id, appointment_number, patient_id, hospital_id, doctor_id, status,
              DATE_FORMAT(appointment_date, '%Y-%m-%d') AS appointment_date, appointment_time
       FROM appointments
       WHERE id = ? LIMIT 1`,
      [appointmentId]
    );

    if (!apptRows.length) {
      return res.status(404).json({ success: false, message: "Appointment record not found." });
    }

    const appt = apptRows[0];

    // 2. Doctor ownership validation
    if (Number(appt.doctor_id) !== Number(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "Access Denied: You cannot start a consultation for another doctor's appointment.",
      });
    }

    // 3. Appointment eligibility validation
    // Eligible statuses: 'in_waiting', 'in_progress', 'confirmed'
    const eligibleStatuses = ["in_waiting", "in_progress", "confirmed"];
    if (!eligibleStatuses.includes(appt.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot start consultation. Appointment is in '${appt.status}' status (must be confirmed or in waiting queue).`,
      });
    }

    await connection.beginTransaction();

    // 4. Check if consultation already exists
    const [existingConsultations] = await connection.execute(
      `SELECT * FROM consultations WHERE appointment_id = ? LIMIT 1 FOR UPDATE`,
      [appointmentId]
    );

    let consultation;
    if (existingConsultations.length > 0) {
      consultation = existingConsultations[0];
    } else {
      // Create new draft consultation
      const [insertRes] = await connection.execute(
        `INSERT INTO consultations
         (appointment_id, patient_id, doctor_id, hospital_id, status, started_at)
         VALUES (?, ?, ?, ?, 'draft', CURRENT_TIMESTAMP)`,
        [appointmentId, appt.patient_id, req.user.id, appt.hospital_id]
      );

      const consultationId = insertRes.insertId;
      const [created] = await connection.execute(
        `SELECT * FROM consultations WHERE id = ? LIMIT 1`,
        [consultationId]
      );
      consultation = created[0];
    }

    // 5. Update appointment status to in_progress if not already
    if (appt.status !== "in_progress") {
      await connection.execute(
        `UPDATE appointments
         SET status = 'in_progress', status_changed_by = ?,
             check_in_time = COALESCE(check_in_time, CURRENT_TIMESTAMP)
         WHERE id = ?`,
        [req.user.id, appointmentId]
      );

      await logAudit({
        actorId: req.user.id,
        action: "CONSULTATION_STARTED",
        targetType: "appointment",
        targetId: appointmentId,
        details: { consultation_id: consultation.id, previous_status: appt.status },
        ipAddress: req.ip,
      });
    }

    await connection.commit();

    emitHospitalEvent(consultation.hospital_id, "consultations:updated", {
      consultationId,
      appointmentId: consultation.appointment_id,
      status: "submitted",
      action: "submitted",
    });
    emitHospitalEvent(consultation.hospital_id, "appointments:updated", {
      appointmentId: consultation.appointment_id,
      status: "submitted",
    });

    return res.json({
      success: true,
      message: "Consultation successfully started.",
      data: consultation,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Start consultation error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to start consultation." });
  } finally {
    connection.release();
  }
});

/**
 * ============================================================================
 * GET /api/consultations/appointment/:appointmentId
 * Retrieves existing consultation for an appointment with all related clinical components.
 * ============================================================================
 */
router.get("/appointment/:appointmentId", async (req, res) => {
  try {
    const appointmentId = Number(req.params.appointmentId);
    if (!appointmentId || isNaN(appointmentId)) {
      return res.status(400).json({ success: false, message: "Invalid appointment ID." });
    }

    const [apptRows] = await pool.execute(
      `SELECT a.id, a.appointment_number, a.patient_id, a.doctor_id, a.hospital_id, a.status,
              a.appointment_date, a.appointment_time, a.reason, a.queue_number,
              pat.full_name AS patient_name, pat.email AS patient_email, pat.phone AS patient_phone,
              pp.gender, pp.blood_group, pp.dob, pp.allergies, pp.chronic_conditions, pp.past_medical_history,
              doc.full_name AS doctor_name,
              h.name AS hospital_name, d.name AS department_name
       FROM appointments a
       JOIN users pat ON pat.id = a.patient_id
       LEFT JOIN patient_profiles pp ON pp.user_id = pat.id
       JOIN users doc ON doc.id = a.doctor_id
       JOIN hospitals h ON h.id = a.hospital_id
       LEFT JOIN departments d ON d.id = a.department_id
       WHERE a.id = ? LIMIT 1`,
      [appointmentId]
    );

    if (!apptRows.length) {
      return res.status(404).json({ success: false, message: "Appointment not found." });
    }

    const appt = apptRows[0];

    // Authorization check
    if (req.user.role === "patient" && Number(appt.patient_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: "Access Denied: You can only view your own records." });
    }
    if (req.user.role === "doctor" && Number(appt.doctor_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: "Access Denied: You can only view your own assigned consultations." });
    }
    if ((req.user.role === "staff" || req.user.role === "hospital_admin") && Number(appt.hospital_id) !== Number(req.user.hospitalId)) {
      return res.status(403).json({ success: false, message: "Access Denied: Cross-hospital access forbidden." });
    }

    // Fetch consultation
    let [cRows] = await pool.execute(
      `SELECT * FROM consultations WHERE appointment_id = ? LIMIT 1`,
      [appointmentId]
    );

    let consultation = cRows[0] || null;

    // Auto-create consultation if missing for assigned doctor
    if (!consultation && req.user.role === "doctor" && Number(appt.doctor_id) === Number(req.user.id)) {
      const initialStatus = appt.status === "completed" ? "draft" : "draft";
      const [insertRes] = await pool.execute(
        `INSERT INTO consultations
         (appointment_id, patient_id, doctor_id, hospital_id, status, started_at, chief_complaint)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
        [appointmentId, appt.patient_id, req.user.id, appt.hospital_id, initialStatus, appt.reason || null]
      );
      const [newC] = await pool.execute(`SELECT * FROM consultations WHERE id = ? LIMIT 1`, [insertRes.insertId]);
      consultation = newC[0];
    }

    let vitals = null;
    let investigations = [];
    let prescription = null;
    let prescriptionItems = [];

    if (consultation) {
      // Vitals
      const [vRows] = await pool.execute(
        `SELECT * FROM consultation_vitals WHERE consultation_id = ? ORDER BY id DESC LIMIT 1`,
        [consultation.id]
      );
      vitals = vRows[0] || null;

      // Investigations
      const [iRows] = await pool.execute(
        `SELECT
           ir.id,
           ir.order_number,
           ir.consultation_id,
           ir.appointment_id,
           ir.patient_id,
           ir.doctor_id,
           ir.hospital_id,
           ir.master_test_id,
           ir.test_name,
           ir.test_category,
           ir.priority,
           ir.clinical_notes,
           ir.price,
           ir.payment_status,
           ir.status,
           ir.created_at,
           mlt.test_code,
           mlt.sample_type,
           mlt.standard_turnaround_hours
         FROM investigation_requests ir
         LEFT JOIN master_lab_tests mlt ON mlt.id = ir.master_test_id
         WHERE ir.consultation_id = ?
         ORDER BY ir.id ASC`,
        [consultation.id]
      );
      investigations = iRows;

      // Prescriptions
      const [pRows] = await pool.execute(
        `SELECT * FROM prescriptions WHERE consultation_id = ? ORDER BY id DESC LIMIT 1`,
        [consultation.id]
      );
      prescription = pRows[0] || null;

      if (prescription) {
        const [piRows] = await pool.execute(
          `SELECT * FROM prescription_items WHERE prescription_id = ? ORDER BY id ASC`,
          [prescription.id]
        );
        prescriptionItems = piRows;
      }
    }

    return res.json({
      success: true,
      data: {
        appointment: appt,
        consultation,
        vitals,
        investigations,
        prescription: prescription ? { ...prescription, items: prescriptionItems } : null,
      },
    });
  } catch (error) {
    console.error("Fetch consultation by appointment error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve consultation details." });
  }
});

/**
 * Helper: Sync clinical subcomponents (vitals, investigations, prescriptions)
 */
async function syncClinicalSubComponents(connection, consultationId, consultation, doctorId, vitals, investigations, prescription) {
  // Update or insert vitals if provided
  if (vitals && typeof vitals === "object") {
    const bmi = calculateBmi(vitals.height_cm, vitals.weight_kg);

    const [existingV] = await connection.execute(
      `SELECT id FROM consultation_vitals WHERE consultation_id = ? LIMIT 1`,
      [consultationId]
    );

    if (existingV.length > 0) {
      await connection.execute(
        `UPDATE consultation_vitals
         SET systolic_bp = ?, diastolic_bp = ?, pulse_rate = ?, temperature = ?,
             respiratory_rate = ?, oxygen_saturation = ?, height_cm = ?, weight_kg = ?,
             bmi = ?, recorded_by = ?
         WHERE id = ?`,
        [
          vitals.systolic_bp !== "" && vitals.systolic_bp !== undefined ? Number(vitals.systolic_bp) : null,
          vitals.diastolic_bp !== "" && vitals.diastolic_bp !== undefined ? Number(vitals.diastolic_bp) : null,
          vitals.pulse_rate !== "" && vitals.pulse_rate !== undefined ? Number(vitals.pulse_rate) : null,
          vitals.temperature !== "" && vitals.temperature !== undefined ? Number(vitals.temperature) : null,
          vitals.respiratory_rate !== "" && vitals.respiratory_rate !== undefined ? Number(vitals.respiratory_rate) : null,
          vitals.oxygen_saturation !== "" && vitals.oxygen_saturation !== undefined ? Number(vitals.oxygen_saturation) : null,
          vitals.height_cm !== "" && vitals.height_cm !== undefined ? Number(vitals.height_cm) : null,
          vitals.weight_kg !== "" && vitals.weight_kg !== undefined ? Number(vitals.weight_kg) : null,
          bmi,
          doctorId,
          existingV[0].id,
        ]
      );
    } else {
      await connection.execute(
        `INSERT INTO consultation_vitals
         (consultation_id, patient_id, systolic_bp, diastolic_bp, pulse_rate, temperature,
          respiratory_rate, oxygen_saturation, height_cm, weight_kg, bmi, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          consultationId,
          consultation.patient_id,
          vitals.systolic_bp !== "" && vitals.systolic_bp !== undefined ? Number(vitals.systolic_bp) : null,
          vitals.diastolic_bp !== "" && vitals.diastolic_bp !== undefined ? Number(vitals.diastolic_bp) : null,
          vitals.pulse_rate !== "" && vitals.pulse_rate !== undefined ? Number(vitals.pulse_rate) : null,
          vitals.temperature !== "" && vitals.temperature !== undefined ? Number(vitals.temperature) : null,
          vitals.respiratory_rate !== "" && vitals.respiratory_rate !== undefined ? Number(vitals.respiratory_rate) : null,
          vitals.oxygen_saturation !== "" && vitals.oxygen_saturation !== undefined ? Number(vitals.oxygen_saturation) : null,
          vitals.height_cm !== "" && vitals.height_cm !== undefined ? Number(vitals.height_cm) : null,
          vitals.weight_kg !== "" && vitals.weight_kg !== undefined ? Number(vitals.weight_kg) : null,
          bmi,
          doctorId,
        ]
      );
    }
  }

  // Sync Investigation requests if provided (Lesson 11.4: Hospital test selection & price snapshotting)
  if (Array.isArray(investigations)) {
    // 1. Fetch existing investigations for this consultation
    const [existingInvRows] = await connection.execute(
      `SELECT id, order_number, master_test_id, test_name, status, price
       FROM investigation_requests
       WHERE consultation_id = ?`,
      [consultationId]
    );

    // Keep track of 'requested' orders so we can update or remove them,
    // while NEVER touching orders that progressed to sample_collected, in_progress, completed, etc.
    const existingRequestedMap = new Map();
    for (const row of existingInvRows) {
      if (row.status === "requested") {
        const key = row.master_test_id
          ? `id_${row.master_test_id}`
          : `name_${(row.test_name || "").toLowerCase().trim()}`;
        existingRequestedMap.set(key, row);
      }
    }

    const processedKeys = new Set();

    for (const inv of investigations) {
      const rawName = (inv.test_name || "").trim();
      const rawMasterId = inv.master_test_id ? Number(inv.master_test_id) : null;
      if (!rawName && !rawMasterId) continue;

      // Duplicate prevention within the same consultation
      const dedupKey = rawMasterId ? `id_${rawMasterId}` : `name_${rawName.toLowerCase()}`;
      if (processedKeys.has(dedupKey)) continue;
      processedKeys.add(dedupKey);

      let masterTestId = rawMasterId;
      let finalTestName = rawName;
      let finalCategory = inv.test_category || "General";
      let priceSnapshot = 0.0;

      // Query hospital_lab_tests for this consultation's hospital
      if (masterTestId) {
        const [offeringRows] = await connection.execute(
          `SELECT hlt.price, mlt.id AS m_id, mlt.test_code, mlt.test_name, mlt.category
           FROM hospital_lab_tests hlt
           JOIN master_lab_tests mlt ON mlt.id = hlt.master_test_id
           WHERE hlt.hospital_id = ? AND hlt.master_test_id = ?
           LIMIT 1`,
          [consultation.hospital_id, masterTestId]
        );
        if (offeringRows.length > 0) {
          const off = offeringRows[0];
          masterTestId = off.m_id;
          finalTestName = off.test_name;
          finalCategory = off.category || finalCategory;
          priceSnapshot = parseFloat(off.price) || 0.0;
        }
      } else {
        const [offeringRows] = await connection.execute(
          `SELECT hlt.price, mlt.id AS m_id, mlt.test_code, mlt.test_name, mlt.category
           FROM hospital_lab_tests hlt
           JOIN master_lab_tests mlt ON mlt.id = hlt.master_test_id
           WHERE hlt.hospital_id = ? AND (LOWER(mlt.test_name) = LOWER(?) OR LOWER(mlt.test_code) = LOWER(?))
           LIMIT 1`,
          [consultation.hospital_id, rawName, rawName]
        );
        if (offeringRows.length > 0) {
          const off = offeringRows[0];
          masterTestId = off.m_id;
          finalTestName = off.test_name;
          finalCategory = off.category || finalCategory;
          priceSnapshot = parseFloat(off.price) || 0.0;
        } else {
          const [mRows] = await connection.execute(
            `SELECT id, test_name, category FROM master_lab_tests WHERE LOWER(test_name) = LOWER(?) OR LOWER(test_code) = LOWER(?) LIMIT 1`,
            [rawName, rawName]
          );
          if (mRows.length > 0) {
            masterTestId = mRows[0].id;
            finalTestName = mRows[0].test_name;
            finalCategory = mRows[0].category || finalCategory;
          }
        }
      }

      const priority = ["routine", "urgent", "stat"].includes(inv.priority) ? inv.priority : "routine";
      const notes = inv.clinical_notes ? inv.clinical_notes.trim() : null;

      const existingMatch = existingRequestedMap.get(dedupKey);

      if (existingMatch) {
        await connection.execute(
          `UPDATE investigation_requests
           SET master_test_id = ?, test_name = ?, test_category = ?, priority = ?, clinical_notes = ?, price = ?
           WHERE id = ?`,
          [masterTestId, finalTestName, finalCategory, priority, notes, priceSnapshot, existingMatch.id]
        );
        existingRequestedMap.delete(dedupKey);
      } else {
        const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        const randomPart = Math.floor(1000 + Math.random() * 9000);
        const orderNumber = `LAB-${datePart}-${randomPart}`;

        await connection.execute(
          `INSERT INTO investigation_requests
             (order_number, consultation_id, appointment_id, patient_id, doctor_id, hospital_id,
              master_test_id, test_name, test_category, priority, clinical_notes, price, payment_status, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', 'requested')`,
          [
            orderNumber,
            consultationId,
            consultation.appointment_id,
            consultation.patient_id,
            doctorId,
            consultation.hospital_id,
            masterTestId,
            finalTestName,
            finalCategory,
            priority,
            notes,
            priceSnapshot,
          ]
        );
      }
    }

    for (const [_, toDelete] of existingRequestedMap) {
      await connection.execute(
        `DELETE FROM investigation_requests WHERE id = ? AND status = 'requested'`,
        [toDelete.id]
      );
    }
  }

  // Sync Prescriptions & items if provided
  if (prescription && typeof prescription === "object") {
    let rxId;
    const rxStatus = consultation.status === "submitted" || prescription.status === "active" ? "active" : "draft";

    const [existingRx] = await connection.execute(
      `SELECT id, status FROM prescriptions WHERE consultation_id = ? LIMIT 1`,
      [consultationId]
    );

    if (existingRx.length > 0) {
      rxId = existingRx[0].id;
      // Do not downgrade active/dispensed to draft if already activated
      const currentStatus = existingRx[0].status;
      const targetStatus = (currentStatus === "active" || currentStatus === "partially_dispensed" || currentStatus === "dispensed")
        ? currentStatus
        : rxStatus;

      await connection.execute(
        `UPDATE prescriptions SET general_instructions = ?, status = ? WHERE id = ?`,
        [prescription.general_instructions || null, targetStatus, rxId]
      );
    } else {
      const rxNumber = `RX-${Date.now().toString().slice(-6)}-${consultationId}`;
      const [rxRes] = await connection.execute(
        `INSERT INTO prescriptions
         (consultation_id, appointment_id, patient_id, doctor_id, hospital_id, prescription_number, general_instructions, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          consultationId,
          consultation.appointment_id,
          consultation.patient_id,
          doctorId,
          consultation.hospital_id,
          rxNumber,
          prescription.general_instructions || null,
          rxStatus,
        ]
      );
      rxId = rxRes.insertId;

      await connection.execute(
        `INSERT INTO prescription_status_history (prescription_id, from_status, to_status, changed_by, reason)
         VALUES (?, NULL, ?, ?, 'Prescription initialized during consultation')`,
        [rxId, rxStatus, doctorId]
      ).catch(() => {});
    }

    // Sync items
    if (Array.isArray(prescription.items)) {
      await connection.execute(
        `DELETE FROM prescription_items WHERE prescription_id = ? AND dispensed_quantity = 0`,
        [rxId]
      );

      for (const item of prescription.items) {
        const medName = (item.medicine_name || "").trim();
        if (medName) {
          let medId = item.medicine_id ? parseInt(item.medicine_id, 10) : null;
          if (!medId) {
            const [mRows] = await connection.execute(
              "SELECT id FROM master_medicines WHERE LOWER(TRIM(name)) = ? LIMIT 1",
              [medName.toLowerCase()]
            );
            if (mRows.length > 0) medId = mRows[0].id;
          }

          await connection.execute(
            `INSERT INTO prescription_items
             (prescription_id, medicine_id, medicine_name, dosage, form, frequency, duration, timing, quantity, instructions, dispensed_quantity)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            [
              rxId,
              medId,
              medName,
              item.dosage || "As directed",
              item.form || "Tablet",
              item.frequency || "1-0-1",
              item.duration || "5 Days",
              ["before_food", "after_food", "with_food", "anytime"].includes(item.timing)
                ? item.timing
                : "after_food",
              item.quantity ? Number(item.quantity) : null,
              item.instructions || null,
            ]
          );
        }
      }
    }
  }
}

/**
 * ============================================================================
 * Lesson 8.2 & 8.3 & 8.4 & 8.5 & 8.6: Save Consultation Draft
 * PUT /api/consultations/:id
 * ============================================================================
 */
router.put("/:id", async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const consultationId = Number(req.params.id);
    if (!consultationId || isNaN(consultationId)) {
      return res.status(400).json({ success: false, message: "Invalid consultation ID." });
    }

    // 1. Fetch consultation
    const [cRows] = await connection.execute(
      `SELECT * FROM consultations WHERE id = ? LIMIT 1`,
      [consultationId]
    );

    if (!cRows.length) {
      return res.status(404).json({ success: false, message: "Consultation not found." });
    }

    const consultation = cRows[0];

    // 2. Authorization: Only the assigned doctor can edit
    if (req.user.role !== "doctor" || Number(consultation.doctor_id) !== Number(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "Access Denied: Only the assigned consulting doctor can edit this consultation.",
      });
    }

    // 3. Immutability guard: Once submitted, cannot be arbitrarily modified via draft endpoint
    if (consultation.status === "submitted") {
      return res.status(400).json({
        success: false,
        message: "Cannot modify a finalized/submitted clinical consultation.",
      });
    }

    const {
      chief_complaint,
      symptoms,
      examination_findings,
      diagnosis,
      patient_condition = "stable",
      treatment_plan,
      clinical_notes,
      advice,
      admission_recommended = false,
      admission_notes,
      vitals,
      investigations,
      prescription,
    } = req.body || {};

    // Validate vitals numeric formats if provided
    if (vitals) {
      const vResult = validateVitalSigns(vitals);
      if (!vResult.valid) {
        return res.status(400).json({
          success: false,
          message: "Vital signs validation failed.",
          errors: vResult.errors,
        });
      }
    }

    await connection.beginTransaction();

    // 4. Update clinical consultation fields
    await connection.execute(
      `UPDATE consultations
       SET chief_complaint = ?, symptoms = ?, examination_findings = ?, diagnosis = ?,
           patient_condition = ?, treatment_plan = ?, clinical_notes = ?, advice = ?,
           admission_recommended = ?, admission_notes = ?
       WHERE id = ?`,
      [
        chief_complaint || null,
        symptoms || null,
        examination_findings || null,
        diagnosis || null,
        ["stable", "improving", "critical", "guarded", "fair"].includes(patient_condition)
          ? patient_condition
          : "stable",
        treatment_plan || null,
        clinical_notes || null,
        advice || null,
        Boolean(admission_recommended),
        admission_notes || null,
        consultationId,
      ]
    );

    // 5. Sync vitals, investigations, and prescriptions
    await syncClinicalSubComponents(
      connection,
      consultationId,
      consultation,
      req.user.id,
      vitals,
      investigations,
      prescription
    );

    await connection.commit();

    emitHospitalEvent(consultation.hospital_id, "consultations:updated", {
      consultationId,
      appointmentId: consultation.appointment_id,
      status: "submitted",
      action: "submitted",
    });
    emitHospitalEvent(consultation.hospital_id, "appointments:updated", {
      appointmentId: consultation.appointment_id,
      status: "submitted",
    });

    return res.json({
      success: true,
      message: "Consultation draft successfully saved.",
    });
  } catch (error) {
    await connection.rollback();
    console.error("Save consultation draft error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to save consultation draft." });
  } finally {
    connection.release();
  }
});

/**
 * ============================================================================
 * Lesson 8.8 & 8.10: Submit Consultation (Finalize Clinical Record)
 * POST /api/consultations/:id/submit
 * ============================================================================
 */
router.post("/:id/submit", async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const consultationId = Number(req.params.id);
    if (!consultationId || isNaN(consultationId)) {
      return res.status(400).json({ success: false, message: "Invalid consultation ID." });
    }

    const [cRows] = await connection.execute(
      `SELECT * FROM consultations WHERE id = ? LIMIT 1 FOR UPDATE`,
      [consultationId]
    );

    if (!cRows.length) {
      return res.status(404).json({ success: false, message: "Consultation not found." });
    }

    const consultation = cRows[0];

    // Authorization
    if (req.user.role !== "doctor" || Number(consultation.doctor_id) !== Number(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "Access Denied: Only the assigned consulting doctor can submit this consultation.",
      });
    }

    if (consultation.status === "submitted") {
      return res.status(400).json({
        success: false,
        message: "This consultation has already been submitted.",
      });
    }

    // Merge incoming body updates with existing consultation data for validation
    const candidateData = {
      ...consultation,
      ...(req.body || {}),
    };

    const mandResult = validateMandatoryFields(candidateData);
    if (!mandResult.valid) {
      return res.status(400).json({
        success: false,
        message: "Mandatory clinical fields are missing.",
        errors: mandResult.errors,
      });
    }

    await connection.beginTransaction();

    await connection.execute(
      `UPDATE consultations
       SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP,
           chief_complaint = ?, symptoms = ?, examination_findings = ?, diagnosis = ?,
           patient_condition = ?, treatment_plan = ?, clinical_notes = ?, advice = ?,
           admission_recommended = ?, admission_notes = ?
       WHERE id = ?`,
      [
        candidateData.chief_complaint,
        candidateData.symptoms || null,
        candidateData.examination_findings,
        candidateData.diagnosis,
        candidateData.patient_condition || "stable",
        candidateData.treatment_plan,
        candidateData.clinical_notes || null,
        candidateData.advice || null,
        Boolean(candidateData.admission_recommended),
        candidateData.admission_notes || null,
        consultationId,
      ]
    );

    // Sync vitals, investigations, and prescriptions if present
    if (candidateData.vitals || candidateData.investigations || candidateData.prescription) {
      await syncClinicalSubComponents(
        connection,
        consultationId,
        consultation,
        req.user.id,
        candidateData.vitals,
        candidateData.investigations,
        candidateData.prescription
      );
    }

    await logAudit({
      actorId: req.user.id,
      action: "CONSULTATION_SUBMITTED",
      targetType: "consultation",
      targetId: consultationId,
      details: {
        appointment_id: consultation.appointment_id,
        diagnosis: candidateData.diagnosis,
        admission_recommended: candidateData.admission_recommended,
      },
      ipAddress: req.ip,
    });

    await connection.commit();

    emitHospitalEvent(consultation.hospital_id, "consultations:updated", {
      consultationId,
      appointmentId: consultation.appointment_id,
      status: "submitted",
      action: "submitted",
    });
    emitHospitalEvent(consultation.hospital_id, "appointments:updated", {
      appointmentId: consultation.appointment_id,
      status: "submitted",
    });

    return res.json({
      success: true,
      message: "Consultation successfully submitted.",
      consultation_id: consultationId,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Submit consultation error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to submit consultation." });
  } finally {
    connection.release();
  }
});

/**
 * ============================================================================
 * Lesson 8.8 & 8.10: Atomic Submit Consultation & Complete Appointment
 * POST /api/consultations/:id/submit-and-complete
 * ============================================================================
 */
router.post("/:id/submit-and-complete", async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const consultationId = Number(req.params.id);
    if (!consultationId || isNaN(consultationId)) {
      return res.status(400).json({ success: false, message: "Invalid consultation ID." });
    }

    const [cRows] = await connection.execute(
      `SELECT * FROM consultations WHERE id = ? LIMIT 1 FOR UPDATE`,
      [consultationId]
    );

    if (!cRows.length) {
      return res.status(404).json({ success: false, message: "Consultation not found." });
    }

    const consultation = cRows[0];

    // Authorization
    if (req.user.role !== "doctor" || Number(consultation.doctor_id) !== Number(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "Access Denied: Only the assigned consulting doctor can submit and complete this appointment.",
      });
    }

    const candidateData = {
      ...consultation,
      ...(req.body || {}),
    };

    // Mandatory fields check
    const mandResult = validateMandatoryFields(candidateData);
    if (!mandResult.valid) {
      return res.status(400).json({
        success: false,
        message: "Cannot complete appointment: Mandatory consultation fields are missing.",
        errors: mandResult.errors,
      });
    }

    await connection.beginTransaction();

    // 1. Submit consultation
    await connection.execute(
      `UPDATE consultations
       SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP,
           chief_complaint = ?, symptoms = ?, examination_findings = ?, diagnosis = ?,
           patient_condition = ?, treatment_plan = ?, clinical_notes = ?, advice = ?,
           admission_recommended = ?, admission_notes = ?
       WHERE id = ?`,
      [
        candidateData.chief_complaint,
        candidateData.symptoms || null,
        candidateData.examination_findings,
        candidateData.diagnosis,
        candidateData.patient_condition || "stable",
        candidateData.treatment_plan,
        candidateData.clinical_notes || null,
        candidateData.advice || null,
        Boolean(candidateData.admission_recommended),
        candidateData.admission_notes || null,
        consultationId,
      ]
    );

    // Sync vitals, investigations, and prescriptions if provided
    await syncClinicalSubComponents(
      connection,
      consultationId,
      consultation,
      req.user.id,
      candidateData.vitals,
      candidateData.investigations,
      candidateData.prescription
    );

    // 2. Complete appointment (Notice: even if admission_recommended = true, the outpatient
    // appointment is marked completed without auto-admitting or assigning bed; Lesson 8.10)
    await connection.execute(
      `UPDATE appointments
       SET status = 'completed', status_changed_by = ?
       WHERE id = ?`,
      [req.user.id, consultation.appointment_id]
    );

    await logAudit({
      actorId: req.user.id,
      action: "CONSULTATION_SUBMITTED_AND_COMPLETED",
      targetType: "appointment",
      targetId: consultation.appointment_id,
      details: {
        consultation_id: consultationId,
        admission_recommended: candidateData.admission_recommended,
      },
      ipAddress: req.ip,
    });

    await connection.commit();

    emitHospitalEvent(consultation.hospital_id, "consultations:updated", {
      consultationId,
      appointmentId: consultation.appointment_id,
      status: "completed",
      action: "completed",
    });
    emitHospitalEvent(consultation.hospital_id, "appointments:updated", {
      appointmentId: consultation.appointment_id,
      status: "completed",
    });

    // 3. Trigger completion notification safely (failures do not undo database commit)
    getAppointmentNotificationDetails(consultation.appointment_id)
      .then((enriched) => {
        if (!enriched || !enriched.patient_email) return;
        notifyAppointmentCompleted({
          appointment: enriched,
          patient: { id: enriched.patient_id, full_name: enriched.patient_name, email: enriched.patient_email },
          doctor: { id: enriched.doctor_id, full_name: enriched.doctor_name, email: enriched.doctor_email },
          hospital: { name: enriched.hospital_name },
        }).catch((err) => console.warn("Completion notification error:", err.message));
      })
      .catch((err) => console.warn("Enriched details error:", err.message));

    return res.json({
      success: true,
      message: "Consultation successfully submitted and appointment completed.",
      consultation_id: consultationId,
      appointment_id: consultation.appointment_id,
      status: "completed",
    });
  } catch (error) {
    await connection.rollback();
    console.error("Submit and complete error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to finalize consultation and appointment." });
  } finally {
    connection.release();
  }
});

/**
 * ============================================================================
 * Lesson 8.9: Consultation History and Patient Treatment Records
 * GET /api/consultations/patient/:patientId/history
 * ============================================================================
 */
router.get("/patient/:patientId/history", async (req, res) => {
  try {
    const patientId = Number(req.params.patientId);
    if (!patientId || isNaN(patientId)) {
      return res.status(400).json({ success: false, message: "Invalid patient ID." });
    }

    // Role-based authorization:
    // Patient can only see their own history
    if (req.user.role === "patient" && Number(req.user.id) !== patientId) {
      return res.status(403).json({
        success: false,
        message: "Access Denied: You do not have permission to view another patient's clinical history.",
      });
    }

    // Verify patient exists
    const [patRows] = await pool.execute(
      `SELECT u.id, u.full_name, u.email, u.phone, u.hospital_id,
              pp.gender, pp.blood_group, pp.dob, pp.allergies, pp.chronic_conditions
       FROM users u
       LEFT JOIN patient_profiles pp ON pp.user_id = u.id
       WHERE u.id = ? LIMIT 1`,
      [patientId]
    );

    if (!patRows.length) {
      return res.status(404).json({ success: false, message: "Patient not found." });
    }

    const patient = patRows[0];

    // Hospital data isolation for doctors and staff
    let sql = `
      SELECT c.*,
             DATE_FORMAT(c.started_at, '%Y-%m-%d %H:%i:%s') AS formatted_started_at,
             DATE_FORMAT(c.submitted_at, '%Y-%m-%d %H:%i:%s') AS formatted_submitted_at,
             a.appointment_number,
             DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
             a.appointment_time, a.status AS appointment_status,
             doc.full_name AS doctor_name,
             h.name AS hospital_name,
             d.name AS department_name
      FROM consultations c
      JOIN appointments a ON a.id = c.appointment_id
      JOIN users doc ON doc.id = c.doctor_id
      JOIN hospitals h ON h.id = c.hospital_id
      LEFT JOIN departments d ON d.id = a.department_id
      WHERE c.patient_id = ?
    `;
    const params = [patientId];

    if (req.user.role === "doctor" || req.user.role === "staff" || req.user.role === "hospital_admin") {
      sql += " AND c.hospital_id = ?";
      params.push(req.user.hospitalId);
    }

    sql += " ORDER BY c.started_at DESC, c.id DESC";

    const [consultations] = await pool.execute(sql, params);

    // Fetch vitals, lab requests and prescriptions for each consultation
    const enriched = [];
    for (const c of consultations) {
      const [vRows] = await pool.execute(
        `SELECT * FROM consultation_vitals WHERE consultation_id = ? ORDER BY id DESC LIMIT 1`,
        [c.id]
      );
      const [invRows] = await pool.execute(
        `SELECT * FROM investigation_requests WHERE consultation_id = ? ORDER BY id ASC`,
        [c.id]
      );
      const [rxRows] = await pool.execute(
        `SELECT * FROM prescriptions WHERE consultation_id = ? ORDER BY id DESC LIMIT 1`,
        [c.id]
      );

      let prescription = rxRows[0] || null;
      if (prescription) {
        const [items] = await pool.execute(
          `SELECT * FROM prescription_items WHERE prescription_id = ? ORDER BY id ASC`,
          [prescription.id]
        );
        prescription.items = items;
      }

      enriched.push({
        ...c,
        vitals: vRows[0] || null,
        investigations: invRows,
        prescription,
      });
    }

    return res.json({
      success: true,
      count: enriched.length,
      patient: {
        id: patient.id,
        full_name: patient.full_name,
        gender: patient.gender,
        blood_group: patient.blood_group,
        dob: patient.dob,
        allergies: patient.allergies,
        chronic_conditions: patient.chronic_conditions,
      },
      data: enriched,
    });
  } catch (error) {
    console.error("Fetch patient consultation history error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve patient consultation history." });
  }
});

module.exports = router;
