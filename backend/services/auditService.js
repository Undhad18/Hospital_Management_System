const pool = require("../db");

/**
 * Log an administrative or security-sensitive action
 * @param {Object} options
 * @param {number|null} options.actorId - ID of user performing the action
 * @param {string} options.action - Action name (e.g. 'USER_APPROVED', 'USER_STATUS_CHANGED', 'PASSWORD_RESET')
 * @param {string} options.targetType - Target entity ('user', 'hospital', etc.)
 * @param {number|null} options.targetId - ID of target entity
 * @param {Object} [options.details] - Arbitrary additional metadata
 * @param {string} [options.ipAddress] - Caller IP address
 */
async function logAudit(optionsOrActorId, actionParam, targetTypeParam, targetIdParam, detailsParam, ipAddressParam) {
  let actorId = null;
  let action = null;
  let targetType = null;
  let targetId = null;
  let details = null;
  let ipAddress = null;

  if (optionsOrActorId && typeof optionsOrActorId === "object" && !Array.isArray(optionsOrActorId)) {
    actorId = optionsOrActorId.actorId ?? optionsOrActorId.actor_id ?? null;
    action = optionsOrActorId.action ?? null;
    targetType = optionsOrActorId.targetType ?? optionsOrActorId.target_type ?? null;
    targetId = optionsOrActorId.targetId ?? optionsOrActorId.target_id ?? null;
    details = optionsOrActorId.details ?? null;
    ipAddress = optionsOrActorId.ipAddress ?? optionsOrActorId.ip_address ?? null;
  } else {
    actorId = optionsOrActorId ?? null;
    action = actionParam ?? null;
    targetType = targetTypeParam ?? null;
    targetId = targetIdParam ?? null;
    details = detailsParam ?? null;
    ipAddress = ipAddressParam ?? null;
  }
  try {
    await pool.execute(
      `INSERT INTO audit_logs
         (actor_id, action, target_type, target_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        actorId !== undefined ? actorId : null,
        action !== undefined ? action : null,
        targetType !== undefined ? targetType : null,
        targetId !== undefined ? targetId : null,
        details ? JSON.stringify(details) : null,
        ipAddress !== undefined ? ipAddress : null,
      ]
    );
  } catch (err) {
    console.error("Failed to write audit log:", err.message);
  }
}

module.exports = { logAudit };
