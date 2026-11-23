const { verifyToken } = require("../utils/jwt");
const { findUserById } = require("../services/authService");

/**
 * Protect routes - verifies JWT from Authorization header or cookie
 */
const protect = async (req, res, next) => {
  try {
    let token = null;

    // 1. Check Authorization header (Bearer token)
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ")
    ) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies && req.cookies.token) {
      // 2. Fallback to cookie if present
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authorized. No authentication token provided.",
      });
    }

    // 3. Verify JWT token
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          message: "Token has expired. Please log in again.",
          isExpired: true,
        });
      }
      return res.status(401).json({
        success: false,
        message: "Invalid token signature. Authorization failed.",
      });
    }

    // 4. Check if user still exists in database
    const user = await findUserById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "The user belonging to this token no longer exists.",
      });
    }

    if (user.status !== 1) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive or disabled. Contact administrator.",
      });
    }

    // 5. Grant access: attach user info to request
    req.user = user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during authentication verification.",
    });
  }
};

/**
 * Role-based authorization middleware
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: User role '${req.user ? req.user.role : "unknown"}' is not authorized to access this resource.`,
      });
    }
    next();
  };
};

module.exports = {
  protect,
  authorize,
};
