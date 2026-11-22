const express = require("express");
const pool = require("../db");
const { requireAuth, allowRoles } = require("../middleware/auth");
const { logAudit } = require("../services/auditService");
const { uploadMedicalDocument } = require("../middleware/upload");

const router = express.Router();

const VALID_BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const VALID_GENDERS = ["male", "female", "other", "prefer_not_to_say"];

/**
 * Helper to evaluate if all mandatory profile fields are satisfied
 */
function evaluateProfileCompletion(fullName, phone, data) {
  const missing = [];

  if (!fullName || !fullName.trim()) missing.push("full_name");
  if (!phone || !phone.trim()) missing.push("phone");
  if (!data.dob) missing.push("dob");
  if (!data.gender || !VALID_GENDERS.includes(data.gender.toLowerCase())) missing.push("gender");
  if (!data.blood_group || !VALID_BLOOD_GROUPS.includes(data.blood_group.toUpperCase())) missing.push("blood_group");
  if (!data.address_line1 || !data.address_line1.trim()) missing.push("address_line1");
  if (!data.emergency_contact_name || !data.emergency_contact_name.trim()) missing.push("emergency_contact_name");
  if (!data.emergency_contact_phone || !data.emergency_contact_phone.trim()) missing.push("emergency_contact_phone");

  return {
    isComplete: missing.length === 0,
    missingFields: missing,
  };
}

/**
 * ----------------------------------------------------
 * Lesson 5.3 & 5.4: Get Authenticated Patient Profile
 * ----------------------------------------------------
 */
router.get("/profile", requireAuth, allowRoles("patient"), async (req, res) => {
  try {
    const patientUserId = req.user.id;

    const [rows] = await pool.execute(
      `SELECT
         u.id,
         u.full_name,
         u.email,
         u.phone,
         u.status,
         u.created_at AS account_created_at,
         pp.dob,
         pp.gender,
         pp.blood_group,
         pp.address_line1,
         pp.address_line2,
         pp.country_id,
         c.name AS country_name,
         pp.state_id,
         s.name AS state_name,
         pp.city_id,
         ci.name AS city_name,
         pp.postal_code,
         pp.emergency_contact_name,
         pp.emergency_contact_relationship,
         pp.emergency_contact_phone,
         pp.allergies,
         pp.chronic_conditions,
         pp.past_medical_history,
         pp.current_medications,
         pp.medical_notes,
         pp.is_profile_completed,
         pp.updated_at AS profile_updated_at
       FROM users u
       LEFT JOIN patient_profiles pp ON pp.user_id = u.id
       LEFT JOIN countries c ON c.id = pp.country_id
       LEFT JOIN states s ON s.id = pp.state_id
       LEFT JOIN cities ci ON ci.id = pp.city_id
       WHERE u.id = ?
       LIMIT 1`,
      [patientUserId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Patient account not found.",
      });
    }

    const patient = rows[0];

    return res.json({
      success: true,
      data: {
        id: patient.id,
        full_name: patient.full_name,
        email: patient.email,
        phone: patient.phone,
        status: patient.status,
        dob: patient.dob ? new Date(patient.dob).toISOString().split("T")[0] : null,
        gender: patient.gender,
        blood_group: patient.blood_group,
        address_line1: patient.address_line1,
        address_line2: patient.address_line2,
        country_id: patient.country_id,
        country: patient.country_name || "India",
        state_id: patient.state_id,
        state: patient.state_name || "Maharashtra",
        city_id: patient.city_id,
        city: patient.city_name || "Mumbai",
        postal_code: patient.postal_code,
        pincode: patient.postal_code,
        emergency_contact_name: patient.emergency_contact_name,
        emergency_contact_relationship: patient.emergency_contact_relationship,
        emergency_contact_phone: patient.emergency_contact_phone,
        emergency_contact_number: patient.emergency_contact_phone,
        allergies: patient.allergies,
        chronic_conditions: patient.chronic_conditions,
        past_medical_history: patient.past_medical_history,
        current_medications: patient.current_medications,
        current_medicines: patient.current_medications,
        medical_notes: patient.medical_notes,
        is_profile_completed: Boolean(patient.is_profile_completed),
        profile_completed: Boolean(patient.is_profile_completed),
      },
    });
  } catch (error) {
    console.error("Fetch patient profile error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve patient profile.",
    });
  }
});

/**
 * ----------------------------------------------------
 * Lesson 5.3, 5.4 & 5.5: Update Patient Profile
 * (Personal details, Emergency contact & Medical history)
 * ----------------------------------------------------
 */
router.put("/profile", requireAuth, allowRoles("patient"), async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const patientUserId = req.user.id;
    const body = req.body || {};

    const fullName = typeof body.full_name === "string" ? body.full_name.trim() : undefined;
    const phone =
      typeof body.phone === "string"
        ? body.phone.trim()
        : typeof body.mobile === "string"
        ? body.mobile.trim()
        : undefined;

    // Validate name and phone if provided
    if (fullName !== undefined) {
      if (!fullName || fullName.length > 150) {
        return res.status(400).json({
          success: false,
          message: "Please provide a valid full legal name (maximum 150 characters).",
        });
      }
    }

    if (phone !== undefined) {
      if (!phone || phone.length > 30) {
        return res.status(400).json({
          success: false,
          message: "Please provide a valid contact number (maximum 30 characters).",
        });
      }
    }

    // Validate DOB if provided
    let parsedDob = body.dob || null;
    if (parsedDob) {
      const dobDate = new Date(parsedDob);
      if (isNaN(dobDate.getTime()) || dobDate > new Date()) {
        return res.status(400).json({
          success: false,
          message: "Date of birth must be a valid past date.",
        });
      }
      parsedDob = dobDate.toISOString().split("T")[0];
    }

    // Normalize and validate gender
    let normalizedGender = null;
    if (body.gender) {
      const g = String(body.gender).trim().toLowerCase().replace(/\s+/g, "_");
      if (!VALID_GENDERS.includes(g)) {
        return res.status(400).json({
          success: false,
          message: `Gender must be one of: ${VALID_GENDERS.join(", ")}.`,
        });
      }
      normalizedGender = g;
    }

    // Normalize and validate blood group
    let normalizedBloodGroup = null;
    if (body.blood_group) {
      const bg = String(body.blood_group).trim().toUpperCase();
      if (!VALID_BLOOD_GROUPS.includes(bg)) {
        return res.status(400).json({
          success: false,
          message: `Blood group must be one of: ${VALID_BLOOD_GROUPS.join(", ")}.`,
        });
      }
      normalizedBloodGroup = bg;
    }

    // Emergency contact validation
    const emergencyName =
      body.emergency_contact_name !== undefined ? String(body.emergency_contact_name).trim() : null;
    const emergencyRel =
      body.emergency_contact_relationship !== undefined
        ? String(body.emergency_contact_relationship).trim()
        : null;
    const emergencyPhone =
      body.emergency_contact_phone !== undefined
        ? String(body.emergency_contact_phone).trim()
        : body.emergency_contact_number !== undefined
        ? String(body.emergency_contact_number).trim()
        : null;

    if (emergencyName && emergencyName.length > 150) {
      return res.status(400).json({
        success: false,
        message: "Emergency contact name must not exceed 150 characters.",
      });
    }

    if (emergencyPhone && emergencyPhone.length > 30) {
      return res.status(400).json({
        success: false,
        message: "Emergency contact phone must not exceed 30 characters.",
      });
    }

    // Address and location details
    const addressLine1 =
      body.address_line1 !== undefined ? String(body.address_line1).trim().slice(0, 255) : null;
    const addressLine2 =
      body.address_line2 !== undefined ? String(body.address_line2).trim().slice(0, 255) : null;
    const postalCode =
      body.postal_code !== undefined
        ? String(body.postal_code).trim().slice(0, 20)
        : body.pincode !== undefined
        ? String(body.pincode).trim().slice(0, 20)
        : null;

    let countryId = body.country_id ? Number(body.country_id) : null;
    let stateId = body.state_id ? Number(body.state_id) : null;
    let cityId = body.city_id ? Number(body.city_id) : null;

    // If city name is provided instead of ID, try to lookup or default to first matching city
    if (!cityId && body.city) {
      const [cities] = await connection.execute(
        "SELECT id, state_id FROM cities WHERE name = ? LIMIT 1",
        [String(body.city).trim()]
      );
      if (cities.length) {
        cityId = cities[0].id;
        if (!stateId) stateId = cities[0].state_id;
      }
    }

    // Medical history fields (Lesson 5.5) - sanitize free text length <= 2000 chars
    const allergies = body.allergies !== undefined ? String(body.allergies).trim().slice(0, 2000) : null;
    const chronicConditions =
      body.chronic_conditions !== undefined
        ? String(body.chronic_conditions).trim().slice(0, 2000)
        : null;
    const pastMedicalHistory =
      body.past_medical_history !== undefined
        ? String(body.past_medical_history).trim().slice(0, 2000)
        : null;
    const currentMedications =
      body.current_medications !== undefined
        ? String(body.current_medications).trim().slice(0, 2000)
        : body.current_medicines !== undefined
        ? String(body.current_medicines).trim().slice(0, 2000)
        : null;
    const medicalNotes =
      body.medical_notes !== undefined ? String(body.medical_notes).trim().slice(0, 2000) : null;

    // Fetch existing user data and profile data for completion evaluation
    const [existingUsers] = await connection.execute(
      "SELECT full_name, phone FROM users WHERE id = ? LIMIT 1",
      [patientUserId]
    );
    const [existingProfiles] = await connection.execute(
      "SELECT * FROM patient_profiles WHERE user_id = ? LIMIT 1",
      [patientUserId]
    );

    const existingUser = existingUsers[0] || {};
    const existingProf = existingProfiles[0] || {};

    const effectiveName = fullName !== undefined ? fullName : existingUser.full_name;
    const effectivePhone = phone !== undefined ? phone : existingUser.phone;
    const effectiveDob =
      parsedDob !== null
        ? parsedDob
        : existingProf.dob
        ? new Date(existingProf.dob).toISOString().split("T")[0]
        : null;
    const effectiveGender = normalizedGender !== null ? normalizedGender : existingProf.gender;
    const effectiveBloodGroup =
      normalizedBloodGroup !== null ? normalizedBloodGroup : existingProf.blood_group;
    const effectiveAddress1 = addressLine1 !== null ? addressLine1 : existingProf.address_line1;
    const effectiveEmergencyName =
      emergencyName !== null ? emergencyName : existingProf.emergency_contact_name;
    const effectiveEmergencyPhone =
      emergencyPhone !== null ? emergencyPhone : existingProf.emergency_contact_phone;

    // Check completion criteria on backend using merged effective data
    const completionEval = evaluateProfileCompletion(effectiveName, effectivePhone, {
      dob: effectiveDob,
      gender: effectiveGender,
      blood_group: effectiveBloodGroup,
      address_line1: effectiveAddress1,
      emergency_contact_name: effectiveEmergencyName,
      emergency_contact_phone: effectiveEmergencyPhone,
    });

    const isComplete = completionEval.isComplete;

    await connection.beginTransaction();

    // 1. Update users table if name or phone changed
    if (fullName !== undefined || phone !== undefined) {
      const userUpdates = [];
      const userParams = [];

      if (fullName !== undefined) {
        userUpdates.push("full_name = ?");
        userParams.push(fullName);
      }
      if (phone !== undefined) {
        userUpdates.push("phone = ?");
        userParams.push(phone);
      }

      userParams.push(patientUserId);
      await connection.execute(
        `UPDATE users SET ${userUpdates.join(", ")}, updated_at = NOW() WHERE id = ?`,
        userParams
      );
    }

    // 2. Insert or Update patient_profiles record
    await connection.execute(
      `INSERT INTO patient_profiles
         (user_id, dob, gender, blood_group, address_line1, address_line2,
          country_id, state_id, city_id, postal_code,
          emergency_contact_name, emergency_contact_relationship, emergency_contact_phone,
          allergies, chronic_conditions, past_medical_history, current_medications, medical_notes,
          is_profile_completed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         dob = COALESCE(VALUES(dob), dob),
         gender = COALESCE(VALUES(gender), gender),
         blood_group = COALESCE(VALUES(blood_group), blood_group),
         address_line1 = COALESCE(VALUES(address_line1), address_line1),
         address_line2 = COALESCE(VALUES(address_line2), address_line2),
         country_id = COALESCE(VALUES(country_id), country_id),
         state_id = COALESCE(VALUES(state_id), state_id),
         city_id = COALESCE(VALUES(city_id), city_id),
         postal_code = COALESCE(VALUES(postal_code), postal_code),
         emergency_contact_name = COALESCE(VALUES(emergency_contact_name), emergency_contact_name),
         emergency_contact_relationship = COALESCE(VALUES(emergency_contact_relationship), emergency_contact_relationship),
         emergency_contact_phone = COALESCE(VALUES(emergency_contact_phone), emergency_contact_phone),
         allergies = COALESCE(VALUES(allergies), allergies),
         chronic_conditions = COALESCE(VALUES(chronic_conditions), chronic_conditions),
         past_medical_history = COALESCE(VALUES(past_medical_history), past_medical_history),
         current_medications = COALESCE(VALUES(current_medications), current_medications),
         medical_notes = COALESCE(VALUES(medical_notes), medical_notes),
         is_profile_completed = VALUES(is_profile_completed),
         updated_at = NOW()`,
      [
        patientUserId,
        parsedDob,
        normalizedGender,
        normalizedBloodGroup,
        addressLine1,
        addressLine2,
        countryId,
        stateId,
        cityId,
        postalCode,
        emergencyName,
        emergencyRel,
        emergencyPhone,
        allergies,
        chronicConditions,
        pastMedicalHistory,
        currentMedications,
        medicalNotes,
        isComplete,
      ]
    );

    await connection.commit();

    await logAudit({
      actorId: patientUserId,
      action: "PATIENT_PROFILE_UPDATED",
      targetType: "user",
      targetId: patientUserId,
      details: { isComplete, missingFields: completionEval.missingFields },
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      message: isComplete
        ? "Patient clinical profile successfully completed and verified."
        : "Patient profile saved. Additional information is required to complete profile verification.",
      data: {
        user_id: patientUserId,
        full_name: effectiveName,
        phone: effectivePhone,
        dob: parsedDob,
        gender: normalizedGender,
        blood_group: normalizedBloodGroup,
        address_line1: addressLine1,
        address_line2: addressLine2,
        postal_code: postalCode,
        emergency_contact_name: emergencyName,
        emergency_contact_relationship: emergencyRel,
        emergency_contact_phone: emergencyPhone,
        allergies,
        chronic_conditions: chronicConditions,
        past_medical_history: pastMedicalHistory,
        current_medications: currentMedications,
        medical_notes: medicalNotes,
        is_profile_completed: isComplete,
        missing_fields: completionEval.missingFields,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("Update patient profile error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to update patient profile.",
    });
  } finally {
    connection.release();
  }
});

/**
 * ----------------------------------------------------
 * Check Profile Status Guard
 * ----------------------------------------------------
 */
router.get("/profile/status", requireAuth, allowRoles("patient"), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT is_profile_completed FROM patient_profiles WHERE user_id = ? LIMIT 1`,
      [req.user.id]
    );

    const isComplete = rows.length > 0 ? Boolean(rows[0].is_profile_completed) : false;

    return res.json({
      success: true,
      isProfileCompleted: isComplete,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Unable to check profile status." });
  }
});

const VALID_RECORD_TYPES = [
  "consultation_note",
  "consultation",
  "prescription",
  "lab_report",
  "diagnostic_imaging",
  "discharge_summary",
];

/**
 * ----------------------------------------------------
 * Lesson 5.7: List Medical Records
 * Patient: Only sees their own medical records
 * Clinical Staff/Doctor/Hospital Admin: Scoped to their hospital
 * ----------------------------------------------------
 */
router.get("/medical-records", requireAuth, async (req, res) => {
  try {
    const { role, id: userId, hospitalId } = req.user;
    const { type, patient_id } = req.query || {};

    let sql = `
      SELECT
        pmr.id,
        pmr.patient_id,
        u.full_name AS patient_name,
        pmr.hospital_id,
        h.name AS hospital_name,
        pmr.doctor_id,
        d.full_name AS doctor_name,
        pmr.appointment_id,
        pmr.record_type,
        pmr.title,
        pmr.description,
        pmr.diagnosis,
        pmr.doctor_notes,
        pmr.file_url,
        pmr.file_name,
        pmr.created_at,
        pmr.updated_at
      FROM patient_medical_records pmr
      JOIN users u ON u.id = pmr.patient_id
      JOIN hospitals h ON h.id = pmr.hospital_id
      LEFT JOIN users d ON d.id = pmr.doctor_id
      WHERE 1=1
    `;
    const params = [];

    if (role === "patient") {
      sql += " AND pmr.patient_id = ?";
      params.push(userId);
    } else if (["doctor", "hospital_admin", "staff"].includes(role)) {
      if (!hospitalId) {
        return res.status(403).json({
          success: false,
          message: "No hospital assigned to this staff account.",
        });
      }
      sql += " AND pmr.hospital_id = ?";
      params.push(hospitalId);

      if (patient_id) {
        sql += " AND pmr.patient_id = ?";
        params.push(Number(patient_id));
      }
    } else {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Not authorized to view medical records.",
      });
    }

    if (type && VALID_RECORD_TYPES.includes(type)) {
      const dbType = type === "consultation" ? "consultation_note" : type;
      sql += " AND (pmr.record_type = ? OR pmr.record_type = ?)";
      params.push(type, dbType);
    }

    sql += " ORDER BY pmr.created_at DESC";

    const [records] = await pool.execute(sql, params);

    return res.json({
      success: true,
      count: records.length,
      data: records,
    });
  } catch (error) {
    console.error("List medical records failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve medical records.",
    });
  }
});

/**
 * ----------------------------------------------------
 * Lesson 5.7: Get Single Medical Record with Strict IDOR Protection
 * ----------------------------------------------------
 */
router.get("/medical-records/:id", requireAuth, async (req, res) => {
  try {
    const recordId = Number(req.params.id);
    if (!Number.isSafeInteger(recordId) || recordId < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid medical record ID.",
      });
    }

    const [records] = await pool.execute(
      `SELECT
         pmr.id,
         pmr.patient_id,
         u.full_name AS patient_name,
         pmr.hospital_id,
         h.name AS hospital_name,
         pmr.doctor_id,
         d.full_name AS doctor_name,
         pmr.appointment_id,
         pmr.record_type,
         pmr.title,
         pmr.description,
         pmr.diagnosis,
         pmr.doctor_notes,
         pmr.file_url,
         pmr.file_name,
         pmr.created_at,
         pmr.updated_at
       FROM patient_medical_records pmr
       JOIN users u ON u.id = pmr.patient_id
       JOIN hospitals h ON h.id = pmr.hospital_id
       LEFT JOIN users d ON d.id = pmr.doctor_id
       WHERE pmr.id = ?
       LIMIT 1`,
      [recordId]
    );

    if (!records.length) {
      return res.status(404).json({
        success: false,
        message: "Medical record not found.",
      });
    }

    const record = records[0];

    // IDOR Protection: Patient can only access their own record
    if (req.user.role === "patient" && String(record.patient_id) !== String(req.user.id)) {
      return res.status(403).json({
        success: false,
        message:
          "Access Denied: You do not have permission to access another patient's medical record.",
      });
    }

    // Facility Protection: Doctors/Staff can only access records from their assigned hospital
    if (["doctor", "hospital_admin", "staff"].includes(req.user.role)) {
      if (String(record.hospital_id) !== String(req.user.hospitalId)) {
        return res.status(403).json({
          success: false,
          message:
            "Access Denied: Cross-hospital medical record access is strictly forbidden.",
        });
      }
    }

    await logAudit({
      actorId: req.user.id,
      action: "MEDICAL_RECORD_ACCESSED",
      targetType: "patient_medical_record",
      targetId: recordId,
      details: {
        recordType: record.record_type,
        patientId: record.patient_id,
        actorRole: req.user.role,
      },
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      data: record,
    });
  } catch (error) {
    console.error("Fetch single medical record failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve medical record.",
    });
  }
});

/**
 * ----------------------------------------------------
 * Lesson 5.7: Create Medical Record (Doctors & Authorized Healthcare Personnel)
 * Patients CANNOT create clinical medical records for themselves.
 * ----------------------------------------------------
 */
router.post(
  "/medical-records",
  requireAuth,
  allowRoles("doctor", "hospital_admin", "staff"),
  uploadMedicalDocument.single("file"),
  async (req, res) => {
    try {
      const {
        patient_id,
        record_type,
        title,
        description,
        diagnosis,
        doctor_notes,
        appointment_id,
      } = req.body || {};

      const hospitalId = Number(req.user.hospitalId);
      if (!Number.isSafeInteger(hospitalId) || hospitalId < 1) {
        return res.status(403).json({
          success: false,
          message: "No active hospital assignment found for your staff account.",
        });
      }

      const patientId = Number(patient_id);
      if (!Number.isSafeInteger(patientId) || patientId < 1) {
        return res.status(400).json({
          success: false,
          message: "Valid patient_id is required.",
        });
      }

      // Verify patient exists and has role 'patient'
      const [patientCheck] = await pool.execute(
        `SELECT u.id FROM users u
         JOIN roles r ON r.id = u.role_id
         WHERE u.id = ? AND r.name = 'patient' LIMIT 1`,
        [patientId]
      );

      if (!patientCheck.length) {
        return res.status(400).json({
          success: false,
          message: "Patient account not found in system.",
        });
      }

      if (
        !title ||
        typeof title !== "string" ||
        !title.trim() ||
        title.trim().length > 200
      ) {
        return res.status(400).json({
          success: false,
          message: "Title is required and must not exceed 200 characters.",
        });
      }

      if (!record_type || !VALID_RECORD_TYPES.includes(record_type)) {
        return res.status(400).json({
          success: false,
          message: `record_type must be one of: ${VALID_RECORD_TYPES.join(", ")}.`,
        });
      }

      let fileUrl = null;
      let fileName = null;

      if (req.file) {
        fileUrl = `/uploads/medical_records/${req.file.filename}`;
        fileName = req.file.originalname;
      }

      const doctorId =
        req.user.role === "doctor"
          ? req.user.id
          : req.body.doctor_id
          ? Number(req.body.doctor_id)
          : null;
      const apptId = appointment_id ? Number(appointment_id) : null;

      const dbRecordType = record_type === "consultation" ? "consultation_note" : record_type;

      const [insertRes] = await pool.execute(
        `INSERT INTO patient_medical_records
           (patient_id, hospital_id, doctor_id, appointment_id,
            record_type, title, description, diagnosis, doctor_notes,
            file_url, file_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          patientId,
          hospitalId,
          doctorId,
          apptId,
          dbRecordType,
          title.trim(),
          description ? String(description).trim().slice(0, 2000) : null,
          diagnosis ? String(diagnosis).trim().slice(0, 255) : null,
          doctor_notes ? String(doctor_notes).trim().slice(0, 2000) : null,
          fileUrl,
          fileName,
        ]
      );

      const recordId = insertRes.insertId;

      await logAudit({
        actorId: req.user.id,
        action: "MEDICAL_RECORD_CREATED",
        targetType: "patient_medical_record",
        targetId: recordId,
        details: {
          patientId,
          hospitalId,
          recordType: record_type,
          doctorId,
        },
        ipAddress: req.ip,
      });

      return res.status(201).json({
        success: true,
        message: "Medical record successfully created.",
        data: {
          id: recordId,
          patient_id: patientId,
          hospital_id: hospitalId,
          doctor_id: doctorId,
          record_type,
          title: title.trim(),
          diagnosis: diagnosis || null,
          file_url: fileUrl,
          file_name: fileName,
        },
      });
    } catch (error) {
      console.error("Create medical record failed:", error.message);
      return res.status(500).json({
        success: false,
        message: "Unable to create medical record.",
      });
    }
  }
);

/**
 * ----------------------------------------------------
 * Lesson 5.8: Patient Dashboard Overview & Telemetry
 * ----------------------------------------------------
 */
router.get("/dashboard", requireAuth, allowRoles("patient"), async (req, res) => {
  try {
    const patientId = req.user.id;

    // 1. Profile Status
    const [profileRows] = await pool.execute(
      `SELECT u.full_name, u.email, u.phone, pp.*
       FROM users u
       LEFT JOIN patient_profiles pp ON pp.user_id = u.id
       WHERE u.id = ? LIMIT 1`,
      [patientId]
    );

    const userRow = profileRows[0] || {};
    const evalResult = evaluateProfileCompletion(userRow.full_name, userRow.phone, userRow);

    // 2. Appointments counts and next upcoming
    const [appointments] = await pool.execute(
      `SELECT
         a.id,
         a.appointment_number,
         a.hospital_id,
         h.name AS hospital_name,
         a.department_id,
         d.name AS department_name,
         a.doctor_id,
         doc.full_name AS doctor_name,
         a.appointment_date,
         a.appointment_time,
         a.status,
         a.reason,
         a.consultation_fee
       FROM appointments a
       JOIN hospitals h ON h.id = a.hospital_id
       JOIN departments d ON d.id = a.department_id
       JOIN users doc ON doc.id = a.doctor_id
       WHERE a.patient_id = ?
       ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
      [patientId]
    );

    const todayStr = new Date().toISOString().split("T")[0];

    const upcomingList = appointments.filter((a) => {
      const isStatusActive = ["pending", "confirmed", "in_waiting", "in_progress"].includes(a.status);
      const isDateFutureOrToday = a.appointment_date >= todayStr;
      return isStatusActive && isDateFutureOrToday;
    });

    const pastList = appointments.filter((a) => {
      return !upcomingList.includes(a);
    });

    const nextUpcoming = upcomingList.length > 0 ? upcomingList[0] : null;

    // 3. Medical Records
    const [records] = await pool.execute(
      `SELECT
         pmr.id,
         pmr.record_type,
         pmr.title,
         pmr.diagnosis,
         pmr.file_url,
         pmr.created_at,
         h.name AS hospital_name,
         doc.full_name AS doctor_name
       FROM patient_medical_records pmr
       JOIN hospitals h ON h.id = pmr.hospital_id
       LEFT JOIN users doc ON doc.id = pmr.doctor_id
       WHERE pmr.patient_id = ?
       ORDER BY pmr.created_at DESC
       LIMIT 5`,
      [patientId]
    );

    return res.json({
      success: true,
      data: {
        profile: {
          full_name: userRow.full_name,
          email: userRow.email,
          phone: userRow.phone,
          is_profile_completed: evalResult.isComplete,
          missing_fields: evalResult.missingFields,
        },
        metrics: {
          upcoming_appointments_count: upcomingList.length,
          past_appointments_count: pastList.length,
          total_appointments_count: appointments.length,
          medical_records_count: records.length,
        },
        next_appointment: nextUpcoming,
        recent_appointments: appointments.slice(0, 5),
        recent_medical_records: records,
      },
    });
  } catch (error) {
    console.error("Dashboard overview failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve patient dashboard overview.",
    });
  }
});

/**
 * ----------------------------------------------------
 * Lesson 5.8: Patient Appointment History & Filtering
 * ----------------------------------------------------
 */
router.get("/appointments", requireAuth, allowRoles("patient"), async (req, res) => {
  try {
    const patientId = req.user.id;
    const { status, filter } = req.query || {};

    let sql = `
      SELECT
        a.id,
        a.appointment_number,
        a.hospital_id,
        h.name AS hospital_name,
        a.department_id,
        d.name AS department_name,
        a.doctor_id,
        doc.full_name AS doctor_name,
        a.appointment_date,
        a.appointment_time,
        a.status,
        a.reason,
        a.payment_method,
        a.consultation_fee,
        a.created_at
      FROM appointments a
      JOIN hospitals h ON h.id = a.hospital_id
      JOIN departments d ON d.id = a.department_id
      JOIN users doc ON doc.id = a.doctor_id
      WHERE a.patient_id = ?
    `;
    const params = [patientId];

    if (status) {
      sql += " AND a.status = ?";
      params.push(status.toLowerCase());
    }

    const todayStr = new Date().toISOString().split("T")[0];
    if (filter === "upcoming") {
      sql += " AND a.appointment_date >= ? AND a.status IN ('pending', 'confirmed', 'in_waiting', 'in_progress')";
      params.push(todayStr);
      sql += " ORDER BY a.appointment_date ASC, a.appointment_time ASC";
    } else if (filter === "past") {
      sql += " AND (a.appointment_date < ? OR a.status IN ('completed', 'cancelled'))";
      params.push(todayStr);
      sql += " ORDER BY a.appointment_date DESC, a.appointment_time DESC";
    } else {
      sql += " ORDER BY a.appointment_date DESC, a.appointment_time DESC";
    }

    const [rows] = await pool.execute(sql, params);

    return res.json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error("List patient appointments failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve patient appointments.",
    });
  }
});

/**
 * ----------------------------------------------------
 * Lesson 5.8: Patient Appointment Booking & Mandatory Profile Check
 * ----------------------------------------------------
 */
router.post("/appointments", requireAuth, allowRoles("patient"), async (req, res) => {
  try {
    const patientId = req.user.id;
    const {
      hospital_id,
      department_id,
      doctor_id,
      appointment_date,
      appointment_time,
      reason,
      payment_method = "cash",
      consultation_fee = 0,
    } = req.body || {};

    // 1. Mandatory Profile Check
    const [profileRows] = await pool.execute(
      `SELECT u.full_name, u.phone, pp.*
       FROM users u
       LEFT JOIN patient_profiles pp ON pp.user_id = u.id
       WHERE u.id = ? LIMIT 1`,
      [patientId]
    );

    const profileData = profileRows[0] || {};
    const evalResult = evaluateProfileCompletion(profileData.full_name, profileData.phone, profileData);

    if (!evalResult.isComplete) {
      return res.status(403).json({
        success: false,
        message: "Please complete your mandatory profile details before booking appointments.",
        missing_fields: evalResult.missingFields,
      });
    }

    // 2. Validation
    if (!hospital_id || !department_id || !doctor_id || !appointment_date || !appointment_time) {
      return res.status(400).json({
        success: false,
        message: "hospital_id, department_id, doctor_id, appointment_date, and appointment_time are required.",
      });
    }

    // Date bounds: Not in past, Not beyond 90 days
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(appointment_date);
    targetDate.setHours(0, 0, 0, 0);

    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ success: false, message: "Invalid appointment_date format (YYYY-MM-DD)." });
    }

    if (targetDate < today) {
      return res.status(400).json({ success: false, message: "Appointment date cannot be in the past." });
    }

    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + 90);
    if (targetDate > maxDate) {
      return res.status(400).json({ success: false, message: "Appointment booking is restricted to a 90-day window." });
    }

    // Verify hospital, department, doctor exist
    const [hospCheck] = await pool.execute(
      "SELECT id, name FROM hospitals WHERE id = ? AND status = 'active' LIMIT 1",
      [hospital_id]
    );
    if (!hospCheck.length) {
      return res.status(400).json({ success: false, message: "Selected hospital is not active or not found." });
    }

    const [deptCheck] = await pool.execute(
      "SELECT id FROM departments WHERE id = ? AND hospital_id = ? LIMIT 1",
      [department_id, hospital_id]
    );
    if (!deptCheck.length) {
      return res.status(400).json({ success: false, message: "Department not found in the selected hospital." });
    }

    const [docCheck] = await pool.execute(
      "SELECT id, full_name FROM users WHERE id = ? AND hospital_id = ? AND department_id = ? LIMIT 1",
      [doctor_id, hospital_id, department_id]
    );
    if (!docCheck.length) {
      return res.status(400).json({ success: false, message: "Doctor does not belong to the selected hospital and department." });
    }

    // Collision Check: Doctor cannot have 2 active appointments at the exact same date and time
    const [collisionCheck] = await pool.execute(
      `SELECT id FROM appointments
       WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ? AND status NOT IN ('cancelled')
       LIMIT 1`,
      [doctor_id, appointment_date, appointment_time]
    );

    if (collisionCheck.length) {
      return res.status(409).json({
        success: false,
        message: "The requested time slot is already occupied. Please select another slot.",
      });
    }

    const aptNumber = `APT-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const [insertRes] = await pool.execute(
      `INSERT INTO appointments
         (appointment_number, patient_id, hospital_id, department_id, doctor_id,
          appointment_date, appointment_time, status, reason, payment_method, consultation_fee)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?)`,
      [
        aptNumber,
        patientId,
        hospital_id,
        department_id,
        doctor_id,
        appointment_date,
        appointment_time,
        reason ? String(reason).trim().slice(0, 1000) : "Consultation",
        payment_method.toLowerCase() === "upi" ? "upi" : "cash",
        Number(consultation_fee) || 0.0,
      ]
    );

    const appointmentId = insertRes.insertId;

    await logAudit({
      actorId: patientId,
      action: "APPOINTMENT_BOOKED",
      targetType: "appointment",
      targetId: appointmentId,
      details: {
        appointmentNumber: aptNumber,
        hospitalId: hospital_id,
        doctorId: doctor_id,
        date: appointment_date,
        time: appointment_time,
      },
      ipAddress: req.ip,
    });

    return res.status(201).json({
      success: true,
      message: "Appointment successfully booked.",
      data: {
        id: appointmentId,
        appointment_number: aptNumber,
        hospital_id,
        department_id,
        doctor_id,
        appointment_date,
        appointment_time,
        status: "confirmed",
        reason,
        payment_method,
        consultation_fee,
      },
    });
  } catch (error) {
    console.error("Book appointment failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to complete appointment booking.",
    });
  }
});

/**
 * ----------------------------------------------------
 * Lesson 5.8: Cancel Appointment with Strict IDOR Validation
 * ----------------------------------------------------
 */
router.patch("/appointments/:id/cancel", requireAuth, allowRoles("patient"), async (req, res) => {
  try {
    const appointmentId = Number(req.params.id);
    const patientId = req.user.id;

    if (!Number.isSafeInteger(appointmentId) || appointmentId < 1) {
      return res.status(400).json({ success: false, message: "Invalid appointment ID." });
    }

    const [rows] = await pool.execute(
      "SELECT id, patient_id, status FROM appointments WHERE id = ? LIMIT 1",
      [appointmentId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Appointment not found." });
    }

    const apt = rows[0];

    // IDOR Protection: Patient can only cancel their own appointment
    if (String(apt.patient_id) !== String(patientId)) {
      return res.status(403).json({
        success: false,
        message: "Access Denied: You do not have permission to modify another patient's appointment.",
      });
    }

    if (["completed", "cancelled"].includes(apt.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel an appointment that is already ${apt.status}.`,
      });
    }

    await pool.execute("UPDATE appointments SET status = 'cancelled' WHERE id = ?", [appointmentId]);

    await logAudit({
      actorId: patientId,
      action: "APPOINTMENT_CANCELLED",
      targetType: "appointment",
      targetId: appointmentId,
      details: { cancelledBy: "patient" },
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      message: "Appointment successfully cancelled.",
    });
  } catch (error) {
    console.error("Cancel appointment failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to cancel appointment.",
    });
  }
});

module.exports = router;

