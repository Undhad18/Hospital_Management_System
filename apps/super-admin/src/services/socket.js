import { io } from "socket.io-client";

const SOCKET_SERVER_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"
).replace(/\/api\/?$/, "");

let socket = null;
let currentToken = null;
const listeners = new Map();

export function getSocket(token) {
  if (!token) {
    if (socket) {
      disconnectSocket();
    }
    return null;
  }

  if (socket && socket.connected && currentToken === token) {
    return socket;
  }

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

  return socket;
}

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

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  currentToken = null;
  listeners.clear();
}
