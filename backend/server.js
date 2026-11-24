
// Hospital Management System API Server
const express = require("express");
const cors = require("cors");
const compression = require("compression");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const pool = require("./db");

const hospitalsRouter = require("./routes/hospitals");
const departmentsRouter = require("./routes/departments");
const masterDepartmentsRouter = require("./routes/masterDepartments");
const usersRouter = require("./routes/users");
const authRouter = require("./routes/auth");
const locationsRouter = require("./routes/locations");
const designationsRouter = require("./routes/designations");
const doctorsRouter = require("./routes/doctors");
const staffRouter = require("./routes/staff");
const patientsRouter = require("./routes/patients");
const appointmentsRouter = require("./routes/appointments");
const opdRouter = require("./routes/opd");
const consultationsRouter = require("./routes/consultations");
const notificationsRouter = require("./routes/notifications");
const admissionsRouter = require("./routes/admissions");
const wardsRouter = require("./routes/wards");
const bedsRouter = require("./routes/beds");
const labsRouter = require("./routes/labs");
const pharmacyRouter = require("./routes/pharmacy");
const pharmacyReportsRouter = require("./routes/pharmacyReports");
const prescriptionsRouter = require("./routes/prescriptions");
const consultationBillingRouter = require("./routes/consultationBilling");
const aiRouter = require("./routes/ai");
const digitalTwinRouter = require("./routes/digitalTwin");
const { startReminderScheduler } = require("./services/reminderScheduler");
const http = require("http");
const { initSocketServer } = require("./services/socketService");

const app = express();
const server = http.createServer(app);
const io = initSocketServer(server);
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(compression());
app.use(express.json());
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    maxAge: "7d",
    etag: true,
    immutable: true,
  })
);

app.use("/api/hospitals", hospitalsRouter);
app.use("/api/departments", departmentsRouter);
app.use("/api/master-departments", masterDepartmentsRouter);
app.use("/api/doctors", doctorsRouter);
app.use("/api/staff", staffRouter);
app.use("/api/patients", patientsRouter);
app.use("/api/appointments", appointmentsRouter);
app.use("/api/opd", opdRouter);
app.use("/api/consultations", consultationsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/admissions", admissionsRouter);
app.use("/api/wards", wardsRouter);
app.use("/api/beds", bedsRouter);
app.use("/api/labs", labsRouter);
app.use("/api/pharmacy/reports", pharmacyReportsRouter);
app.use("/api/pharmacy", pharmacyRouter);
app.use("/api/prescriptions", prescriptionsRouter);
app.use("/api/consultation-billing", consultationBillingRouter);
app.use("/api/ai", aiRouter);
app.use("/api/digital-twin", digitalTwinRouter);
app.use("/api/users", usersRouter);
app.use("/api/auth", authRouter);
app.use("/api/locations", locationsRouter);
app.use("/api/designations", designationsRouter);

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Hospital Management API is running",
  });
});

app.get("/api/health/db", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS connected");

    res.json({
      success: true,
      message: "MySQL connection successful",
      database: rows[0].connected === 1,
    });
  } catch (error) {
    console.error("Database connection failed:", error.message);

    res.status(500).json({
      success: false,
      message: "Database connection failed",
    });
  }
});

// 404 Route Not Found Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint '${req.method} ${req.originalUrl}' not found.`,
  });
});

// Global Centralized Error Handler
app.use((err, req, res, _next) => {
  console.error(`[Global Error] ${req.method} ${req.originalUrl}:`, err.stack || err.message || err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: err.message || "An unexpected internal server error occurred.",
    ...(process.env.NODE_ENV !== "production" && { error: err.message }),
  });
});

server.listen(PORT, () => {
  console.log(`Backend running on port ${PORT} with real-time Socket.IO`);
  startReminderScheduler();
});
