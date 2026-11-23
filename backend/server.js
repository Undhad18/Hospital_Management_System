require("dotenv").config();
const http = require("http");
const app = require("./app");
const pool = require("./config/db");
const initTables = require("./config/initTables");
const { initSocket } = require("./services/socketService");

const PORT = process.env.PORT || 5000;

// Test DB Connection and start listening
const startServer = async () => {
  try {
    // 1. Verify MySQL connection
    const connection = await pool.getConnection();
    console.log("MySQL Database connected successfully.");
    connection.release();

    // 2. Ensure Database tables are initialized
    await initTables();

    // 3. Create HTTP Server for Express + Socket.IO WebSockets
    const httpServer = http.createServer(app);

    // 4. Initialize Socket.IO Real-Time Engine
    const io = initSocket(httpServer);
    console.log("🔌 Socket.IO Real-Time Engine initialized.");

    // 5. Start Listening
    httpServer.listen(PORT, () => {
      console.log(`🚀 API & WebSocket Server running on http://localhost:${PORT}`);
      console.log(`📡 Socket.IO listening for real-time order status updates`);
      console.log(`📧 Background Email Queue initialized and ready`);
      console.log(`💳 Stripe Checkout & Idempotency Protection active`);
      console.log(`📖 Swagger API Docs: http://localhost:${PORT}/api-docs`);
    });

    httpServer.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(`❌ Port ${PORT} is already in use by another running process.`);
        console.error(`💡 Free port ${PORT} by stopping the background process before restarting.`);
      } else {
        console.error("Server error:", err.message);
      }
      process.exit(1);
    });

    // Graceful shutdown handling
    const shutdown = () => {
      console.log("Shutting down server gracefully...");
      httpServer.close(() => {
        pool.end().then(() => {
          console.log("MySQL pool closed. Exiting process.");
          process.exit(0);
        });
      });
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  } catch (error) {
    console.error("Failed to start server due to Database connection error:", error.message);
    process.exit(1);
  }
};

startServer();
