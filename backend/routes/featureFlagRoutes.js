const express = require("express");
const router = express.Router();
const featureFlagController = require("../controllers/featureFlagController");

// List and evaluate flags
router.get("/", featureFlagController.getAllFlags);
router.get("/evaluate", featureFlagController.evaluateFlags);
router.get("/:flagKey/simulate", featureFlagController.simulateAudience);

// Admin modification routes
router.post("/", featureFlagController.createFlag);
router.patch("/:flagKey", featureFlagController.updateFlag);

module.exports = router;
