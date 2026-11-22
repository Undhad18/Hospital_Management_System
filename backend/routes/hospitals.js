const express = require("express");
const pool = require("../db");
const QRCode = require("qrcode");
const { requireAuth, allowRoles, optionalAuth } = require("../middleware/auth");
const { uploadHospitalMedia } = require("../middleware/upload");
const { logAudit } = require("../services/auditService");
const { emitHospitalEvent } = require("../services/socketService");

const router = express.Router();


const UPI_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]{6,20}$/;

async function generateUpiQrCode(upiId, payeeName) {
  if (!upiId || !UPI_REGEX.test(upiId.trim())) {
    return null;
  }
  const cleanUpi = upiId.trim();
  const cleanPayee = (payeeName || "Hospital").trim();
  const upiUri = `upi://pay?pa=${cleanUpi}&pn=${encodeURIComponent(cleanPayee)}&cu=INR`;
  try {
    return await QRCode.toDataURL(upiUri, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 300,
      color: {
        dark: "#0F172A",
        light: "#FFFFFF",
      },
    });
  } catch (err) {
    console.error("QR Code generation failed:", err.message);
    return null;
  }
}

// GET /api/hospitals — List hospitals
router.get("/", optionalAuth, async (req, res) => {
  try {
    let sql = `
      SELECT
        h.id, h.name, h.code, h.email, h.phone, h.address,
        h.postal_code, h.city_id, h.logo_url, h.image_url,
        h.working_hours, h.upi_id, h.payee_name, h.qr_code_url,
        h.status, h.created_at, h.updated_at,
        c.name AS city_name,
        s.name AS state_name,
        co.name AS country_name
      FROM hospitals h
      LEFT JOIN cities c ON c.id = h.city_id
      LEFT JOIN states s ON s.id = c.state_id
      LEFT JOIN countries co ON co.id = s.country_id
    `;
    const params = [];

        if (req.user && req.user.role === "hospital_admin") {
      if (!req.user.hospitalId) {
        return res.status(403).json({
          success: false,
          message: "No hospital is assigned to this account",
        });
      }
      sql += " WHERE h.id = ?";
      params.push(req.user.hospitalId);
    } else if (!req.user || req.user.role !== "super_admin") {
      // Unauthenticated public visitors, patients, doctors, and staff can view active hospitals
      sql += " WHERE h.status = 'active'";
    }

    sql += " ORDER BY h.name";

    const [hospitals] = await pool.execute(sql, params);

    return res.json({
      success: true,
      count: hospitals.length,
      data: hospitals,
    });
  } catch (error) {
    console.error("Failed to fetch hospitals:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve hospitals",
    });
  }
});

// GET /api/hospitals/:id — Get single hospital details
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid hospital ID",
      });
    }

        if (req.user && req.user.role === "hospital_admin" && req.user.hospitalId !== id) {
      return res.status(403).json({
        success: false,
        message: "You can only view your own assigned hospital",
      });
    }

    const [hospitals] = await pool.execute(
      `SELECT
        h.id, h.name, h.code, h.email, h.phone, h.address,
        h.postal_code, h.city_id, h.logo_url, h.image_url,
        h.working_hours, h.upi_id, h.payee_name, h.qr_code_url,
        h.status, h.created_at, h.updated_at,
        c.name AS city_name,
        s.name AS state_name,
        co.name AS country_name
      FROM hospitals h
      LEFT JOIN cities c ON c.id = h.city_id
      LEFT JOIN states s ON s.id = c.state_id
      LEFT JOIN countries co ON co.id = s.country_id
      WHERE h.id = ?
      LIMIT 1`,
      [id]
    );

    if (!hospitals.length) {
      return res.status(404).json({
        success: false,
        message: "Hospital not found",
      });
    }

    const hospital = hospitals[0];

    // Patients, doctors, staff can only view active hospital
        if ((!req.user || !["super_admin", "hospital_admin"].includes(req.user.role)) && hospital.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "This hospital is inactive",
      });
    }

    return res.json({
      success: true,
      data: hospital,
    });
  } catch (error) {
    console.error("Failed to fetch hospital detail:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve hospital details",
    });
  }
});

// GET /api/hospitals/:id/qr — Get dynamic UPI QR code
router.get("/:id/qr", optionalAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid hospital ID",
      });
    }

    if (req.user.role === "hospital_admin" && req.user.hospitalId !== id) {
      return res.status(403).json({
        success: false,
        message: "You can only view payment configuration for your assigned hospital",
      });
    }

    const [rows] = await pool.execute(
      "SELECT id, name, upi_id, payee_name, qr_code_url FROM hospitals WHERE id = ?",
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Hospital not found",
      });
    }

    const hospital = rows[0];
    if (!hospital.upi_id) {
      return res.status(400).json({
        success: false,
        message: "UPI payment details are not configured for this hospital",
      });
    }

    let qrCode = hospital.qr_code_url;
    if (!qrCode) {
      qrCode = await generateUpiQrCode(hospital.upi_id, hospital.payee_name || hospital.name);
      if (qrCode) {
        await pool.execute("UPDATE hospitals SET qr_code_url = ? WHERE id = ?", [qrCode, id]);
      }
    }

    return res.json({
      success: true,
      data: {
        hospital_id: hospital.id,
        hospital_name: hospital.name,
        upi_id: hospital.upi_id,
        payee_name: hospital.payee_name || hospital.name,
        qr_code: qrCode,
        payment_uri: `upi://pay?pa=${hospital.upi_id}&pn=${encodeURIComponent(hospital.payee_name || hospital.name)}&cu=INR`,
      },
    });
  } catch (error) {
    console.error("Failed to generate or fetch hospital QR code:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to load hospital QR code",
    });
  }
});

router.use(requireAuth);

// POST /api/hospitals — Create a hospital (Super Admin only)
router.post("/", allowRoles("super_admin"), async (req, res) => {
  try {
    const {
      name,
      code,
      email,
      phone,
      address,
      postal_code,
      city_id,
      working_hours,
      upi_id,
      payee_name,
    } = req.body || {};

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Hospital name is required",
      });
    }

    if (typeof code !== "string" || !code.trim()) {
      return res.status(400).json({
        success: false,
        message: "Hospital code is required",
      });
    }

    if (email && (!EMAIL_REGEX.test(email.trim()) || email.trim().length > 150)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email address format",
      });
    }

    if (phone && !PHONE_REGEX.test(phone.trim())) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number format",
      });
    }

    if (upi_id && !UPI_REGEX.test(upi_id.trim())) {
      return res.status(400).json({
        success: false,
        message: "Invalid UPI ID format (e.g. hospital@bank)",
      });
    }

    // Validate city if provided
    let verifiedCityId = null;
    if (city_id !== undefined && city_id !== null && city_id !== "") {
      const cityNum = Number(city_id);
      if (!Number.isSafeInteger(cityNum) || cityNum < 1) {
        return res.status(400).json({
          success: false,
          message: "Invalid city ID",
        });
      }
      const [cities] = await pool.execute("SELECT id FROM cities WHERE id = ? AND status = 'active'", [cityNum]);
      if (!cities.length) {
        return res.status(400).json({
          success: false,
          message: "Selected city does not exist or is inactive",
        });
      }
      verifiedCityId = cityNum;
    }

    // Serialize working hours
    let serializedWorkingHours = null;
    if (working_hours) {
      serializedWorkingHours =
        typeof working_hours === "object"
          ? JSON.stringify(working_hours)
          : String(working_hours);
    }

    // Pre-generate QR if UPI ID is present
    let qrCode = null;
    if (upi_id && UPI_REGEX.test(upi_id.trim())) {
      qrCode = await generateUpiQrCode(upi_id.trim(), payee_name || name.trim());
    }

    const [result] = await pool.execute(
      `INSERT INTO hospitals
        (name, code, email, phone, address, postal_code, city_id, working_hours, upi_id, payee_name, qr_code_url, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        name.trim(),
        code.trim().toUpperCase(),
        email ? email.trim() : null,
        phone ? phone.trim() : null,
        address ? address.trim() : null,
        postal_code ? postal_code.trim() : null,
        verifiedCityId,
        serializedWorkingHours,
        upi_id ? upi_id.trim() : null,
        payee_name ? payee_name.trim() : null,
        qrCode,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Hospital created successfully",
      data: { id: result.insertId },
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Hospital code already exists",
      });
    }

    console.error("Hospital creation failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to create hospital",
    });
  }
});

// PATCH /api/hospitals/:id/profile — Update hospital profile details (Hospital Admin or Super Admin)
router.patch("/:id/profile", allowRoles("super_admin", "hospital_admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid hospital ID",
      });
    }

    // Hospital Admin can ONLY edit their own hospital
    if (req.user.role === "hospital_admin") {
      if (!req.user.hospitalId || req.user.hospitalId !== id) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to edit another hospital's profile",
        });
      }
    }

    const {
      name,
      email,
      phone,
      address,
      postal_code,
      city_id,
      working_hours,
      upi_id,
      payee_name,
    } = req.body || {};

    const updates = [];
    const values = [];

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Hospital name cannot be empty",
        });
      }
      updates.push("name = ?");
      values.push(name.trim());
    }

    if (email !== undefined) {
      if (email && (!EMAIL_REGEX.test(email.trim()) || email.trim().length > 150)) {
        return res.status(400).json({
          success: false,
          message: "Invalid email format",
        });
      }
      updates.push("email = ?");
      values.push(email ? email.trim() : null);
    }

    if (phone !== undefined) {
      if (phone && !PHONE_REGEX.test(phone.trim())) {
        return res.status(400).json({
          success: false,
          message: "Invalid phone format",
        });
      }
      updates.push("phone = ?");
      values.push(phone ? phone.trim() : null);
    }

    if (address !== undefined) {
      updates.push("address = ?");
      values.push(address ? address.trim() : null);
    }

    if (postal_code !== undefined) {
      updates.push("postal_code = ?");
      values.push(postal_code ? postal_code.trim() : null);
    }

    if (city_id !== undefined) {
      if (city_id === null || city_id === "") {
        updates.push("city_id = ?");
        values.push(null);
      } else {
        const cityNum = Number(city_id);
        if (!Number.isSafeInteger(cityNum) || cityNum < 1) {
          return res.status(400).json({
            success: false,
            message: "Invalid city ID",
          });
        }
        const [cities] = await pool.execute("SELECT id FROM cities WHERE id = ? AND status = 'active'", [cityNum]);
        if (!cities.length) {
          return res.status(400).json({
            success: false,
            message: "Selected city does not exist or is inactive",
          });
        }
        updates.push("city_id = ?");
        values.push(cityNum);
      }
    }

    if (working_hours !== undefined) {
      let serialized = null;
      if (working_hours) {
        serialized = typeof working_hours === "object" ? JSON.stringify(working_hours) : String(working_hours);
      }
      updates.push("working_hours = ?");
      values.push(serialized);
    }

    let regenerateQr = false;
    let newUpiId = null;
    let newPayeeName = null;

    if (upi_id !== undefined) {
      if (upi_id && !UPI_REGEX.test(upi_id.trim())) {
        return res.status(400).json({
          success: false,
          message: "Invalid UPI format (e.g. hospital@bank)",
        });
      }
      newUpiId = upi_id ? upi_id.trim() : null;
      updates.push("upi_id = ?");
      values.push(newUpiId);
      regenerateQr = true;
    }

    if (payee_name !== undefined) {
      newPayeeName = payee_name ? payee_name.trim() : null;
      updates.push("payee_name = ?");
      values.push(newPayeeName);
      regenerateQr = true;
    }

    if (regenerateQr) {
      const [currHosp] = await pool.execute("SELECT name, upi_id, payee_name FROM hospitals WHERE id = ?", [id]);
      const activeUpi = newUpiId !== null ? newUpiId : currHosp[0]?.upi_id;
      const activePayee = newPayeeName !== null ? newPayeeName : (currHosp[0]?.payee_name || currHosp[0]?.name);

      let newQr = null;
      if (activeUpi) {
        newQr = await generateUpiQrCode(activeUpi, activePayee);
      }
      updates.push("qr_code_url = ?");
      values.push(newQr);
    }

    if (!updates.length) {
      return res.status(400).json({
        success: false,
        message: "No fields provided to update",
      });
    }

    values.push(id);
    const [result] = await pool.execute(
      `UPDATE hospitals SET ${updates.join(", ")} WHERE id = ?`,
      values
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Hospital not found",
      });
    }

    emitHospitalEvent(id, "hospital:updated", {
      action: "profile_updated",
      hospitalId: id,
    });

    return res.json({
      success: true,
      message: "Hospital profile updated successfully",
    });
  } catch (error) {
    console.error("Profile update failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to update hospital profile",
    });
  }
});

// POST /api/hospitals/:id/images — Upload hospital logo or showcase banner
router.post(
  "/:id/images",
  allowRoles("super_admin", "hospital_admin"),
  (req, res, next) => {
    uploadHospitalMedia.fields([
      { name: "logo", maxCount: 1 },
      { name: "image", maxCount: 1 },
    ])(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message || "Failed to upload image",
        });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1) {
        return res.status(400).json({
          success: false,
          message: "Invalid hospital ID",
        });
      }

      if (req.user.role === "hospital_admin" && req.user.hospitalId !== id) {
        return res.status(403).json({
          success: false,
          message: "You can only upload images for your assigned hospital",
        });
      }

      const updates = [];
      const values = [];
      const fileData = {};

      if (req.files?.logo && req.files.logo[0]) {
        const logoUrl = `/uploads/hospitals/${req.files.logo[0].filename}`;
        updates.push("logo_url = ?");
        values.push(logoUrl);
        fileData.logo_url = logoUrl;
      }

      if (req.files?.image && req.files.image[0]) {
        const imageUrl = `/uploads/hospitals/${req.files.image[0].filename}`;
        updates.push("image_url = ?");
        values.push(imageUrl);
        fileData.image_url = imageUrl;
      }

      if (!updates.length) {
        return res.status(400).json({
          success: false,
          message: "Please select a logo or banner image file to upload",
        });
      }

      values.push(id);
      const [result] = await pool.execute(
        `UPDATE hospitals SET ${updates.join(", ")} WHERE id = ?`,
        values
      );

      if (!result.affectedRows) {
        return res.status(404).json({
          success: false,
          message: "Hospital not found",
        });
      }

      return res.json({
        success: true,
        message: "Hospital images uploaded successfully",
        data: fileData,
      });
    } catch (error) {
      console.error("Image upload failed:", error.message);
      return res.status(500).json({
        success: false,
        message: "Unable to save uploaded image",
      });
    }
  }
);

// PATCH /api/hospitals/:id — Update hospital (Super Admin only, can update code & status)
router.patch("/:id", allowRoles("super_admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid hospital ID",
      });
    }

    const {
      name,
      code,
      email,
      phone,
      address,
      postal_code,
      city_id,
      working_hours,
      upi_id,
      payee_name,
      status,
    } = req.body || {};

    const updates = [];
    const values = [];

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Hospital name cannot be empty",
        });
      }
      updates.push("name = ?");
      values.push(name.trim());
    }

    if (code !== undefined) {
      if (typeof code !== "string" || !code.trim()) {
        return res.status(400).json({
          success: false,
          message: "Hospital code cannot be empty",
        });
      }
      updates.push("code = ?");
      values.push(code.trim().toUpperCase());
    }

    if (email !== undefined) {
      if (email && (!EMAIL_REGEX.test(email.trim()) || email.trim().length > 150)) {
        return res.status(400).json({
          success: false,
          message: "Invalid email format",
        });
      }
      updates.push("email = ?");
      values.push(email ? email.trim() : null);
    }

    if (phone !== undefined) {
      if (phone && !PHONE_REGEX.test(phone.trim())) {
        return res.status(400).json({
          success: false,
          message: "Invalid phone format",
        });
      }
      updates.push("phone = ?");
      values.push(phone ? phone.trim() : null);
    }

    if (address !== undefined) {
      updates.push("address = ?");
      values.push(address ? address.trim() : null);
    }

    if (postal_code !== undefined) {
      updates.push("postal_code = ?");
      values.push(postal_code ? postal_code.trim() : null);
    }

    if (city_id !== undefined) {
      if (city_id === null || city_id === "") {
        updates.push("city_id = ?");
        values.push(null);
      } else {
        const cityNum = Number(city_id);
        if (!Number.isSafeInteger(cityNum) || cityNum < 1) {
          return res.status(400).json({
            success: false,
            message: "Invalid city ID",
          });
        }
        updates.push("city_id = ?");
        values.push(cityNum);
      }
    }

    if (working_hours !== undefined) {
      const serialized = working_hours
        ? typeof working_hours === "object"
          ? JSON.stringify(working_hours)
          : String(working_hours)
        : null;
      updates.push("working_hours = ?");
      values.push(serialized);
    }

    if (upi_id !== undefined) {
      if (upi_id && !UPI_REGEX.test(upi_id.trim())) {
        return res.status(400).json({
          success: false,
          message: "Invalid UPI format",
        });
      }
      updates.push("upi_id = ?");
      values.push(upi_id ? upi_id.trim() : null);
    }

    if (payee_name !== undefined) {
      updates.push("payee_name = ?");
      values.push(payee_name ? payee_name.trim() : null);
    }

    if (status !== undefined) {
      if (!["active", "inactive"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Status must be active or inactive",
        });
      }
      updates.push("status = ?");
      values.push(status);
    }

    if (!updates.length) {
      return res.status(400).json({
        success: false,
        message: "Provide at least one field to update",
      });
    }

    values.push(id);
    const [result] = await pool.execute(
      `UPDATE hospitals SET ${updates.join(", ")} WHERE id = ?`,
      values
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Hospital not found",
      });
    }

    return res.json({
      success: true,
      message: "Hospital updated successfully",
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Hospital code already exists",
      });
    }

    console.error("Hospital update failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to update hospital",
    });
  }
});

// PATCH /api/hospitals/:id/status — Toggle hospital status (Super Admin only)
router.patch("/:id/status", allowRoles("super_admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status, reason } = req.body || {};

    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid hospital ID",
      });
    }

    if (!["active", "inactive"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be 'active' or 'inactive'",
      });
    }

    const [existing] = await pool.execute(
      "SELECT id, name, status FROM hospitals WHERE id = ? LIMIT 1",
      [id]
    );

    if (!existing.length) {
      return res.status(404).json({
        success: false,
        message: "Hospital not found",
      });
    }

    const currentHosp = existing[0];
    const previousStatus = currentHosp.status;

    await pool.execute("UPDATE hospitals SET status = ? WHERE id = ?", [status, id]);

    // Record administrative change in audit trail
    await logAudit({
      actorId: req.user.id,
      action: "HOSPITAL_STATUS_CHANGED",
      targetType: "hospital",
      targetId: id,
      details: {
        hospital_name: currentHosp.name,
        previous_status: previousStatus,
        new_status: status,
        reason: reason || null,
      },
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      message: `Hospital ${status === "active" ? "activated" : "deactivated"} successfully`,
      data: {
        id,
        status,
        previous_status: previousStatus,
      },
    });
  } catch (error) {
    console.error("Failed to update hospital status:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to update hospital status",
    });
  }
});

module.exports = router;
