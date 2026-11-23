import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./AuthContext";

const SocketContext = createContext(null);

const SOCKET_SERVER_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [socketId, setSocketId] = useState(null);
  const [latestStatusUpdate, setLatestStatusUpdate] = useState(null);
  const [latestShipmentUpdate, setLatestShipmentUpdate] = useState(null);
  const [latestReturnUpdate, setLatestReturnUpdate] = useState(null);
  const [latestCancellationUpdate, setLatestCancellationUpdate] = useState(null);
  const [latestRefundUpdate, setLatestRefundUpdate] = useState(null);
  const [latestEmailEvent, setLatestEmailEvent] = useState(null);
  const [latestNewOrder, setLatestNewOrder] = useState(null);
  const [latestAdminNotification, setLatestAdminNotification] = useState(null);
  const [latestCustomerNotification, setLatestCustomerNotification] = useState(null);
  const [adminNotifications, setAdminNotifications] = useState([]);
  const [customerNotifications, setCustomerNotifications] = useState([]);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [liveEventsLog, setLiveEventsLog] = useState([]);
  const activeRoomsRef = useRef(new Set());
  const audioCtxRef = useRef(null);

  // Resume AudioContext cleanly upon user interaction to satisfy browser autoplay policies
  useEffect(() => {
    const unlockAudio = () => {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx && !audioCtxRef.current) {
          audioCtxRef.current = new AudioCtx();
        }
        if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
          audioCtxRef.current.resume().catch(() => {});
        }
      } catch (e) {}
    };

    window.addEventListener("click", unlockAudio, { once: true, passive: true });
    window.addEventListener("keydown", unlockAudio, { once: true, passive: true });
    return () => {
      window.removeEventListener("click", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  // Web Audio API Synthesizer for notifications (zero file dependencies)
  const playChime = useCallback((type = "order") => {
    if (!isSoundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
        return; // Don't block thread if awaiting user gesture
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === "order") {
        // High-pitched pleasant dual-tone chime
        osc.type = "sine";
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      } else if (type === "error") {
        // Alert warning chime
        osc.type = "triangle";
        osc.frequency.setValueAtTime(330, ctx.currentTime);
        osc.frequency.setValueAtTime(220, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
        osc.start();
        osc.stop(ctx.currentTime + 0.45);
      } else {
        // Subtle status transition ping
        osc.type = "sine";
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch (e) {
      // AudioContext gestures
    }
  }, [isSoundEnabled]);

  useEffect(() => {
    // Initialize Socket connection
    const socketInstance = io(SOCKET_SERVER_URL, {
      transports: ["websocket", "polling"],
      withCredentials: true,
      autoConnect: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
    });

    socketInstance.on("connect", () => {
      console.log("🔌 [Socket.IO Client] Connected with ID:", socketInstance.id);
      setIsConnected(true);
      setSocketId(socketInstance.id);

      // Re-join user room if user is logged in
      if (user?.id) {
        socketInstance.emit("join:user", user.id);
      }
      if (user?.role === "admin") {
        socketInstance.emit("join:admin");
      }
    });

    socketInstance.on("disconnect", (reason) => {
      console.log("🔌 [Socket.IO Client] Disconnected:", reason);
      setIsConnected(false);
      setSocketId(null);
    });

    // Listen for Real-Time Order Status Updates
    socketInstance.on("order:status_updated", (data) => {
      console.log("⚡ [Real-Time Order Update]", data);
      setLatestStatusUpdate(data);
      addLiveEvent({
        id: `ev_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        type: "ORDER_STATUS",
        orderId: data.orderId,
        status: data.status,
        previousStatus: data.previousStatus,
        message: `Order #${data.orderId} transitioned to ${data.status.toUpperCase()}`,
        trackingNotes: data.trackingNotes,
        timestamp: data.timestamp || new Date().toISOString(),
      });
      playChime("status");
    });

    // Listen for Dedicated Admin Notifications
    socketInstance.on("admin:notification", (data) => {
      console.log("🔔 [Admin Notification]", data);
      setAdminNotifications((prev) => {
        const isDuplicate = prev.some(
          (n) =>
            n.id === data.id ||
            (n.orderId === data.orderId &&
              n.type === data.type &&
              Math.abs(new Date(n.timestamp || 0) - new Date(data.timestamp || 0)) < 3000)
        );
        if (isDuplicate) return prev;
        return [data, ...prev.slice(0, 49)];
      });
      setLatestAdminNotification(data);
      addLiveEvent({
        id: data.id || `ev_admin_${Date.now()}`,
        type: "ADMIN_NOTIFICATION",
        title: data.title,
        message: data.message,
        orderId: data.orderId,
        severity: data.severity,
        timestamp: data.timestamp || new Date().toISOString(),
      });
      playChime(data.severity === "error" ? "error" : "order");
    });

    // Listen for Dedicated Customer Notifications
    socketInstance.on("customer:notification", (data) => {
      console.log("📦 [Customer Notification]", data);
      let isDup = false;
      setCustomerNotifications((prev) => {
        isDup = prev.some(
          (n) =>
            n.id === data.id ||
            (Number(n.orderId) === Number(data.orderId) &&
              n.status === data.status &&
              Math.abs(new Date(n.timestamp || 0) - new Date(data.timestamp || 0)) < 3000)
        );
        if (isDup) return prev;
        return [data, ...prev.slice(0, 49)];
      });

      if (!isDup) {
        setLatestCustomerNotification(data);
        playChime("status");
      }
    });

    // Listen for Background Email Queue Events
    socketInstance.on("queue:email_dispatched", (data) => {
      console.log("📧 [Real-Time Background Email Event]", data);
      setLatestEmailEvent(data);
      addLiveEvent({
        id: `ev_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        type: "EMAIL_QUEUE",
        jobId: data.jobId,
        orderId: data.orderId,
        state: data.state,
        recipient: data.recipientEmail,
        subject: data.subject,
        durationMs: data.durationMs,
        message:
          data.type === "JOB_COMPLETED"
            ? `Email dispatched for #${data.orderId} (${data.status}) in ${data.durationMs}ms`
            : data.type === "JOB_RETRYING"
              ? `Retry #${data.retries}/${data.maxRetries} scheduled for #${data.orderId} (Backoff: ${data.backoffDelayMs}ms)`
              : data.type === "JOB_FAILED"
                ? `Email failed for #${data.orderId} (Retries exhausted -> DLQ)`
                : `Email job enqueued for #${data.orderId}`,
        timestamp: data.timestamp || new Date().toISOString(),
        renderedHtml: data.renderedHtml,
      });

      if (data.type === "JOB_FAILED") {
        playChime("error");
      }
    });

    // Listen for Order Created Events
    socketInstance.on("order:created", (data) => {
      console.log("📦 [Real-Time New Order Created]", data);
      setLatestNewOrder(data);
      addLiveEvent({
        id: `ev_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        type: "ORDER_CREATED",
        orderId: data.orderId,
        status: "placed",
        message: `New Order #${data.orderId} placed into fulfillment queue`,
        timestamp: data.timestamp || new Date().toISOString(),
      });
      playChime("order");
    });

    // Listen for Real-Time Shipment Events (Created / Tracking Milestones)
    socketInstance.on("order:shipment_updated", (data) => {
      console.log("📦 [Real-Time Shipment Event]", data);
      setLatestShipmentUpdate(data);
      addLiveEvent({
        id: `ev_ship_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        type: "SHIPMENT_UPDATE",
        orderId: data.orderId,
        eventType: data.eventType,
        message: `Shipment #${data.shipment?.id || "N/A"} (${data.shipment?.carrier || "Courier"}) ${
          data.eventType === "CREATED"
            ? "dispatched"
            : data.eventType === "DELIVERED"
            ? "delivered"
            : "tracking updated"
        }`,
        timestamp: data.timestamp || new Date().toISOString(),
      });
      playChime("order");
    });

    // Listen for Real-Time Return Request Events
    socketInstance.on("order:return_updated", (data) => {
      console.log("🔄 [Real-Time Return Event]", data);
      setLatestReturnUpdate(data);
      addLiveEvent({
        id: `ev_ret_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        type: "RETURN_UPDATE",
        orderId: data.orderId,
        eventType: data.eventType,
        message: `Order #${data.orderId} return request ${data.eventType.toLowerCase()}`,
        timestamp: data.timestamp || new Date().toISOString(),
      });
      playChime(data.eventType === "REJECTED" ? "error" : "order");
    });

    // Listen for Real-Time Cancellation Request Events
    socketInstance.on("order:cancellation_updated", (data) => {
      console.log("🚫 [Real-Time Cancellation Event]", data);
      setLatestCancellationUpdate(data);
      addLiveEvent({
        id: `ev_cancel_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        type: "CANCELLATION_UPDATE",
        orderId: data.orderId,
        eventType: data.eventType,
        message: `Order #${data.orderId} cancellation request ${data.eventType.toLowerCase()}`,
        timestamp: data.timestamp || new Date().toISOString(),
      });
      playChime(data.eventType === "REJECTED" ? "error" : "order");
    });

    // Listen for Real-Time Refund Events (Stripe Synchronization)
    socketInstance.on("order:refund_updated", (data) => {
      console.log("💳 [Real-Time Refund Event]", data);
      setLatestRefundUpdate(data);
      addLiveEvent({
        id: `ev_ref_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        type: "REFUND_UPDATE",
        orderId: data.orderId,
        eventType: data.eventType,
        message: `Order #${data.orderId} refund of $${Number(data.refund?.amount || 0).toFixed(2)} synchronized (${data.refund?.stripe_refund_id || "Stripe"})`,
        timestamp: data.timestamp || new Date().toISOString(),
      });
      playChime("order");
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [playChime]);

  // Update rooms whenever user state changes
  useEffect(() => {
    if (socket && isConnected && user) {
      if (user.id) {
        socket.emit("join:user", user.id);
      }
      if (user.role === "admin") {
        socket.emit("join:admin");
      }
    }
  }, [socket, isConnected, user]);

  const addLiveEvent = (event) => {
    setLiveEventsLog((prev) => [event, ...prev.slice(0, 49)]);
  };

  const joinOrderRoom = useCallback(
    (orderId) => {
      if (socket && isConnected && orderId) {
        socket.emit("join:order", orderId);
        activeRoomsRef.current.add(`order_${orderId}`);
      }
    },
    [socket, isConnected]
  );

  const leaveOrderRoom = useCallback(
    (orderId) => {
      if (socket && isConnected && orderId) {
        socket.emit("leave:order", orderId);
        activeRoomsRef.current.delete(`order_${orderId}`);
      }
    },
    [socket, isConnected]
  );

  const clearEventsLog = useCallback(() => {
    setLiveEventsLog([]);
  }, []);

  const markAdminNotificationsAsRead = useCallback(() => {
    setAdminNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAdminNotifications = useCallback(() => {
    setAdminNotifications([]);
  }, []);

  const markCustomerNotificationsAsRead = useCallback(() => {
    setCustomerNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearCustomerNotifications = useCallback(() => {
    setCustomerNotifications([]);
  }, []);

  const dismissCustomerNotification = useCallback(() => {
    setLatestCustomerNotification(null);
  }, []);

  const unreadAdminCount = adminNotifications.filter((n) => !n.read).length;
  const unreadCustomerCount = customerNotifications.filter((n) => !n.read).length;

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        socketId,
        latestStatusUpdate,
        latestShipmentUpdate,
        latestReturnUpdate,
        latestCancellationUpdate,
        latestRefundUpdate,
        latestEmailEvent,
        latestNewOrder,
        latestAdminNotification,
        latestCustomerNotification,
        adminNotifications,
        customerNotifications,
        unreadAdminCount,
        unreadCustomerCount,
        isSoundEnabled,
        setIsSoundEnabled,
        playChime,
        markAdminNotificationsAsRead,
        clearAdminNotifications,
        markCustomerNotificationsAsRead,
        clearCustomerNotifications,
        dismissCustomerNotification,
        liveEventsLog,
        joinOrderRoom,
        leaveOrderRoom,
        clearEventsLog,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
};
