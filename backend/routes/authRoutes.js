const express = require("express");
const router = express.Router();
const {
  register,
  login,
  getMe,
  getDashboardData,
  logout,
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

// Public endpoints
router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);

// Protected endpoints
router.get("/me", protect, getMe);
router.get("/dashboard-data", protect, getDashboardData);

module.exports = router;
