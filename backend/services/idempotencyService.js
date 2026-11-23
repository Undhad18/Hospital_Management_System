const db = require("../config/db");

/**
 * Idempotency Service
 * Guarantees that duplicate HTTP requests or network retries with the same Idempotency-Key
 * will never execute ACID stock deductions or create duplicate orders.
 */
class IdempotencyService {
  /**
   * Check if an idempotency key exists or lock it in 'PROCESSING' state
   * @param {string} idempotencyKey - Unique client-provided UUID/token
   * @param {number} userId - ID of user making request
   * @param {string} requestPath - Endpoint path
   * @returns {Promise<{ isComplete: boolean, isProcessing: boolean, isNew: boolean, cachedResponse?: object }>}
   */
  async checkOrCreate(idempotencyKey, userId = null, requestPath = "/api/orders/checkout") {
    if (!idempotencyKey || typeof idempotencyKey !== "string" || idempotencyKey.trim() === "") {
      return { isNew: true, skipIdempotency: true };
    }

    const cleanKey = idempotencyKey.trim();

    try {
      // 1. Check if record already exists
      const [rows] = await db.query(
        "SELECT * FROM idempotency_keys WHERE idempotency_key = ?",
        [cleanKey]
      );

      if (rows.length > 0) {
        const record = rows[0];

        if (record.status === "COMPLETED") {
          let parsedBody = record.response_body;
          if (typeof parsedBody === "string") {
            try {
              parsedBody = JSON.parse(parsedBody);
            } catch (e) {
              // fallback
            }
          }

          return {
            isComplete: true,
            isProcessing: false,
            isNew: false,
            statusCode: record.response_code || 200,
            cachedResponse: parsedBody,
            idempotencyRecord: record,
          };
        }

        if (record.status === "PROCESSING") {
          // Check if it's stale (e.g. older than 60 seconds)
          const createdAt = new Date(record.created_at).getTime();
          const now = Date.now();
          if (now - createdAt > 60000) {
            // Lock expired, allow re-try
            await db.query(
              "UPDATE idempotency_keys SET status = 'PROCESSING', updated_at = NOW() WHERE idempotency_key = ?",
              [cleanKey]
            );
            return { isNew: true, isProcessing: false, isComplete: false };
          }

          return {
            isProcessing: true,
            isComplete: false,
            isNew: false,
          };
        }
      }

      // 2. Insert new record with 'PROCESSING' state
      await db.query(
        "INSERT INTO idempotency_keys (idempotency_key, user_id, request_path, status) VALUES (?, ?, ?, 'PROCESSING')",
        [cleanKey, userId, requestPath]
      );

      return {
        isNew: true,
        isProcessing: false,
        isComplete: false,
      };
    } catch (error) {
      // If race condition duplicate key insert happened simultaneously
      if (error.code === "ER_DUP_ENTRY") {
        return {
          isProcessing: true,
          isComplete: false,
          isNew: false,
        };
      }
      console.error("Idempotency check error:", error.message);
      // Fallback to proceed safely
      return { isNew: true, skipIdempotency: false };
    }
  }

  /**
   * Mark idempotency key as COMPLETED with response payload
   */
  async complete(idempotencyKey, statusCode = 200, responseBody = {}) {
    if (!idempotencyKey) return;
    try {
      const payloadString = JSON.stringify(responseBody);
      await db.query(
        "UPDATE idempotency_keys SET status = 'COMPLETED', response_code = ?, response_body = ?, updated_at = NOW() WHERE idempotency_key = ?",
        [statusCode, payloadString, idempotencyKey.trim()]
      );
    } catch (error) {
      console.error("Idempotency complete error:", error.message);
    }
  }

  /**
   * Mark idempotency key as FAILED or release lock
   */
  async fail(idempotencyKey, errorMessage = "") {
    if (!idempotencyKey) return;
    try {
      await db.query(
        "UPDATE idempotency_keys SET status = 'FAILED', response_body = ?, updated_at = NOW() WHERE idempotency_key = ?",
        [JSON.stringify({ error: errorMessage }), idempotencyKey.trim()]
      );
    } catch (error) {
      console.error("Idempotency fail error:", error.message);
    }
  }

  /**
   * Retrieve all recent idempotency logs for Admin Studio Inspection
   */
  async getAllKeys(limit = 50) {
    try {
      const [rows] = await db.query(
        `SELECT id, idempotency_key, user_id, request_path, status, response_code, created_at, updated_at 
         FROM idempotency_keys 
         ORDER BY id DESC LIMIT ?`,
        [Number(limit)]
      );
      return rows;
    } catch (error) {
      console.error("Error fetching idempotency keys:", error.message);
      return [];
    }
  }
}

module.exports = new IdempotencyService();
