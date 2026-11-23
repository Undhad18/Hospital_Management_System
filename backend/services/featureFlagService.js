/**
 * Feature Flag & Progressive Delivery Service
 * Implements deterministic user bucketing, role-based targeting, percentage rollouts,
 * and instant kill-switches for ShopSphere.
 */

const db = require("../config/db");

class FeatureFlagService {
  constructor() {
    this.cache = new Map();
    this.lastFetched = 0;
    this.CACHE_TTL_MS = 5000; // 5 second cache to ensure high-throughput with low DB load
  }

  /**
   * Deterministic Hash Algorithm (Murmur/FNV style) for consistent user bucketing (0-99).
   * Ensures the same user always receives the exact same variant across requests for a given rollout percentage.
   */
  calculateBucket(userId, flagKey) {
    const seed = `${String(userId || "anonymous")}:${String(flagKey)}`;
    let hash = 5381;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) + hash) ^ seed.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash) % 100;
  }

  /**
   * Fetch all feature flags from DB or cache
   */
  async getAllFlags(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && this.cache.size > 0 && now - this.lastFetched < this.CACHE_TTL_MS) {
      return Array.from(this.cache.values());
    }

    const [rows] = await db.query("SELECT * FROM feature_flags ORDER BY id ASC");
    this.cache.clear();
    rows.forEach((row) => {
      const parsed = {
        ...row,
        is_enabled: Boolean(row.is_enabled),
        kill_switch: Boolean(row.kill_switch),
        target_roles: typeof row.target_roles === "string" ? JSON.parse(row.target_roles) : row.target_roles || [],
        target_user_ids: typeof row.target_user_ids === "string" ? JSON.parse(row.target_user_ids) : row.target_user_ids || [],
        variant_payload: typeof row.variant_payload === "string" ? JSON.parse(row.variant_payload) : row.variant_payload || {},
      };
      this.cache.set(row.flag_key, parsed);
    });

    this.lastFetched = now;
    return Array.from(this.cache.values());
  }

  /**
   * Get single flag by key
   */
  async getFlagByKey(flagKey) {
    const all = await this.getAllFlags();
    return all.find((f) => f.flag_key === flagKey) || null;
  }

  /**
   * Evaluate a single flag for a user context
   * @param {Object} flag
   * @param {Object} userContext - { userId, role, email, isBetaTester }
   */
  evaluateFlag(flag, userContext = {}) {
    const userId = userContext.userId || userContext.id || 1;
    const role = (userContext.role || "customer").toLowerCase();

    // 1. Kill-Switch: Hard emergency cutoff
    if (flag.kill_switch) {
      return {
        key: flag.flag_key,
        enabled: false,
        reason: "KILL_SWITCH_ACTIVE",
        bucket: null,
        variant: null,
      };
    }

    // 2. Global Enable toggle
    if (!flag.is_enabled) {
      return {
        key: flag.flag_key,
        enabled: false,
        reason: "FLAG_DISABLED_GLOBALLY",
        bucket: null,
        variant: null,
      };
    }

    // 3. Explicit User ID Whitelist / Override
    const targetUserIds = Array.isArray(flag.target_user_ids) ? flag.target_user_ids.map(Number) : [];
    if (targetUserIds.includes(Number(userId))) {
      return {
        key: flag.flag_key,
        enabled: true,
        reason: "USER_ID_WHITELIST_MATCH",
        bucket: 0,
        variant: flag.variant_payload,
      };
    }

    // 4. Role Matching Rule
    const targetRoles = Array.isArray(flag.target_roles)
      ? flag.target_roles.map((r) => String(r).toLowerCase())
      : ["all"];

    const isAllRoles = targetRoles.includes("all");
    const isRoleMatch = isAllRoles || targetRoles.includes(role);

    if (!isRoleMatch) {
      return {
        key: flag.flag_key,
        enabled: false,
        reason: `ROLE_NOT_TARGETED (User role: "${role}", Required: [${targetRoles.join(", ")}])`,
        bucket: null,
        variant: null,
      };
    }

    // 5. Deterministic Percentage Rollout Calculation
    const rolloutPercentage = Math.max(0, Math.min(100, Number(flag.rollout_percentage || 0)));
    const bucket = this.calculateBucket(userId, flag.flag_key);
    const isWithinRollout = bucket < rolloutPercentage;

    return {
      key: flag.flag_key,
      enabled: isWithinRollout,
      reason: isWithinRollout
        ? `ROLLOUT_PERCENTAGE_MATCH (Bucket ${bucket} < ${rolloutPercentage}%)`
        : `ROLLOUT_PERCENTAGE_EXCLUDED (Bucket ${bucket} >= ${rolloutPercentage}%)`,
      bucket,
      rolloutPercentage,
      variant: isWithinRollout ? flag.variant_payload : null,
    };
  }

  /**
   * Evaluate all feature flags for a given user
   */
  async evaluateAllForUser(userContext = {}) {
    const flags = await this.getAllFlags();
    const evaluationResults = {};

    flags.forEach((flag) => {
      evaluationResults[flag.flag_key] = this.evaluateFlag(flag, userContext);
    });

    return evaluationResults;
  }

  /**
   * Check if specific feature is enabled for a user
   */
  async isEnabled(flagKey, userContext = {}) {
    const flag = await this.getFlagByKey(flagKey);
    if (!flag) return false;
    const result = this.evaluateFlag(flag, userContext);
    return result.enabled;
  }

  /**
   * Update an existing feature flag in DB and refresh cache
   */
  async updateFlag(flagKey, updates = {}) {
    const current = await this.getFlagByKey(flagKey);
    if (!current) {
      throw new Error(`Feature flag "${flagKey}" not found.`);
    }

    const isEnabled = updates.is_enabled !== undefined ? updates.is_enabled : current.is_enabled;
    const rolloutPct = updates.rollout_percentage !== undefined ? updates.rollout_percentage : current.rollout_percentage;
    const killSwitch = updates.kill_switch !== undefined ? updates.kill_switch : current.kill_switch;
    const targetRoles = updates.target_roles !== undefined ? JSON.stringify(updates.target_roles) : JSON.stringify(current.target_roles);
    const targetUserIds = updates.target_user_ids !== undefined ? JSON.stringify(updates.target_user_ids) : JSON.stringify(current.target_user_ids);
    const variantPayload = updates.variant_payload !== undefined ? JSON.stringify(updates.variant_payload) : JSON.stringify(current.variant_payload);
    const description = updates.description !== undefined ? updates.description : current.description;
    const name = updates.name !== undefined ? updates.name : current.name;

    await db.query(
      `UPDATE feature_flags 
       SET name = ?, description = ?, is_enabled = ?, rollout_percentage = ?, 
           target_roles = ?, target_user_ids = ?, kill_switch = ?, variant_payload = ?, updated_at = NOW()
       WHERE flag_key = ?`,
      [name, description, isEnabled, rolloutPct, targetRoles, targetUserIds, killSwitch, variantPayload, flagKey]
    );

    await this.getAllFlags(true); // Invalidate and refresh cache
    return await this.getFlagByKey(flagKey);
  }

  /**
   * Create a new feature flag
   */
  async createFlag({ flag_key, name, description, is_enabled = true, rollout_percentage = 50, target_roles = ["all"], target_user_ids = [], kill_switch = false, variant_payload = {} }) {
    await db.query(
      `INSERT INTO feature_flags 
       (flag_key, name, description, is_enabled, rollout_percentage, target_roles, target_user_ids, kill_switch, variant_payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        flag_key,
        name,
        description,
        is_enabled,
        rollout_percentage,
        JSON.stringify(target_roles),
        JSON.stringify(target_user_ids),
        kill_switch,
        JSON.stringify(variant_payload),
      ]
    );

    await this.getAllFlags(true);
    return await this.getFlagByKey(flag_key);
  }

  /**
   * Simulate population split across 100 sample user IDs
   */
  async simulateAudience(flagKey, sampleCount = 50) {
    const flag = await this.getFlagByKey(flagKey);
    if (!flag) throw new Error(`Flag "${flagKey}" not found.`);

    const samples = [];
    let enabledCount = 0;

    for (let uid = 1; uid <= sampleCount; uid++) {
      const evaluation = this.evaluateFlag(flag, { userId: uid, role: uid === 1 ? "admin" : "customer" });
      if (evaluation.enabled) enabledCount++;
      samples.push({
        userId: uid,
        role: uid === 1 ? "admin" : "customer",
        bucket: evaluation.bucket,
        enabled: evaluation.enabled,
        reason: evaluation.reason,
      });
    }

    return {
      flagKey,
      rolloutPercentage: flag.rollout_percentage,
      totalSampled: sampleCount,
      enabledCount,
      actualPercentage: Math.round((enabledCount / sampleCount) * 100),
      samples,
    };
  }
}

module.exports = new FeatureFlagService();
