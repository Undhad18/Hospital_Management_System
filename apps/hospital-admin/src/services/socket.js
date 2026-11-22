import { io } from "socket.io-client";

const SOCKET_SERVER_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"
).replace(/\/api\/?$/, "");

let socket = null;
let currentToken = null;
const listeners = new Map(); // event -> Set<callback>

/**
 * Get or initialize the Socket.IO client instance
 * @param {string} token - JWT bearer token
 * @returns {Socket} socket.io-client instance
 */
export function getSocket(token) {
  if (!token) {
    if (socket) {
      disconnectSocket();
    }
    return null;
  }

  // If already connected with same token, return existing socket
  if (socket && socket.connected && currentToken === token) {
    return socket;
  }

  // If token changed, disconnect old socket first
  if (socket && currentToken !== token) {
    disconnectSocket();
  }

  currentToken = token;

  socket = io(SOCKET_SERVER_URL, {
    auth: {
      token,
    },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 15,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  });

  socket.on("connect", () => {
    // Re-attach all registered listeners after connect/reconnect
    listeners.forEach((callbackSet, eventName) => {
      callbackSet.forEach((cb) => {
        socket.off(eventName, cb);
        socket.on(eventName, cb);
      });
    });
  });

  socket.on("connect_error", (err) => {
    console.warn("[Socket.IO] Connection error:", err.message);
  });

  socket.on("disconnect", (reason) => {
    // Handled by auto-reconnect
  });

  return socket;
}

/**
 * Subscribe to a real-time event with automatic cleanup
 * @param {string} event - Event name e.g. "beds:updated", "wards:updated", "admissions:updated"
 * @param {function} callback - Callback function
 * @param {string} [token] - Optional token to ensure connection
 * @returns {function} Unsubscribe cleanup function
 */
export function subscribeToEvent(event, callback, token) {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event).add(callback);

  if (token) {
    getSocket(token);
  }

  if (socket) {
    socket.on(event, callback);
  }

  return () => {
    const set = listeners.get(event);
    if (set) {
      set.delete(callback);
      if (set.size === 0) {
        listeners.delete(event);
      }
    }
    if (socket) {
      socket.off(event, callback);
    }
  };
}

/**
 * Disconnect socket and clear state
 */
export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  currentToken = null;
  listeners.clear();
}
