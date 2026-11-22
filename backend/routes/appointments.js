const express = require("express");
const pool = require("../db");
const { requireAuth, allowRoles } = require("../middleware/auth");
const { logAudit } = require("../services/auditService");
const {
  notifyBookingReceived,
  notifyBookingConfirmed,
  notifyAppointmentCancelled,
  notifyAppointmentRescheduled,
  notifyAppointmentCompleted,
  notifyFollowUpScheduled,
} = require("../services/notificationService");
const { emitHospitalEvent } = require("../services/socketService");

const router = express.Router();
router.use(requireAuth);

/**
 * Helper: Fetch enriched appointment details for notification dispatching (Module 7)
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
 * Helper: Validate that doctor belongs to the specified hospital and department
 */
async function validateDoctorBelongsToDepartmentAndHospital(poolClient, doctorId, departmentId, hospitalId) {
  if (!doctorId || !departmentId || !hospitalId) {
    return {
      valid: false,
      message: "hospital_id, department_id, and doctor_id are all required.",
    };
  }

  const [rows] = await poolClient.execute(
    `SELECT u.id, u.full_name, u.email, u.phone, u.status, u.hospital_id, u.department_id,
            dp.consultation_fee, dp.specialization, dp.qualifications, dp.experience_years
     FROM users u
     JOIN roles r ON r.id = u.role_id AND r.name = 'doctor'
     LEFT JOIN doctor_profiles dp ON dp.user_id = u.id
     WHERE u.id = ? LIMIT 1`,
    [doctorId]
  );

  if (!rows || rows.length === 0) {
    return { valid: false, message: "Doctor not found or user is not a doctor." };
  }

  const doctor = rows[0];

  if (doctor.status !== "active") {
    return { valid: false, message: "Doctor account is not active." };
  }

  if (Number(doctor.hospital_id) !== Number(hospitalId)) {
    return {
      valid: false,
      message: "Doctor does not belong to the selected hospital.",
    };
  }

  if (Number(doctor.department_id) !== Number(departmentId)) {
    return {
      valid: false,
      message: "Doctor does not belong to the selected department.",
    };
  }

  return { valid: true, doctor };
}

/**
 * Lesson 6.1 — Step 1: Hospital Selection
 * GET /api/appointments/hospitals
 * Returns active hospitals for selection.
 */
router.get("/hospitals", async (req, res) => {
  try {
    let sql = `
      SELECT
        h.id, h.name, h.code, h.email, h.phone, h.address,
        h.postal_code, h.city_id, h.logo_url, h.working_hours,
        h.status,
        c.name AS city_name,
        s.name AS state_name
      FROM hospitals h
      LEFT JOIN cities c ON c.id = h.city_id
      LEFT JOIN states s ON s.id = c.state_id
    `;
    const params = [];

    if (req.user.role === "hospital_admin" || req.user.role === "staff") {
      if (!req.user.hospitalId) {
        return res.status(403).json({
          success: false,
          message: "No hospital assigned to user account.",
        });
      }
      sql += " WHERE h.id = ?";
      params.push(req.user.hospitalId);
    } else {
      sql += " WHERE h.status = 'active'";
    }

    sql += " ORDER BY h.name ASC";

    const [hospitals] = await pool.execute(sql, params);

    return res.json({
      success: true,
      count: hospitals.length,
      data: hospitals,
    });
  } catch (error) {
    console.error("List appointment hospitals error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve hospitals.",
    });
  }
});

/**
 * Lesson 6.1 — Step 2: Department Selection (Filtered by Hospital)
 * GET /api/appointments/departments?hospital_id=1
 * Reject if hospital_id missing.
 */
router.get("/departments", async (req, res) => {
  try {
    const { hospital_id } = req.query;

    if (!hospital_id || isNaN(Number(hospital_id)) || Number(hospital_id) < 1) {
      return res.status(400).json({
        success: false,
        message: "hospital_id is required. Hospital must be selected first.",
      });
    }

    const hospitalId = Number(hospital_id);

    // If hospital_admin or staff, verify they only access their own hospital
    if (
      (req.user.role === "hospital_admin" || req.user.role === "staff") &&
      Number(req.user.hospitalId) !== hospitalId
    ) {
      return res.status(403).json({
        success: false,
        message: "Access restricted to your assigned hospital.",
      });
    }

    // Verify hospital exists and is active
    const [hospRows] = await pool.execute(
      "SELECT id, name FROM hospitals WHERE id = ? AND status = 'active' LIMIT 1",
      [hospitalId]
    );

    if (!hospRows.length) {
      return res.status(404).json({
        success: false,
        message: "Selected hospital not found or inactive.",
      });
    }

    const [departments] = await pool.execute(
      `SELECT d.id, d.hospital_id, d.name, d.description, d.status,
              md.name AS master_department_name
       FROM departments d
       LEFT JOIN master_departments md ON md.id = d.master_department_id
       WHERE d.hospital_id = ? AND d.status = 'active'
       ORDER BY d.name ASC`,
      [hospitalId]
    );

    return res.json({
      success: true,
      hospital: hospRows[0],
      count: departments.length,
      data: departments,
    });
  } catch (error) {
    console.error("List appointment departments error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve departments.",
    });
  }
});

/**
 * Lesson 6.1 — Step 3: Doctor Selection (Filtered by Hospital AND Department)
 * GET /api/appointments/doctors?hospital_id=1&department_id=2
 * Doctor cannot be selected without selecting hospital and department first.
 * Details include: name, specialization, qualification, experience, fee, available days/hours.
 */
router.get("/doctors", async (req, res) => {
  try {
    const { hospital_id, department_id } = req.query;

    if (!hospital_id || isNaN(Number(hospital_id)) || Number(hospital_id) < 1) {
      return res.status(400).json({
        success: false,
        message: "hospital_id is required. Hospital must be selected first.",
      });
    }

    if (!department_id || isNaN(Number(department_id)) || Number(department_id) < 1) {
      return res.status(400).json({
        success: false,
        message: "department_id is required. Department must be selected first.",
      });
    }

    const hospitalId = Number(hospital_id);
    const departmentId = Number(department_id);

    // Role check if staff/hospital_admin
    if (
      (req.user.role === "hospital_admin" || req.user.role === "staff") &&
      Number(req.user.hospitalId) !== hospitalId
    ) {
      return res.status(403).json({
        success: false,
        message: "Access restricted to your assigned hospital.",
      });
    }

    // Verify department belongs to the hospital and is active
    const [deptRows] = await pool.execute(
      "SELECT id, name, hospital_id FROM departments WHERE id = ? AND hospital_id = ? AND status = 'active' LIMIT 1",
      [departmentId, hospitalId]
    );

    if (!deptRows.length) {
      return res.status(400).json({
        success: false,
        message: "Department does not belong to the selected hospital or is inactive.",
      });
    }

    // Fetch doctors belonging to both hospital and department
    const [doctors] = await pool.execute(
      `SELECT
         u.id,
         u.full_name,
         u.email,
         u.phone,
         u.hospital_id,
         u.department_id,
         des.name AS designation_name,
         dp.specialization,
         dp.qualifications,
         dp.experience_years,
         dp.consultation_fee,
         dp.bio
       FROM users u
       JOIN roles r ON r.id = u.role_id AND r.name = 'doctor'
       LEFT JOIN designations des ON des.id = u.designation_id
       LEFT JOIN doctor_profiles dp ON dp.user_id = u.id
       WHERE u.hospital_id = ? AND u.department_id = ? AND u.status = 'active'
       ORDER BY u.full_name ASC`,
      [hospitalId, departmentId]
    );

    // Attach doctor schedules to each doctor
    const doctorIds = doctors.map((d) => d.id);
    let schedulesMap = {};

    if (doctorIds.length > 0) {
      const placeholders = doctorIds.map(() => "?").join(",");
      const [scheduleRows] = await pool.execute(
        `SELECT doctor_id, day_of_week, start_time, end_time, slot_duration_minutes,
                break_start, break_end, is_available
         FROM doctor_schedules
         WHERE doctor_id IN (${placeholders}) AND is_available = TRUE
         ORDER BY FIELD(day_of_week, 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'), start_time ASC`,
        doctorIds
      );

      for (const s of scheduleRows) {
        if (!schedulesMap[s.doctor_id]) {
          schedulesMap[s.doctor_id] = [];
        }
        schedulesMap[s.doctor_id].push(s);
      }
    }

    const formattedDoctors = doctors.map((doc) => {
      const docSchedules = schedulesMap[doc.id] || [];
      const daySummary = docSchedules.length > 0
        ? docSchedules.map((s) => `${s.day_of_week.toUpperCase().slice(0, 3)}: ${s.start_time.slice(0, 5)}-${s.end_time.slice(0, 5)}`).join(", ")
        : "Standard Hospital Shift (09:00 - 17:00)";

      return {
        id: doc.id,
        name: doc.full_name,
        email: doc.email,
        phone: doc.phone,
        hospital_id: doc.hospital_id,
        department_id: doc.department_id,
        designation: doc.designation_name || "Doctor",
        specialization: doc.specialization || "General Medicine",
        qualification: doc.qualifications || "MBBS",
        experience: doc.experience_years ? `${doc.experience_years} years` : "Experienced",
        experience_years: doc.experience_years || 0,
        consultation_fee: Number(doc.consultation_fee || 0),
        bio: doc.bio || "",
        available_days_hours: daySummary,
        schedules: docSchedules,
      };
    });

    return res.json({
      success: true,
      hospital_id: hospitalId,
      department_id: departmentId,
      count: formattedDoctors.length,
      data: formattedDoctors,
    });
  } catch (error) {
    console.error("List appointment doctors error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve doctors.",
    });
  }
});

/**
 * Lesson 6.1 — Cross-Validation Endpoint
 * POST /api/appointments/validate-selection
 * Validates that doctor belongs to selected hospital and department.
 */
router.post("/validate-selection", async (req, res) => {
  try {
    const { hospital_id, department_id, doctor_id } = req.body || {};

    const validation = await validateDoctorBelongsToDepartmentAndHospital(
      pool,
      doctor_id,
      department_id,
      hospital_id
    );

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        valid: false,
        message: validation.message,
      });
    }

    return res.json({
      success: true,
      valid: true,
      message: "Doctor, department, and hospital selection is valid.",
      doctor: {
        id: validation.doctor.id,
        name: validation.doctor.full_name,
        specialization: validation.doctor.specialization,
        consultation_fee: validation.doctor.consultation_fee,
      },
    });
  } catch (error) {
    console.error("Selection validation error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Validation check failed.",
    });
  }
});

const {
  computeDoctorAvailableSlots,
  validateDoctorBookingSlot,
} = require("../services/scheduleService");

/**
 * Lesson 6.2 — Slot Computation in Appointments Router
 * GET /api/appointments/doctors/:id/available-slots?date=YYYY-MM-DD
 */
router.get("/doctors/:id/available-slots", async (req, res) => {
  try {
    const doctorId = Number(req.params.id);
    const { date } = req.query;

    if (!Number.isSafeInteger(doctorId) || doctorId < 1) {
      return res.status(400).json({ success: false, message: "Invalid doctor ID." });
    }

    if (!date) {
      return res.status(400).json({ success: false, message: "date parameter is required (YYYY-MM-DD)." });
    }

    const result = await computeDoctorAvailableSlots(pool, doctorId, date);
    if (!result.success) {
      return res.status(result.status || 400).json(result);
    }

    return res.json({
      ...result,
      data: result.available_slots || [],
    });
  } catch (error) {
    console.error("Appointment doctor available slots error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to compute available slots." });
  }
});

/**
 * ============================================================================
 * Helper Utilities for Module 6 Appointment System
 * ============================================================================
 */

function generateAppointmentNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `APT-${year}${month}${day}-${rand}`;
}

const { parseTimeToMinutes } = require("../services/scheduleService");

function validateBookingWindow(appointmentDateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayYear = today.getFullYear();
  const todayMonth = String(today.getMonth() + 1).padStart(2, "0");
  const todayDay = String(today.getDate()).padStart(2, "0");
  const todayStr = `${todayYear}-${todayMonth}-${todayDay}`;

  if (appointmentDateStr < todayStr) {
    return { valid: false, message: "Appointment date cannot be in the past." };
  }

  // 3 calendar months calculation
  const maxDate = new Date(today);
  maxDate.setMonth(maxDate.getMonth() + 3);
  const maxYear = maxDate.getFullYear();
  const maxMonth = String(maxDate.getMonth() + 1).padStart(2, "0");
  const maxDay = String(maxDate.getDate()).padStart(2, "0");
  const maxDateStr = `${maxYear}-${maxMonth}-${maxDay}`;

  if (appointmentDateStr > maxDateStr) {
    return {
      valid: false,
      message: `Appointment booking is restricted to a maximum 3-month window (up to ${maxDateStr}).`,
    };
  }

  return { valid: true };
}

function isLessThanFourHoursAhead(appointmentDateStr, appointmentTimeStr) {
  const mins = parseTimeToMinutes(appointmentTimeStr) || 0;
  const h = String(Math.floor(mins / 60)).padStart(2, "0");
  const m = String(mins % 60).padStart(2, "0");
  const aptDate = new Date(`${appointmentDateStr}T${h}:${m}:00`);
  const diffMs = aptDate.getTime() - Date.now();
  const diffHours = diffMs / (1000 * 60 * 60);
  return diffHours < 4;
}

const VALID_TYPES = ["routine_checkup", "consultation", "follow_up", "emergency"];
const VALID_MODES = ["in_person", "video_consultation"];
const VALID_STATUSES = ["pending", "confirmed", "rejected", "in_waiting", "in_progress", "completed", "cancelled", "admitted"];

const ALLOWED_TRANSITIONS = {
  pending: ["confirmed", "rejected", "cancelled"],
  confirmed: ["in_waiting", "in_progress", "cancelled"],
  in_waiting: ["in_progress", "cancelled"],
  in_progress: ["completed", "admitted", "in_waiting"],
  completed: [],
  cancelled: [],
  rejected: [],
  admitted: ["completed"],
};

/**
 * ============================================================================
 * Lesson 6.3 & 6.4: Appointment Booking by Patients and Staff
 * POST /api/appointments
 * ============================================================================
 */
router.post("/", async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const {
      hospital_id,
      department_id,
      doctor_id,
      patient_id,
      appointment_date,
      appointment_time,
      appointment_type = "consultation",
      appointment_mode = "in_person",
      reason = "",
      payment_method = "cash",
      follow_up_to_id = null,
      initial_status,
    } = req.body || {};

    // 1. Mandatory Parameters Validation
    if (!hospital_id || !department_id || !doctor_id || !appointment_date || !appointment_time) {
      return res.status(400).json({
        success: false,
        message: "hospital_id, department_id, doctor_id, appointment_date, and appointment_time are required.",
      });
    }

    if (!VALID_TYPES.includes(appointment_type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid appointment_type. Must be one of: ${VALID_TYPES.join(", ")}.`,
      });
    }

    if (!VALID_MODES.includes(appointment_mode)) {
      return res.status(400).json({
        success: false,
        message: `Invalid appointment_mode. Must be one of: ${VALID_MODES.join(", ")}.`,
      });
    }

    // 2. Lesson 6.11: 3-Month Booking Window & Future-Date Validation
    const windowValidation = validateBookingWindow(appointment_date);
    if (!windowValidation.valid) {
      return res.status(400).json({ success: false, message: windowValidation.message });
    }

    // 3. Lesson 6.1: Cross-validate Doctor belongs to selected Hospital & Department
    const docValidation = await validateDoctorBelongsToDepartmentAndHospital(
      connection,
      doctor_id,
      department_id,
      hospital_id
    );
    if (!docValidation.valid) {
      return res.status(400).json({ success: false, message: docValidation.message });
    }

    // 4. Lesson 6.2: Validate Doctor availability slot & working hours
    const slotValidation = await validateDoctorBookingSlot(
      connection,
      doctor_id,
      appointment_date,
      appointment_time
    );
    if (!slotValidation.valid) {
      return res.status(400).json({ success: false, message: slotValidation.message });
    }

    // 5. Patient Determination & Staff Booking (Lesson 6.4)
    let targetPatientId;
    let bookedByStaffId = null;

    if (req.user.role === "patient") {
      targetPatientId = req.user.id;

      // Check mandatory profile completion for patients
      const [pRows] = await connection.execute(
        `SELECT pp.is_profile_completed FROM users u
         LEFT JOIN patient_profiles pp ON pp.user_id = u.id
         WHERE u.id = ? LIMIT 1`,
        [targetPatientId]
      );
      if (!pRows.length || !pRows[0].is_profile_completed) {
        return res.status(403).json({
          success: false,
          message: "Please complete your mandatory profile details before booking appointments.",
        });
      }
    } else if (req.user.role === "staff" || req.user.role === "hospital_admin" || req.user.role === "super_admin") {
      if (!patient_id) {
        return res.status(400).json({
          success: false,
          message: "patient_id is required when booking appointments on behalf of patients.",
        });
      }
      targetPatientId = Number(patient_id);
      bookedByStaffId = req.user.id;

      if (req.user.role === "staff" && Number(req.user.hospitalId) !== Number(hospital_id)) {
        return res.status(403).json({
          success: false,
          message: "Staff members can only book appointments for their assigned hospital.",
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: "Your role is not authorized to create appointments.",
      });
    }

    // Verify patient user exists
    const [patUserRows] = await connection.execute(
      "SELECT id, full_name, email, phone FROM users WHERE id = ? LIMIT 1",
      [targetPatientId]
    );
    if (!patUserRows.length) {
      return res.status(404).json({ success: false, message: "Patient account not found." });
    }

    // 6. Lesson 6.7: Pessimistic Concurrency Locking with SELECT ... FOR UPDATE
    await connection.beginTransaction();

    // Check duplicate booking on exact same date & doctor by same patient
    const [dupCheck] = await connection.execute(
      `SELECT id FROM appointments
       WHERE patient_id = ? AND doctor_id = ? AND appointment_date = ? AND status NOT IN ('cancelled', 'rejected')
       LIMIT 1 FOR UPDATE`,
      [targetPatientId, doctor_id, appointment_date]
    );

    if (dupCheck.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: "You already have an active appointment scheduled with this doctor on this date.",
      });
    }

    // Check slot conflict with SELECT ... FOR UPDATE
    const [conflictCheck] = await connection.execute(
      `SELECT id FROM appointments
       WHERE doctor_id = ? AND appointment_date = ? AND start_time = ? AND status NOT IN ('cancelled', 'rejected')
       LIMIT 1 FOR UPDATE`,
      [doctor_id, appointment_date, slotValidation.start_time]
    );

    if (conflictCheck.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: "The requested time slot was just booked by another user. Please select another slot.",
      });
    }

    // 7. Initial Status Assignment
    // Patient bookings start as 'pending'; Staff bookings default to 'confirmed' unless specified
    let statusToSet = "pending";
    if (bookedByStaffId) {
      statusToSet = initial_status && VALID_STATUSES.includes(initial_status) ? initial_status : "confirmed";
    }

    const appointmentNumber = generateAppointmentNumber();
    const consultationFee = Number(docValidation.doctor.consultation_fee || 0);

    const [insertResult] = await connection.execute(
      `INSERT INTO appointments
         (appointment_number, patient_id, hospital_id, department_id, doctor_id,
          appointment_date, appointment_time, appointment_type, appointment_mode,
          start_time, end_time, status, reason, payment_method, consultation_fee,
          follow_up_to_id, booked_by_staff_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        appointmentNumber,
        targetPatientId,
        hospital_id,
        department_id,
        doctor_id,
        appointment_date,
        slotValidation.matchingSlot.display_time || appointment_time,
        appointment_type,
        appointment_mode,
        slotValidation.start_time,
        slotValidation.end_time,
        statusToSet,
        (reason || "").trim(),
        payment_method,
        consultationFee,
        follow_up_to_id,
        bookedByStaffId,
      ]
    );

    const appointmentId = insertResult.insertId;
    await connection.commit();

    emitHospitalEvent(hospital_id, "appointments:updated", {
      action: "created",
      appointmentId,
      status: statusToSet,
      doctorId: doctor_id,
      patientId: targetPatientId,
    });

    await logAudit(
      req.user.id,
      "CREATE_APPOINTMENT",
      "appointment",
      appointmentId,
      {
        appointment_number: appointmentNumber,
        doctor_id,
        patient_id: targetPatientId,
        status: statusToSet,
        appointment_type,
        appointment_mode,
      },
      req.ip
    );

    const [createdRows] = await pool.execute(
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

    // Module 7 (Lesson 7.2): Dispatch booking notification based on initial status
    const createdApt = createdRows[0];
    if (createdApt && createdApt.patient_email) {
      const patientInfo = { id: createdApt.patient_id, full_name: createdApt.patient_name, email: createdApt.patient_email };
      const doctorInfo = { id: createdApt.doctor_id, full_name: createdApt.doctor_name, email: createdApt.doctor_email };
      const hospitalInfo = { name: createdApt.hospital_name };
      const departmentInfo = { name: createdApt.department_name };

      if (createdApt.status === "confirmed") {
        notifyBookingConfirmed({
          appointment: createdApt,
          patient: patientInfo,
          doctor: doctorInfo,
          hospital: hospitalInfo,
          department: departmentInfo,
        }).catch((err) => console.error("[Notification] Booking confirmed email error:", err.message));
      } else {
        notifyBookingReceived({
          appointment: createdApt,
          patient: patientInfo,
          doctor: doctorInfo,
          hospital: hospitalInfo,
          department: departmentInfo,
        }).catch((err) => console.error("[Notification] Booking received email error:", err.message));
      }
    }

    return res.status(201).json({
      success: true,
      message: "Appointment booked successfully.",
      data: createdRows[0],
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_) {}
    console.error("Book appointment error:", error.message);

    if (
      error.code === "ER_LOCK_DEADLOCK" ||
      error.code === "ER_LOCK_WAIT_TIMEOUT" ||
      error.code === "ER_DUP_ENTRY"
    ) {
      return res.status(409).json({
        success: false,
        message: "The requested time slot was just booked by another user. Please select another slot.",
      });
    }

    return res.status(500).json({ success: false, message: "Unable to book appointment." });
  } finally {
    connection.release();
  }
});

/**
 * ============================================================================
 * Lesson 6.5 & 6.6: Appointment Listing with Multi-Tenant & Doctor Visibility
 * GET /api/appointments
 * ============================================================================
 */
router.get("/", async (req, res) => {
  try {
    const { status, date, doctor_id, patient_id, department_id, search } = req.query;

    let sql = `
      SELECT
        a.id,
        a.appointment_number,
        a.patient_id,
        a.hospital_id,
        a.department_id,
        a.doctor_id,
        DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
        a.appointment_time,
        a.appointment_type,
        a.appointment_mode,
        a.start_time,
        a.end_time,
        a.status,
        a.reason,
        a.payment_method,
        a.consultation_fee,
        a.follow_up_to_id,
        a.queue_number,
        a.check_in_time,
        a.rejection_reason,
        a.cancellation_reason,
        a.created_at,
        h.name AS hospital_name,
        d.name AS department_name,
        doc.full_name AS doctor_name,
        dp.specialization AS doctor_specialization,
        pat.full_name AS patient_name,
        pat.phone AS patient_phone,
        pat.email AS patient_email
      FROM appointments a
      LEFT JOIN hospitals h ON h.id = a.hospital_id
      LEFT JOIN departments d ON d.id = a.department_id
      LEFT JOIN users doc ON doc.id = a.doctor_id
      LEFT JOIN doctor_profiles dp ON dp.user_id = doc.id
      LEFT JOIN users pat ON pat.id = a.patient_id
    `;

    const conditions = [];
    const params = [];

    // Role-based Multi-Tenant Isolation
    if (req.user.role === "patient") {
      conditions.push("a.patient_id = ?");
      params.push(req.user.id);
    } else if (req.user.role === "doctor") {
      // Lesson 6.6: Doctors only view their own appointments
      conditions.push("a.doctor_id = ?");
      params.push(req.user.id);
    } else if (req.user.role === "staff" || req.user.role === "hospital_admin") {
      if (!req.user.hospitalId) {
        return res.status(403).json({ success: false, message: "No hospital assigned to account." });
      }
      conditions.push("a.hospital_id = ?");
      params.push(req.user.hospitalId);
    }

    if (status && VALID_STATUSES.includes(status)) {
      conditions.push("a.status = ?");
      params.push(status);
    }

    if (date) {
      conditions.push("(a.appointment_date = ? OR DATE_FORMAT(a.appointment_date, '%Y-%m-%d') = ?)");
      params.push(date, date);
    }

    if (doctor_id && req.user.role !== "doctor") {
      conditions.push("a.doctor_id = ?");
      params.push(Number(doctor_id));
    }

    if (patient_id && req.user.role !== "patient") {
      conditions.push("a.patient_id = ?");
      params.push(Number(patient_id));
    }

    if (department_id) {
      conditions.push("a.department_id = ?");
      params.push(Number(department_id));
    }

    if (search && search.trim()) {
      conditions.push(
        "(a.appointment_number LIKE ? OR pat.full_name LIKE ? OR doc.full_name LIKE ? OR a.queue_number LIKE ?)"
      );
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    if (conditions.length) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " ORDER BY a.appointment_date DESC, a.start_time ASC, a.id DESC";

    const [appointments] = await pool.execute(sql, params);

    return res.json({
      success: true,
      count: appointments.length,
      data: appointments,
    });
  } catch (error) {
    console.error("List appointments error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve appointments." });
  }
});

/**
 * ============================================================================
 * Lesson 6.12: Live Queue Telemetry
 * GET /api/appointments/queue/live
 * ============================================================================
 */
router.get("/queue/live", async (req, res) => {
  try {
    const today = req.query.date || new Date().toISOString().split("T")[0];
    let sql = `
      SELECT
        a.id, a.appointment_number, a.queue_number, a.patient_id,
        a.doctor_id, a.department_id, a.status,
        DATE_FORMAT(a.check_in_time, '%H:%i:%s') AS check_in_time,
        a.check_in_time AS raw_check_in_time,
        a.appointment_time,
        pat.full_name AS patient_name,
        doc.full_name AS doctor_name,
        d.name AS department_name
      FROM appointments a
      JOIN users pat ON pat.id = a.patient_id
      JOIN users doc ON doc.id = a.doctor_id
      JOIN departments d ON d.id = a.department_id
      WHERE (a.appointment_date = ? OR DATE_FORMAT(a.appointment_date, '%Y-%m-%d') = ?)
        AND a.status IN ('in_waiting', 'in_progress')
    `;
    const params = [today, today];

    if (req.user.role === "doctor") {
      sql += " AND a.doctor_id = ?";
      params.push(req.user.id);
    } else if (req.user.role === "staff" || req.user.role === "hospital_admin") {
      sql += " AND a.hospital_id = ?";
      params.push(req.user.hospitalId);
    }

    if (req.query.doctor_id) {
      sql += " AND a.doctor_id = ?";
      params.push(Number(req.query.doctor_id));
    }

    sql += " ORDER BY a.check_in_time ASC, a.id ASC";

    const [queueRows] = await pool.execute(sql, params);

    const waitingCount = queueRows.filter((r) => r.status === "in_waiting").length;
    const inProgressCount = queueRows.filter((r) => r.status === "in_progress").length;

    return res.json({
      success: true,
      date: today,
      waiting_count: waitingCount,
      in_progress_count: inProgressCount,
      queue: queueRows,
      data: {
        waiting_count: waitingCount,
        in_progress_count: inProgressCount,
        queue: queueRows,
      },
    });
  } catch (error) {
    console.error("Live queue error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve queue." });
  }
});

/**
 * GET /api/appointments/:id
 * Retrieve single appointment details
 */
router.get("/:id", async (req, res) => {
  try {
    const appointmentId = Number(req.params.id);
    if (!Number.isSafeInteger(appointmentId) || appointmentId < 1) {
      return res.status(400).json({ success: false, message: "Invalid appointment ID." });
    }

    const [rows] = await pool.execute(
      `SELECT
         a.*,
         DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
         h.name AS hospital_name,
         h.phone AS hospital_phone,
         h.address AS hospital_address,
         d.name AS department_name,
         doc.full_name AS doctor_name,
         dp.specialization AS doctor_specialization,
         pat.full_name AS patient_name,
         pat.phone AS patient_phone,
         pat.email AS patient_email
       FROM appointments a
       LEFT JOIN hospitals h ON h.id = a.hospital_id
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN users doc ON doc.id = a.doctor_id
       LEFT JOIN doctor_profiles dp ON dp.user_id = doc.id
       LEFT JOIN users pat ON pat.id = a.patient_id
       WHERE a.id = ? LIMIT 1`,
      [appointmentId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Appointment not found." });
    }

    const apt = rows[0];

    // Authorization check
    if (req.user.role === "patient" && Number(apt.patient_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: "Unauthorized to view this appointment." });
    }

    if (req.user.role === "doctor" && Number(apt.doctor_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: "Unauthorized to view this appointment." });
    }

    if (
      (req.user.role === "staff" || req.user.role === "hospital_admin") &&
      Number(apt.hospital_id) !== Number(req.user.hospitalId)
    ) {
      return res.status(403).json({ success: false, message: "Unauthorized to view this appointment." });
    }

    return res.json({ success: true, data: apt });
  } catch (error) {
    console.error("Get appointment error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to retrieve appointment." });
  }
});

/**
 * ============================================================================
 * Lesson 6.5 & 6.8: Status Lifecycle Transitions & Permissions
 * PATCH /api/appointments/:id/status
 * ============================================================================
 */
router.patch("/:id/status", async (req, res) => {
  try {
    const appointmentId = Number(req.params.id);
    const { status: targetStatus, reason } = req.body || {};

    if (!targetStatus || !VALID_STATUSES.includes(targetStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}.`,
      });
    }

    const [rows] = await pool.execute(
      `SELECT id, patient_id, hospital_id, doctor_id, status, queue_number, check_in_time,
              DATE_FORMAT(appointment_date, '%Y-%m-%d') AS appointment_date, appointment_time
       FROM appointments WHERE id = ? LIMIT 1`,
      [appointmentId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Appointment not found." });
    }

    const currentApt = rows[0];
    const currentStatus = currentApt.status;

    // Check transition validity
    const allowedNext = ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!allowedNext.includes(targetStatus) && req.user.role !== "super_admin") {
      return res.status(400).json({
        success: false,
        message: `Cannot transition status from '${currentStatus}' to '${targetStatus}'.`,
      });
    }

    // Role Authority Check
    if (req.user.role === "patient") {
      if (Number(currentApt.patient_id) !== Number(req.user.id)) {
        return res.status(403).json({ success: false, message: "You can only update your own appointment." });
      }
      if (targetStatus !== "cancelled") {
        return res.status(403).json({
          success: false,
          message: "Patients are only permitted to cancel appointments.",
        });
      }
      // Lesson 6.8: Check 4-hour cancellation rule
      if (isLessThanFourHoursAhead(currentApt.appointment_date, currentApt.appointment_time)) {
        return res.status(400).json({
          success: false,
          message: "Appointments cannot be cancelled within 4 hours of scheduled time. Please contact reception.",
        });
      }
    } else if (req.user.role === "doctor") {
      if (Number(currentApt.doctor_id) !== Number(req.user.id)) {
        return res.status(403).json({ success: false, message: "You can only update your assigned appointments." });
      }
    } else if (req.user.role === "staff" || req.user.role === "hospital_admin") {
      if (Number(currentApt.hospital_id) !== Number(req.user.hospitalId)) {
        return res.status(403).json({ success: false, message: "Access restricted to your hospital." });
      }
    }

    // Lesson 8.8: A consultation must be submitted before the appointment can be marked as completed
    if (targetStatus === "completed") {
      const [consultationCheck] = await pool.execute(
        `SELECT id, status FROM consultations WHERE appointment_id = ? LIMIT 1`,
        [appointmentId]
      );
      if (!consultationCheck.length || consultationCheck[0].status !== "submitted") {
        return res.status(400).json({
          success: false,
          message: "A consultation must be successfully submitted before the appointment can be marked as completed.",
        });
      }
    }

    // If moving to waiting queue or in_progress and no queue number exists yet, assign next sequential token
    let queueNumber = currentApt.queue_number;
    if (targetStatus === "in_waiting" && !queueNumber) {
      const [qRows] = await pool.execute(
        `SELECT MAX(CAST(SUBSTRING(queue_number, 3) AS UNSIGNED)) AS max_queue_num,
                COUNT(*) AS total_checked_in
         FROM appointments
         WHERE hospital_id = ?
           AND (appointment_date = ? OR DATE_FORMAT(appointment_date, '%Y-%m-%d') = ?)
           AND queue_number LIKE 'Q-%'`,
        [currentApt.hospital_id, currentApt.appointment_date, currentApt.appointment_date]
      );
      const nextCount = Math.max(Number(qRows[0]?.max_queue_num) || 0, Number(qRows[0]?.total_checked_in) || 0) + 1;
      queueNumber = `Q-${String(nextCount).padStart(3, "0")}`;
    }

    let updateSql = "UPDATE appointments SET status = ?, status_changed_by = ?";
    const updateParams = [targetStatus, req.user.id];

    if (queueNumber && !currentApt.queue_number) {
      updateSql += ", queue_number = ?, check_in_time = CURRENT_TIMESTAMP, checked_in_by = ?";
      updateParams.push(queueNumber, req.user.id);
    } else if (targetStatus === "in_progress" && !currentApt.check_in_time) {
      updateSql += ", check_in_time = CURRENT_TIMESTAMP";
    }

    if (targetStatus === "rejected") {
      updateSql += ", rejection_reason = ?";
      updateParams.push((reason || "").trim() || "Rejected by healthcare provider");
    } else if (targetStatus === "cancelled") {
      updateSql += ", cancellation_reason = ?, cancelled_by = ?";
      updateParams.push((reason || "").trim() || "Cancelled by user", req.user.id);
    } else if (targetStatus === "admitted") {
      updateSql += ", reason = CONCAT(IFNULL(reason, ''), ' [Admitted: ', ?, ']')";
      updateParams.push((reason || "Admitted to inpatient care").trim());
    }

    updateSql += " WHERE id = ?";
    updateParams.push(appointmentId);

    await pool.execute(updateSql, updateParams);

    await logAudit(
      req.user.id,
      "UPDATE_APPOINTMENT_STATUS",
      "appointment",
      appointmentId,
      { previous_status: currentStatus, new_status: targetStatus, reason },
      req.ip
    );

    // Module 7 (Lessons 7.2, 7.3, 7.5): Status transition notifications
    if (targetStatus !== currentStatus) {
      getAppointmentNotificationDetails(appointmentId)
        .then((enriched) => {
          if (!enriched || !enriched.patient_email) return;
          const patientInfo = { id: enriched.patient_id, full_name: enriched.patient_name, email: enriched.patient_email };
          const doctorInfo = { id: enriched.doctor_id, full_name: enriched.doctor_name, email: enriched.doctor_email };
          const hospitalInfo = { name: enriched.hospital_name };
          const departmentInfo = { name: enriched.department_name };

          if (targetStatus === "confirmed" && currentStatus === "pending") {
            return notifyBookingConfirmed({
              appointment: enriched,
              patient: patientInfo,
              doctor: doctorInfo,
              hospital: hospitalInfo,
              department: departmentInfo,
            });
          } else if (targetStatus === "cancelled") {
            return notifyAppointmentCancelled({
              appointment: enriched,
              patient: patientInfo,
              doctor: doctorInfo,
              hospital: hospitalInfo,
              cancellationReason: reason || "Cancelled by healthcare provider",
            });
          } else if (targetStatus === "completed") {
            return notifyAppointmentCompleted({
              appointment: enriched,
              patient: patientInfo,
              doctor: doctorInfo,
              hospital: hospitalInfo,
            });
          }
        })
        .catch((err) => console.error("[Notification] Status change email error:", err.message));
    }

    const [updatedRows] = await pool.execute(
      `SELECT a.id, a.appointment_number, a.queue_number, a.status,
              DATE_FORMAT(a.check_in_time, '%r') AS check_in_time_12h,
              DATE_FORMAT(a.check_in_time, '%H:%i:%s') AS check_in_time_24h,
              a.check_in_time,
              pat.full_name AS patient_name,
              doc.full_name AS doctor_name,
              d.name AS department_name
       FROM appointments a
       JOIN users pat ON pat.id = a.patient_id
       JOIN users doc ON doc.id = a.doctor_id
       JOIN departments d ON d.id = a.department_id
       WHERE a.id = ? LIMIT 1`,
      [appointmentId]
    );

    emitHospitalEvent(currentApt.hospital_id, "appointments:updated", {
      action: "status_updated",
      appointmentId,
      status: targetStatus,
      queueNumber,
    });

    return res.json({
      success: true,
      message: `Appointment status updated to '${targetStatus}'.`,
      status: targetStatus,
      data: updatedRows[0] || { id: appointmentId, status: targetStatus, queue_number: queueNumber },
    });
  } catch (error) {
    console.error("Update appointment status error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to update appointment status." });
  }
});

/**
 * ============================================================================
 * Lesson 6.8: Dedicated Cancellation Endpoint
 * PATCH /api/appointments/:id/cancel
 * ============================================================================
 */
router.patch("/:id/cancel", async (req, res) => {
  try {
    const appointmentId = Number(req.params.id);
    const { reason = "" } = req.body || {};

    const [rows] = await pool.execute(
      `SELECT id, patient_id, hospital_id, doctor_id, status,
              DATE_FORMAT(appointment_date, '%Y-%m-%d') AS appointment_date, appointment_time
       FROM appointments WHERE id = ? LIMIT 1`,
      [appointmentId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Appointment not found." });
    }

    const currentApt = rows[0];

    if (currentApt.status === "cancelled") {
      return res.status(400).json({ success: false, message: "Appointment is already cancelled." });
    }

    if (["completed", "rejected", "admitted"].includes(currentApt.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel an appointment that is already ${currentApt.status}.`,
      });
    }

    // Role check and 4-hour rule for patients
    if (req.user.role === "patient") {
      if (Number(currentApt.patient_id) !== Number(req.user.id)) {
        return res.status(403).json({ success: false, message: "You can only cancel your own appointment." });
      }
      if (isLessThanFourHoursAhead(currentApt.appointment_date, currentApt.appointment_time)) {
        return res.status(400).json({
          success: false,
          message: "Appointments cannot be cancelled within 4 hours of scheduled time. Please contact reception.",
        });
      }
    } else if (req.user.role === "staff" || req.user.role === "hospital_admin") {
      if (Number(currentApt.hospital_id) !== Number(req.user.hospitalId)) {
        return res.status(403).json({ success: false, message: "Access restricted to your hospital." });
      }
    } else if (req.user.role === "doctor") {
      if (Number(currentApt.doctor_id) !== Number(req.user.id)) {
        return res.status(403).json({ success: false, message: "Access restricted to your appointments." });
      }
    }

    await pool.execute(
      `UPDATE appointments
       SET status = 'cancelled', cancellation_reason = ?, cancelled_by = ?, status_changed_by = ?
       WHERE id = ?`,
      [(reason || "").trim() || "Cancelled by user", req.user.id, req.user.id, appointmentId]
    );

    emitHospitalEvent(currentApt.hospital_id, "appointments:updated", {
      action: "cancelled",
      appointmentId,
      status: "cancelled",
    });

    await logAudit(
      req.user.id,
      "CANCEL_APPOINTMENT",
      "appointment",
      appointmentId,
      { reason },
      req.ip
    );

    // Module 7 (Lesson 7.3): Dispatch appointment cancelled notification
    getAppointmentNotificationDetails(appointmentId)
      .then((enriched) => {
        if (!enriched || !enriched.patient_email) return;
        return notifyAppointmentCancelled({
          appointment: enriched,
          patient: { id: enriched.patient_id, full_name: enriched.patient_name, email: enriched.patient_email },
          doctor: { id: enriched.doctor_id, full_name: enriched.doctor_name, email: enriched.doctor_email },
          hospital: { name: enriched.hospital_name },
          cancellationReason: (reason || "").trim() || "Cancelled by user",
        });
      })
      .catch((err) => console.error("[Notification] Cancel email error:", err.message));

    return res.json({
      success: true,
      message: "Appointment cancelled successfully.",
    });
  } catch (error) {
    console.error("Cancel appointment error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to cancel appointment." });
  }
});

/**
 * ============================================================================
 * Lesson 6.9: Appointment Rescheduling
 * PATCH /api/appointments/:id/reschedule
 * ============================================================================
 */
router.patch("/:id/reschedule", async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const appointmentId = Number(req.params.id);
    const { appointment_date, appointment_time, reason = "" } = req.body || {};

    if (!appointment_date || !appointment_time) {
      return res.status(400).json({
        success: false,
        message: "Both appointment_date and appointment_time are required for rescheduling.",
      });
    }

    // Check window
    const windowValidation = validateBookingWindow(appointment_date);
    if (!windowValidation.valid) {
      return res.status(400).json({ success: false, message: windowValidation.message });
    }

    const [rows] = await connection.execute(
      `SELECT id, patient_id, hospital_id, doctor_id, department_id, status, created_at,
              DATE_FORMAT(appointment_date, '%Y-%m-%d') AS appointment_date, appointment_time
       FROM appointments WHERE id = ? LIMIT 1`,
      [appointmentId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Appointment not found." });
    }

    const currentApt = rows[0];

    if (["completed", "cancelled", "rejected", "admitted"].includes(currentApt.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot reschedule an appointment that is already ${currentApt.status}.`,
      });
    }

    // Strict Rule: If pending appointment confirmation window has expired (4 hours passed)
    if (currentApt.status === "pending" && currentApt.created_at) {
      const createdAtMs = new Date(currentApt.created_at).getTime();
      if (!isNaN(createdAtMs) && (Date.now() - createdAtMs > 4 * 60 * 60 * 1000)) {
        return res.status(400).json({
          success: false,
          message: "The 4-hour confirmation window has passed (Time is out). This appointment request has expired and cannot be rescheduled.",
        });
      }
    }

    // Role check & 4-hour rule
    if (req.user.role === "patient") {
      if (Number(currentApt.patient_id) !== Number(req.user.id)) {
        return res.status(403).json({ success: false, message: "You can only reschedule your own appointment." });
      }
      if (isLessThanFourHoursAhead(currentApt.appointment_date, currentApt.appointment_time)) {
        return res.status(400).json({
          success: false,
          message: "Appointments cannot be rescheduled within 4 hours of scheduled time. Please contact reception.",
        });
      }
    } else if (req.user.role === "staff" || req.user.role === "hospital_admin") {
      if (Number(currentApt.hospital_id) !== Number(req.user.hospitalId)) {
        return res.status(403).json({ success: false, message: "Access restricted to your hospital." });
      }
    }

    // Validate new slot
    const slotValidation = await validateDoctorBookingSlot(
      connection,
      currentApt.doctor_id,
      appointment_date,
      appointment_time
    );
    if (!slotValidation.valid) {
      return res.status(400).json({ success: false, message: slotValidation.message });
    }

    await connection.beginTransaction();

    // Pessimistic lock conflict check
    const [conflictCheck] = await connection.execute(
      `SELECT id FROM appointments
       WHERE doctor_id = ? AND appointment_date = ? AND start_time = ? AND id != ? AND status NOT IN ('cancelled', 'rejected')
       LIMIT 1 FOR UPDATE`,
      [currentApt.doctor_id, appointment_date, slotValidation.start_time, appointmentId]
    );

    if (conflictCheck.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: "The requested reschedule slot is already occupied. Please select another slot.",
      });
    }

    await connection.execute(
      `UPDATE appointments
       SET appointment_date = ?, appointment_time = ?, start_time = ?, end_time = ?,
           reminder_sent_at = NULL,
           reason = CONCAT(IFNULL(reason, ''), ' [Rescheduled: ', ?, ']'),
           status_changed_by = ?
       WHERE id = ?`,
      [
        appointment_date,
        slotValidation.matchingSlot.display_time || appointment_time,
        slotValidation.start_time,
        slotValidation.end_time,
        (reason || "Requested by user").trim(),
        req.user.id,
        appointmentId,
      ]
    );

    await connection.commit();

    emitHospitalEvent(currentApt.hospital_id, "appointments:updated", {
      action: "rescheduled",
      appointmentId,
      appointmentDate: appointment_date,
      appointmentTime: slotValidation.matchingSlot.display_time || appointment_time,
    });

    await logAudit(
      req.user.id,
      "RESCHEDULE_APPOINTMENT",
      "appointment",
      appointmentId,
      { new_date: appointment_date, new_time: slotValidation.start_time, reason },
      req.ip
    );

    // Module 7 (Lesson 7.3): Dispatch appointment rescheduled notification
    getAppointmentNotificationDetails(appointmentId)
      .then((enriched) => {
        if (!enriched || !enriched.patient_email) return;
        return notifyAppointmentRescheduled({
          appointment: enriched,
          patient: { id: enriched.patient_id, full_name: enriched.patient_name, email: enriched.patient_email },
          doctor: { id: enriched.doctor_id, full_name: enriched.doctor_name, email: enriched.doctor_email },
          hospital: { name: enriched.hospital_name },
          department: { name: enriched.department_name },
          previousDate: currentApt.appointment_date,
          previousTime: currentApt.appointment_time,
        });
      })
      .catch((err) => console.error("[Notification] Reschedule email error:", err.message));

    return res.json({
      success: true,
      message: "Appointment rescheduled successfully.",
      appointment_date,
      appointment_time: slotValidation.matchingSlot.display_time || appointment_time,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Reschedule appointment error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to reschedule appointment." });
  } finally {
    connection.release();
  }
});

/**
 * ============================================================================
 * Lesson 6.10: Follow-up Appointment Booking
 * POST /api/appointments/follow-up
 * ============================================================================
 */
router.post("/follow-up", async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { previous_appointment_id, appointment_date, appointment_time, reason = "", payment_method = "cash" } =
      req.body || {};

    if (!previous_appointment_id || !appointment_date || !appointment_time) {
      return res.status(400).json({
        success: false,
        message: "previous_appointment_id, appointment_date, and appointment_time are required.",
      });
    }

    // Verify previous appointment exists
    const [prevRows] = await connection.execute(
      `SELECT id, appointment_number, patient_id, hospital_id, department_id, doctor_id
       FROM appointments WHERE id = ? LIMIT 1`,
      [previous_appointment_id]
    );

    if (!prevRows.length) {
      return res.status(404).json({ success: false, message: "Previous appointment record not found." });
    }

    const prev = prevRows[0];

    // Forward to creation payload
    req.body.hospital_id = prev.hospital_id;
    req.body.department_id = prev.department_id;
    req.body.doctor_id = prev.doctor_id;
    req.body.patient_id = prev.patient_id;
    req.body.appointment_type = "follow_up";
    req.body.follow_up_to_id = prev.id;

    // Use standard booking logic
    const windowValidation = validateBookingWindow(appointment_date);
    if (!windowValidation.valid) {
      return res.status(400).json({ success: false, message: windowValidation.message });
    }

    const slotValidation = await validateDoctorBookingSlot(
      connection,
      prev.doctor_id,
      appointment_date,
      appointment_time
    );
    if (!slotValidation.valid) {
      return res.status(400).json({ success: false, message: slotValidation.message });
    }

    await connection.beginTransaction();

    const [conflictCheck] = await connection.execute(
      `SELECT id FROM appointments
       WHERE doctor_id = ? AND appointment_date = ? AND start_time = ? AND status NOT IN ('cancelled', 'rejected')
       LIMIT 1 FOR UPDATE`,
      [prev.doctor_id, appointment_date, slotValidation.start_time]
    );

    if (conflictCheck.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: "The requested follow-up time slot is already booked. Please choose another slot.",
      });
    }

    const aptNumber = generateAppointmentNumber();
    const [docProfile] = await connection.execute(
      "SELECT consultation_fee FROM doctor_profiles WHERE user_id = ? LIMIT 1",
      [prev.doctor_id]
    );
    const fee = Number(docProfile[0]?.consultation_fee || 0);

    const [insertResult] = await connection.execute(
      `INSERT INTO appointments
         (appointment_number, patient_id, hospital_id, department_id, doctor_id,
          appointment_date, appointment_time, appointment_type, appointment_mode,
          start_time, end_time, status, reason, payment_method, consultation_fee,
          follow_up_to_id, booked_by_staff_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'follow_up', 'in_person', ?, ?, 'confirmed', ?, ?, ?, ?, ?)`,
      [
        aptNumber,
        prev.patient_id,
        prev.hospital_id,
        prev.department_id,
        prev.doctor_id,
        appointment_date,
        slotValidation.matchingSlot.display_time || appointment_time,
        slotValidation.start_time,
        slotValidation.end_time,
        (reason || "Follow-up consultation").trim(),
        payment_method,
        fee,
        prev.id,
        req.user.role !== "patient" ? req.user.id : null,
      ]
    );

    const newAptId = insertResult.insertId;
    await connection.commit();

    // Module 7 (Lesson 7.5): Dispatch follow-up scheduled notification
    getAppointmentNotificationDetails(newAptId)
      .then((enriched) => {
        if (!enriched || !enriched.patient_email) return;
        return notifyFollowUpScheduled({
          appointment: enriched,
          previousAppointmentNumber: prev.appointment_number,
          patient: { id: enriched.patient_id, full_name: enriched.patient_name, email: enriched.patient_email },
          doctor: { id: enriched.doctor_id, full_name: enriched.doctor_name, email: enriched.doctor_email },
          hospital: { name: enriched.hospital_name },
        });
      })
      .catch((err) => console.error("[Notification] Follow-up email error:", err.message));

    return res.status(201).json({
      success: true,
      message: "Follow-up appointment scheduled successfully.",
      data: {
        id: newAptId,
        appointment_number: aptNumber,
        appointment_type: "follow_up",
        follow_up_to_id: prev.id,
        appointment_date,
        appointment_time: slotValidation.matchingSlot.display_time || appointment_time,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("Follow-up appointment error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to schedule follow-up appointment." });
  } finally {
    connection.release();
  }
});

/**
 * ============================================================================
 * Lesson 6.12: Receptionist Check-in & Queue Number Assignment
 * PATCH & POST /api/appointments/:id/check-in
 * ============================================================================
 */
async function handleCheckIn(req, res) {
  const connection = await pool.getConnection();
  try {
    const appointmentId = Number(req.params.id);

    if (req.user.role !== "staff" && req.user.role !== "hospital_admin" && req.user.role !== "super_admin") {
      return res.status(403).json({
        success: false,
        message: "Only receptionists and hospital staff are authorized to check-in patients.",
      });
    }

    const [rows] = await connection.execute(
      `SELECT id, hospital_id, doctor_id, patient_id, status, queue_number,
              DATE_FORMAT(appointment_date, '%Y-%m-%d') AS appointment_date, appointment_time
       FROM appointments WHERE id = ? LIMIT 1`,
      [appointmentId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Appointment not found." });
    }

    const apt = rows[0];

    if (req.user.role === "staff" && Number(apt.hospital_id) !== Number(req.user.hospitalId)) {
      return res.status(403).json({ success: false, message: "Access restricted to your hospital." });
    }

    if (apt.status === "in_waiting") {
      return res.status(400).json({
        success: false,
        message: `Patient is already checked in. Queue number: ${apt.queue_number}`,
      });
    }

    if (["completed", "cancelled", "rejected"].includes(apt.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot check-in an appointment with status '${apt.status}'.`,
      });
    }

    // Verify appointment is for today
    const today = new Date().toISOString().split("T")[0];
    if (apt.appointment_date !== today) {
      return res.status(400).json({
        success: false,
        message: `Patient check-in is only permitted on the scheduled date (${apt.appointment_date}). Today is ${today}.`,
      });
    }

    await connection.beginTransaction();

    // Assign next queue number within the hospital facility queue today (concurrency safe)
    const [qRows] = await connection.execute(
      `SELECT MAX(CAST(SUBSTRING(queue_number, 3) AS UNSIGNED)) AS max_queue_num,
              COUNT(*) AS total_checked_in
       FROM appointments
       WHERE hospital_id = ?
         AND (appointment_date = ? OR DATE_FORMAT(appointment_date, '%Y-%m-%d') = ?)
         AND queue_number LIKE 'Q-%'
       FOR UPDATE`,
      [apt.hospital_id, apt.appointment_date, apt.appointment_date]
    );

    const nextCount = Math.max(Number(qRows[0]?.max_queue_num) || 0, Number(qRows[0]?.total_checked_in) || 0) + 1;
    const queueNumber = `Q-${String(nextCount).padStart(3, "0")}`;

    await connection.execute(
      `UPDATE appointments
       SET status = 'in_waiting',
           queue_number = ?,
           check_in_time = CURRENT_TIMESTAMP,
           checked_in_by = ?,
           status_changed_by = ?
       WHERE id = ?`,
      [queueNumber, req.user.id, req.user.id, appointmentId]
    );

    // Fetch the updated appointment details to return complete persisted information
    const [updatedRows] = await connection.execute(
      `SELECT a.id, a.appointment_number, a.queue_number, a.status,
              DATE_FORMAT(a.check_in_time, '%r') AS check_in_time_12h,
              DATE_FORMAT(a.check_in_time, '%H:%i:%s') AS check_in_time_24h,
              a.check_in_time,
              pat.full_name AS patient_name,
              doc.full_name AS doctor_name,
              d.name AS department_name
       FROM appointments a
       JOIN users pat ON pat.id = a.patient_id
       JOIN users doc ON doc.id = a.doctor_id
       JOIN departments d ON d.id = a.department_id
       WHERE a.id = ? LIMIT 1`,
      [appointmentId]
    );

    await connection.commit();

    const savedApt = updatedRows[0] || {};
    const formattedCheckInTime = savedApt.check_in_time_12h || savedApt.check_in_time_24h || new Date().toLocaleTimeString();

    await logAudit(
      req.user.id,
      "PATIENT_CHECK_IN",
      "appointment",
      appointmentId,
      { queue_number: queueNumber, previous_status: apt.status },
      req.ip
    );

    return res.json({
      success: true,
      message: "Patient checked in successfully.",
      data: {
        appointment_id: appointmentId,
        queue_number: queueNumber,
        status: "in_waiting",
        check_in_time: formattedCheckInTime,
        raw_check_in_time: savedApt.check_in_time,
        patient_name: savedApt.patient_name,
        doctor_name: savedApt.doctor_name,
        department_name: savedApt.department_name,
        appointment_number: savedApt.appointment_number,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("Check-in error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to process patient check-in." });
  } finally {
    connection.release();
  }
}

router.patch("/:id/check-in", handleCheckIn);
router.post("/:id/check-in", handleCheckIn);

module.exports = router;
module.exports.validateDoctorBelongsToDepartmentAndHospital = validateDoctorBelongsToDepartmentAndHospital;
module.exports.validateDoctorBookingSlot = validateDoctorBookingSlot;


