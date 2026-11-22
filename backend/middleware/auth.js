const jwt = require("jsonwebtoken");
const pool = require("../db");

async function requireAuth(req, res, next) {
  const authorization = req.headers.authorization || "";
  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (!payload.sub) {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    const [users] = await pool.execute(
      `SELECT
         u.id,
         u.full_name,
         u.email,
         u.status,
         u.hospital_id,
         u.department_id,
         u.must_change_password,
         u.token_version,
         r.name AS role,
         h.status AS hospital_status
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN hospitals h ON h.id = u.hospital_id
       WHERE u.id = ?
       LIMIT 1`,
      [payload.sub]
    );

    const user = users[0];

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Account not found or deleted",
      });
    }

    // Invalidate sessions if token_version has changed (e.g. password reset / forced logout)
    if (
      payload.tokenVersion !== undefined &&
      user.token_version !== payload.tokenVersion
    ) {
      return res.status(401).json({
        success: false,
        message: "Session has expired or been revoked. Please sign in again.",
      });
    }

    if (user.status === "pending") {
      return res.status(403).json({
        success: false,
        message: "Account is pending administrator approval",
      });
    }

    if (user.status === "suspended") {
      return res.status(403).json({
        success: false,
        message: "Account has been suspended",
      });
    }

    if (user.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Account is inactive or unavailable",
      });
    }

    if (user.hospital_id && user.hospital_status !== "active") {
      return res.status(403).json({
        success: false,
        message: "The hospital associated with this account is inactive",
      });
    }

    req.user = {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: user.role,
      hospitalId: user.hospital_id,
      departmentId: user.department_id,
      status: user.status,
      mustChangePassword: Boolean(user.must_change_password),
      tokenVersion: user.token_version,
    };

    return next();
  } catch (error) {
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError" ||
      error.name === "NotBeforeError"
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    console.error("Authentication check failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to verify account",
    });
  }
}

function allowRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this resource",
      });
    }

    return next();
  };
}

async function optionalAuth(req, res, next) {
  const authorization = req.headers.authorization || "";
  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token || token === "undefined" || token === "null") {
    req.user = null;
    return next();
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.sub) {
      req.user = null;
      return next();
    }

    const [users] = await pool.execute(
      `SELECT
         u.id,
         u.full_name,
         u.email,
         u.status,
         u.hospital_id,
         u.department_id,
         u.must_change_password,
         u.token_version,
         r.name AS role,
         h.status AS hospital_status
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN hospitals h ON h.id = u.hospital_id
       WHERE u.id = ?
       LIMIT 1`,
      [payload.sub]
    );

    const user = users[0];
    if (user && user.status === "active") {
      req.user = {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
        hospitalId: user.hospital_id,
        departmentId: user.department_id,
        status: user.status,
        mustChangePassword: Boolean(user.must_change_password),
        tokenVersion: user.token_version,
      };
    } else {
      req.user = null;
    }
  } catch (err) {
    req.user = null;
  }
  return next();
}

module.exports = { requireAuth, allowRoles, optionalAuth };
