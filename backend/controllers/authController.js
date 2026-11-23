const {
  findUserByEmail,
  findUserById,
  createUser,
  comparePasswords,
} = require("../services/authService");
const { generateToken } = require("../utils/jwt");
const { validateRegistration, validateLogin } = require("../../shared");

/**
 * Helper to set HTTP-only cookie if required
 */
const sendTokenResponse = (user, statusCode, res, message = "Success") => {
  const token = generateToken({
    id: user.id,
    email: user.email,
    role: user.role,
  });

  // Cookie options (secure, httpOnly)
  const isProduction = process.env.NODE_ENV === "production";
  const cookieOptions = {
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
  };

  res.cookie("token", token, cookieOptions);

  return res.status(statusCode).json({
    success: true,
    message,
    data: {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        created_at: user.created_at,
      },
      token,
    },
  });
};

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
const register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // 1. Validate inputs using shared validator
    const validation = validateRegistration(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.errors[0]?.message || "Invalid registration data",
        errors: validation.errors,
      });
    }

    // 2. Check if user already exists
    const existingUser = await findUserByEmail(email.toLowerCase().trim());
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email address already exists.",
      });
    }

    // 3. Create user in DB
    const newUser = await createUser({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: role === "admin" ? "admin" : "user",
    });

    return sendTokenResponse(
      newUser,
      201,
      res,
      "Account created successfully. Welcome!"
    );
  } catch (error) {
    console.error("Registration error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error during registration.",
      error: error.message,
    });
  }
};

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user credentials and return token/cookie
 * @access  Public
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Validate request body
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide both email and password.",
      });
    }

    // 2. Lookup user by email
    const user = await findUserByEmail(email.toLowerCase().trim());
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // 3. Verify password hash with bcrypt
    const isPasswordMatch = await comparePasswords(password, user.password);
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // 4. Verify account active status
    if (user.status !== 1) {
      return res.status(403).json({
        success: false,
        message: "Your account is disabled. Please contact support.",
      });
    }

    // 5. Send JWT token and cookie response
    return sendTokenResponse(user, 200, res, "Logged in successfully.");
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error during login.",
      error: error.message,
    });
  }
};

/**
 * @route   GET /api/auth/me
 * @desc    Get currently logged-in user profile
 * @access  Private (Protected)
 */
const getMe = async (req, res) => {
  try {
    // req.user is populated by protect middleware
    return res.status(200).json({
      success: true,
      message: "User profile retrieved successfully.",
      data: {
        user: {
          id: req.user.id,
          name: req.user.name,
          email: req.user.email,
          role: req.user.role,
          status: req.user.status,
          created_at: req.user.created_at,
          updated_at: req.user.updated_at,
        },
      },
    });
  } catch (error) {
    console.error("GetMe error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user profile.",
    });
  }
};

/**
 * @route   GET /api/auth/dashboard-data
 * @desc    Protected route returning authorized dashboard stats & activity
 * @access  Private (Protected)
 */
const getDashboardData = async (req, res) => {
  try {
    // Simulated secured metrics and real server timestamp
    const dashboardMetrics = {
      authenticatedUser: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
      },
      systemStatus: "Healthy",
      serverTimestamp: new Date().toISOString(),
      permissions:
        req.user.role === "admin"
          ? ["READ_ALL", "WRITE_ALL", "DELETE_ALL", "MANAGE_USERS"]
          : ["READ_PROFILE", "UPDATE_PROFILE", "VIEW_DASHBOARD"],
      stats: {
        totalSessions: 14,
        apiRequestsCount: 128,
        lastLogin: new Date().toISOString(),
        securityScore: "98%",
      },
      recentActivities: [
        {
          id: "act-1",
          action: "JWT Bearer Token Authentication",
          timestamp: new Date().toISOString(),
          status: "Success",
        },
        {
          id: "act-2",
          action: "Protected Route Handshake (/api/auth/dashboard-data)",
          timestamp: new Date(Date.now() - 60000).toISOString(),
          status: "Verified",
        },
        {
          id: "act-3",
          action: "Session Initialized with Token Storage",
          timestamp: new Date(Date.now() - 300000).toISOString(),
          status: "Active",
        },
      ],
    };

    return res.status(200).json({
      success: true,
      message: "Protected dashboard data retrieved successfully.",
      data: dashboardMetrics,
    });
  } catch (error) {
    console.error("Dashboard data error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch protected dashboard data.",
    });
  }
};

/**
 * @route   POST /api/auth/logout
 * @desc    Log out current user & clear authentication cookie
 * @access  Public / Private
 */
const logout = async (req, res) => {
  try {
    const isProduction = process.env.NODE_ENV === "production";
    res.clearCookie("token", {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
    });

    return res.status(200).json({
      success: true,
      message: "Logged out successfully.",
    });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({
      success: false,
      message: "Error during logout.",
    });
  }
};

module.exports = {
  register,
  login,
  getMe,
  getDashboardData,
  logout,
};
