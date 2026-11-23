const featureFlagService = require("../services/featureFlagService");

/**
 * Controller for Feature Flags & Progressive Delivery
 */

// GET /api/feature-flags
const getAllFlags = async (req, res) => {
  try {
    const flags = await featureFlagService.getAllFlags();
    res.status(200).json({
      success: true,
      count: flags.length,
      data: flags,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/feature-flags/evaluate
// Evaluates all flags dynamically for the calling user or given context
const evaluateFlags = async (req, res) => {
  try {
    const userContext = {
      userId: req.user?.id || req.query.userId || 1,
      role: req.user?.role || req.query.role || "customer",
      email: req.user?.email || req.query.email || "customer@shopsphere.io",
    };

    const evaluated = await featureFlagService.evaluateAllForUser(userContext);

    res.status(200).json({
      success: true,
      userContext,
      flags: evaluated,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/feature-flags/:flagKey
const updateFlag = async (req, res) => {
  try {
    const { flagKey } = req.params;
    const updates = req.body;

    const updated = await featureFlagService.updateFlag(flagKey, updates);

    res.status(200).json({
      success: true,
      message: `Feature flag "${flagKey}" updated successfully.`,
      data: updated,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/feature-flags
const createFlag = async (req, res) => {
  try {
    const { flag_key, name, description, is_enabled, rollout_percentage, target_roles, target_user_ids, kill_switch, variant_payload } = req.body;

    if (!flag_key || !name) {
      return res.status(400).json({ success: false, message: "flag_key and name are required." });
    }

    const created = await featureFlagService.createFlag({
      flag_key,
      name,
      description,
      is_enabled,
      rollout_percentage,
      target_roles,
      target_user_ids,
      kill_switch,
      variant_payload,
    });

    res.status(201).json({
      success: true,
      message: `Feature flag "${flag_key}" created successfully.`,
      data: created,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/feature-flags/:flagKey/simulate
const simulateAudience = async (req, res) => {
  try {
    const { flagKey } = req.params;
    const sampleCount = parseInt(req.query.sampleCount, 10) || 50;

    const simulation = await featureFlagService.simulateAudience(flagKey, sampleCount);

    res.status(200).json({
      success: true,
      data: simulation,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getAllFlags,
  evaluateFlags,
  updateFlag,
  createFlag,
  simulateAudience,
};
