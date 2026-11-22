const express = require("express");
const pool = require("../db");
const { requireAuth, allowRoles } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// ==========================================
// 1. COUNTRIES ENDPOINTS
// ==========================================

// GET /api/locations/countries — List all countries
router.get("/countries", async (req, res) => {
  try {
    const { status, search } = req.query;
    let sql = `
      SELECT
        c.id, c.name, c.code, c.phone_code, c.status, c.created_at, c.updated_at,
        COUNT(s.id) AS state_count
      FROM countries c
      LEFT JOIN states s ON s.country_id = c.id
    `;
    const conditions = [];
    const params = [];

    if (status) {
      conditions.push("c.status = ?");
      params.push(status);
    } else if (req.user.role !== "super_admin") {
      conditions.push("c.status = 'active'");
    }

    if (search && search.trim()) {
      conditions.push("(c.name LIKE ? OR c.code LIKE ?)");
      const term = `%${search.trim()}%`;
      params.push(term, term);
    }

    if (conditions.length) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " GROUP BY c.id ORDER BY c.name ASC";

    const [countries] = await pool.execute(sql, params);

    return res.json({
      success: true,
      count: countries.length,
      data: countries,
    });
  } catch (error) {
    console.error("Failed to fetch countries:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve countries",
    });
  }
});

// POST /api/locations/countries — Create country (Super Admin only)
router.post("/countries", allowRoles("super_admin"), async (req, res) => {
  try {
    const { name, code, phone_code, status } = req.body || {};

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Country name is required",
      });
    }

    if (typeof code !== "string" || !code.trim()) {
      return res.status(400).json({
        success: false,
        message: "Country code (e.g. IN, US, UK) is required",
      });
    }

    const cleanName = name.trim();
    const cleanCode = code.trim().toUpperCase();
    const cleanPhone = phone_code ? phone_code.trim() : null;
    const cleanStatus = ["active", "inactive"].includes(status) ? status : "active";

    const [result] = await pool.execute(
      `INSERT INTO countries (name, code, phone_code, status)
       VALUES (?, ?, ?, ?)`,
      [cleanName, cleanCode, cleanPhone, cleanStatus]
    );

    return res.status(201).json({
      success: true,
      message: "Country master record created successfully",
      data: { id: result.insertId, name: cleanName, code: cleanCode },
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "A country with this name or code already exists",
      });
    }

    console.error("Failed to create country:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to create country",
    });
  }
});

// PATCH /api/locations/countries/:id — Update country (Super Admin only)
router.patch("/countries/:id", allowRoles("super_admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid country ID",
      });
    }

    const { name, code, phone_code, status } = req.body || {};
    const updates = [];
    const values = [];

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Country name cannot be empty",
        });
      }
      updates.push("name = ?");
      values.push(name.trim());
    }

    if (code !== undefined) {
      if (typeof code !== "string" || !code.trim()) {
        return res.status(400).json({
          success: false,
          message: "Country code cannot be empty",
        });
      }
      updates.push("code = ?");
      values.push(code.trim().toUpperCase());
    }

    if (phone_code !== undefined) {
      updates.push("phone_code = ?");
      values.push(phone_code ? phone_code.trim() : null);
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
        message: "No fields provided to update",
      });
    }

    values.push(id);
    const [result] = await pool.execute(
      `UPDATE countries SET ${updates.join(", ")} WHERE id = ?`,
      values
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Country record not found",
      });
    }

    return res.json({
      success: true,
      message: "Country record updated successfully",
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "A country with this name or code already exists",
      });
    }

    console.error("Failed to update country:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to update country",
    });
  }
});

// ==========================================
// 2. STATES ENDPOINTS
// ==========================================

// GET /api/locations/states — List states with country filter
router.get("/states", async (req, res) => {
  try {
    const { country_id, status, search } = req.query;
    let sql = `
      SELECT
        s.id, s.country_id, s.name, s.code, s.status, s.created_at, s.updated_at,
        c.name AS country_name,
        c.code AS country_code,
        COUNT(ci.id) AS city_count
      FROM states s
      JOIN countries c ON c.id = s.country_id
      LEFT JOIN cities ci ON ci.state_id = s.id
    `;
    const conditions = [];
    const params = [];

    if (country_id) {
      const countryNum = Number(country_id);
      if (!Number.isSafeInteger(countryNum) || countryNum < 1) {
        return res.status(400).json({
          success: false,
          message: "Invalid country_id",
        });
      }
      conditions.push("s.country_id = ?");
      params.push(countryNum);
    }

    if (status) {
      conditions.push("s.status = ?");
      params.push(status);
    } else if (req.user.role !== "super_admin") {
      conditions.push("s.status = 'active' AND c.status = 'active'");
    }

    if (search && search.trim()) {
      conditions.push("(s.name LIKE ? OR s.code LIKE ? OR c.name LIKE ?)");
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    if (conditions.length) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " GROUP BY s.id ORDER BY c.name ASC, s.name ASC";

    const [states] = await pool.execute(sql, params);

    return res.json({
      success: true,
      count: states.length,
      data: states,
    });
  } catch (error) {
    console.error("Failed to fetch states:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve states",
    });
  }
});

// POST /api/locations/states — Create state with parent country validation
router.post("/states", allowRoles("super_admin"), async (req, res) => {
  try {
    const { country_id, name, code, status } = req.body || {};

    const countryNum = Number(country_id);
    if (!Number.isSafeInteger(countryNum) || countryNum < 1) {
      return res.status(400).json({
        success: false,
        message: "Valid country_id is required",
      });
    }

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "State name is required",
      });
    }

    // Validate parent country existence
    const [countries] = await pool.execute("SELECT id FROM countries WHERE id = ?", [countryNum]);
    if (!countries.length) {
      return res.status(400).json({
        success: false,
        message: "Parent country does not exist",
      });
    }

    const cleanName = name.trim();
    const cleanCode = code ? code.trim().toUpperCase() : null;
    const cleanStatus = ["active", "inactive"].includes(status) ? status : "active";

    const [result] = await pool.execute(
      `INSERT INTO states (country_id, name, code, status)
       VALUES (?, ?, ?, ?)`,
      [countryNum, cleanName, cleanCode, cleanStatus]
    );

    return res.status(201).json({
      success: true,
      message: "State master record created successfully",
      data: { id: result.insertId, country_id: countryNum, name: cleanName },
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "A state with this name already exists in the selected country",
      });
    }

    console.error("Failed to create state:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to create state",
    });
  }
});

// PATCH /api/locations/states/:id — Update state (Super Admin only)
router.patch("/states/:id", allowRoles("super_admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid state ID",
      });
    }

    const { country_id, name, code, status } = req.body || {};
    const updates = [];
    const values = [];

    if (country_id !== undefined) {
      const countryNum = Number(country_id);
      if (!Number.isSafeInteger(countryNum) || countryNum < 1) {
        return res.status(400).json({
          success: false,
          message: "Invalid country_id",
        });
      }
      const [countries] = await pool.execute("SELECT id FROM countries WHERE id = ?", [countryNum]);
      if (!countries.length) {
        return res.status(400).json({
          success: false,
          message: "Selected parent country does not exist",
        });
      }
      updates.push("country_id = ?");
      values.push(countryNum);
    }

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: "State name cannot be empty",
        });
      }
      updates.push("name = ?");
      values.push(name.trim());
    }

    if (code !== undefined) {
      updates.push("code = ?");
      values.push(code ? code.trim().toUpperCase() : null);
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
        message: "No fields provided to update",
      });
    }

    values.push(id);
    const [result] = await pool.execute(
      `UPDATE states SET ${updates.join(", ")} WHERE id = ?`,
      values
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "State record not found",
      });
    }

    return res.json({
      success: true,
      message: "State record updated successfully",
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "A state with this name already exists in that country",
      });
    }

    console.error("Failed to update state:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to update state",
    });
  }
});

// ==========================================
// 3. CITIES ENDPOINTS
// ==========================================

// GET /api/locations/cities — List cities with state/country filter
router.get("/cities", async (req, res) => {
  try {
    const { state_id, country_id, status, search } = req.query;
    let sql = `
      SELECT
        ci.id, ci.state_id, ci.name, ci.status, ci.created_at, ci.updated_at,
        s.name AS state_name,
        s.code AS state_code,
        c.id AS country_id,
        c.name AS country_name,
        c.code AS country_code
      FROM cities ci
      JOIN states s ON s.id = ci.state_id
      JOIN countries c ON c.id = s.country_id
    `;
    const conditions = [];
    const params = [];

    if (state_id) {
      const stateNum = Number(state_id);
      if (!Number.isSafeInteger(stateNum) || stateNum < 1) {
        return res.status(400).json({
          success: false,
          message: "Invalid state_id",
        });
      }
      conditions.push("ci.state_id = ?");
      params.push(stateNum);
    }

    if (country_id) {
      const countryNum = Number(country_id);
      if (!Number.isSafeInteger(countryNum) || countryNum < 1) {
        return res.status(400).json({
          success: false,
          message: "Invalid country_id",
        });
      }
      conditions.push("s.country_id = ?");
      params.push(countryNum);
    }

    if (status) {
      conditions.push("ci.status = ?");
      params.push(status);
    } else if (req.user.role !== "super_admin") {
      conditions.push("ci.status = 'active' AND s.status = 'active' AND c.status = 'active'");
    }

    if (search && search.trim()) {
      conditions.push("(ci.name LIKE ? OR s.name LIKE ? OR c.name LIKE ?)");
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    if (conditions.length) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " ORDER BY c.name ASC, s.name ASC, ci.name ASC";

    const [cities] = await pool.execute(sql, params);

    return res.json({
      success: true,
      count: cities.length,
      data: cities,
    });
  } catch (error) {
    console.error("Failed to fetch cities:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve cities",
    });
  }
});

// POST /api/locations/cities — Create city with parent state validation
router.post("/cities", allowRoles("super_admin"), async (req, res) => {
  try {
    const { state_id, name, status } = req.body || {};

    const stateNum = Number(state_id);
    if (!Number.isSafeInteger(stateNum) || stateNum < 1) {
      return res.status(400).json({
        success: false,
        message: "Valid state_id is required",
      });
    }

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "City name is required",
      });
    }

    // Validate parent state existence
    const [states] = await pool.execute("SELECT id FROM states WHERE id = ?", [stateNum]);
    if (!states.length) {
      return res.status(400).json({
        success: false,
        message: "Parent state does not exist",
      });
    }

    const cleanName = name.trim();
    const cleanStatus = ["active", "inactive"].includes(status) ? status : "active";

    const [result] = await pool.execute(
      `INSERT INTO cities (state_id, name, status)
       VALUES (?, ?, ?)`,
      [stateNum, cleanName, cleanStatus]
    );

    return res.status(201).json({
      success: true,
      message: "City master record created successfully",
      data: { id: result.insertId, state_id: stateNum, name: cleanName },
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "A city with this name already exists in the selected state",
      });
    }

    console.error("Failed to create city:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to create city",
    });
  }
});

// PATCH /api/locations/cities/:id — Update city (Super Admin only)
router.patch("/cities/:id", allowRoles("super_admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid city ID",
      });
    }

    const { state_id, name, status } = req.body || {};
    const updates = [];
    const values = [];

    if (state_id !== undefined) {
      const stateNum = Number(state_id);
      if (!Number.isSafeInteger(stateNum) || stateNum < 1) {
        return res.status(400).json({
          success: false,
          message: "Invalid state_id",
        });
      }
      const [states] = await pool.execute("SELECT id FROM states WHERE id = ?", [stateNum]);
      if (!states.length) {
        return res.status(400).json({
          success: false,
          message: "Selected parent state does not exist",
        });
      }
      updates.push("state_id = ?");
      values.push(stateNum);
    }

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: "City name cannot be empty",
        });
      }
      updates.push("name = ?");
      values.push(name.trim());
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
        message: "No fields provided to update",
      });
    }

    values.push(id);
    const [result] = await pool.execute(
      `UPDATE cities SET ${updates.join(", ")} WHERE id = ?`,
      values
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "City record not found",
      });
    }

    return res.json({
      success: true,
      message: "City record updated successfully",
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "A city with this name already exists in that state",
      });
    }

    console.error("Failed to update city:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to update city",
    });
  }
});

module.exports = router;
