const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const pool = require("../db");

let io = null;

/**
 * Initialize Socket.IO with HTTP Server
 */
function initSocketServer(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => callback(null, true), // Dynamic origin to support credentials across frontend ports (5173 - 5178)
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
      credentials: true,
    },
    pingTimeout: 30000,
    pingInterval: 15000,
  });

  // Authentication Middleware for Socket.IO (Security & RBAC)
  io.use(async (socket, next) => {
    try {
      let token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, "");

      if (!token) {
        return next(new Error("Authentication token required"));
      }

      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (!payload.sub) {
        return next(new Error("Invalid token payload"));
      }

      // Query database to verify account state and fetch authoritative roles & hospital scoping
      const [users] = await pool.execute(
        `SELECT
           u.id,
           u.full_name,
           u.email,
           u.status,
           u.hospital_id,
           u.department_id,
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
        return next(new Error("User account not found"));
      }

      // Token version check (revoked/expired session protection)
      if (
        payload.tokenVersion !== undefined &&
        user.token_version !== payload.tokenVersion
      ) {
        return next(new Error("Session expired or revoked"));
      }

      if (user.status !== "active") {
        return next(new Error(`Account is ${user.status}`));
      }

      if (user.hospital_id && user.hospital_status !== "active") {
        return next(new Error("Associated hospital is inactive"));
      }

      // Attach authoritative user context to socket
      socket.user = {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
        hospitalId: user.hospital_id,
        departmentId: user.department_id,
      };

      next();
    } catch (err) {
      return next(new Error(err.message || "Authentication failed"));
    }
  });

  // Handle Connections & Hospital Room Subscriptions
  io.on("connection", (socket) => {
    const { id, role, hospitalId } = socket.user;

    // 1. Join user's individual room
    socket.join(`user:${id}`);

    // 2. Join role-specific room
    socket.join(`role:${role}`);

    // 3. Join authorized hospital room
    if (hospitalId) {
      socket.join(`hospital:${hospitalId}`);
    }

    // 4. Super Admin joins global hospital room
    if (role === "super_admin") {
      socket.join("hospital:all");
    }

    // Secure room subscription listener with backend authorization check
    socket.on("subscribe:hospital", (targetHospitalId) => {
      const targetId = Number(targetHospitalId);
      if (!targetId || isNaN(targetId)) return;

      // Only Super Admin or users assigned to this hospital can join
      if (role === "super_admin" || Number(hospitalId) === targetId) {
        socket.join(`hospital:${targetId}`);
      } else {
        socket.emit("error:unauthorized", {
          message: "Unauthorized attempt to subscribe to another hospital's data stream",
        });
      }
    });

    socket.on("disconnect", () => {
      // Automatic cleanup handled by socket.io
    });
  });

  return io;
}

/**
 * Get Socket.IO instance
 */
function getIO() {
  return io;
}

/**
 * Emit an event to all users authorized for a specific hospital (and global super admins)
 * @param {number|string} hospitalId
 * @param {string} event
 * @param {object} payload
 */
function emitHospitalEvent(hospitalId, event, payload = {}) {
  if (!io) return;
  const numId = Number(hospitalId);
  if (!numId) return;

  const enrichedPayload = {
    ...payload,
    hospitalId: numId,
    timestamp: new Date().toISOString(),
  };

  io.to(`hospital:${numId}`).to("hospital:all").emit(event, enrichedPayload);

  // Automatically mirror relevant operational events to digital_twin:update
  const DT_TRIGGER_EVENTS = [
    "appointments:updated",
    "admissions:updated",
    "beds:updated",
    "wards:updated",
    "departments:updated",
    "staff:updated",
    "consultations:updated",
    "labs:updated",
    "pharmacy:updated",
    "billing:updated",
  ];

  if (DT_TRIGGER_EVENTS.includes(event)) {
    const subsystem = event.split(":")[0];
    io.to(`hospital:${numId}`).to("hospital:all").emit("digital_twin:update", {
      subsystem,
      triggerEvent: event,
      ...enrichedPayload,
    });
  }
}

/**
 * Emit a real-time event directly to the Hospital Digital Twin stream
 * @param {number|string} hospitalId
 * @param {string} subsystem - 'appointments' | 'beds' | 'wards' | 'consultations' | 'labs' | 'pharmacy' | 'billing'
 * @param {string} action - 'created' | 'updated' | 'deleted' | 'status_changed'
 * @param {object} details - details of the changed entity
 */
function emitDigitalTwinEvent(hospitalId, subsystem, action, details = {}) {
  if (!io) return;
  const numId = Number(hospitalId);
  if (!numId) return;

  const payload = {
    subsystem,
    action,
    details,
    hospitalId: numId,
    timestamp: new Date().toISOString(),
  };

  // Broadcast to authorized hospital room and global super admins
  io.to(`hospital:${numId}`).to("hospital:all").emit("digital_twin:update", payload);
  io.to(`hospital:${numId}`).to("hospital:all").emit(`digital_twin:${subsystem}`, payload);
}

/**
 * Emit an event to a specific user
 * @param {number|string} userId
 * @param {string} event
 * @param {object} payload
 */
function emitUserEvent(userId, event, payload = {}) {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, {
    ...payload,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Emit an event globally to all authenticated sockets
 * @param {string} event
 * @param {object} payload
 */
function emitGlobalEvent(event, payload = {}) {
  if (!io) return;
  io.emit(event, {
    ...payload,
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  initSocketServer,
  getIO,
  emitHospitalEvent,
  emitDigitalTwinEvent,
  emitUserEvent,
  emitGlobalEvent,
};
