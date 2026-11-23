require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const connectDB = require("./config/db");
const productRoutes = require("./src/routes/productRoutes");
const productImportRoutes = require("./src/routes/product.routes");
const jobRoutes = require("./src/routes/job.routes");
const errorHandler = require("./src/middleware/errorHandler");
const webhookRoutes = require("./src/routes/webhook.routes");
const realtimeRoutes = require("./src/routes/realtime.routes");
const authRoutes = require("./src/routes/auth.routes");
const orderRoutes = require("./src/routes/order.routes");
const loggerMiddleware = require("./src/middleware/logger.middleware");
const app = express();

app.use(loggerMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Swagger Documentation
try {
  const swaggerDocument = YAML.load(path.join(__dirname, "docs", "openapi.yaml"));
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
} catch (err) {
  console.error("Error loading Swagger documentation:", err.message);
}

// Database connection
connectDB();

app.use(
    cors({
        origin: "http://localhost:5173"
    })
);

// Health check route
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "API is running"
  });
});

// Mount routes
app.use("/api/v1/products", productImportRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/products", productRoutes);
app.use("/api/v1/jobs", jobRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/v1/webhooks", webhookRoutes);
app.use("/api/v1/realtime", realtimeRoutes);
// Error handling middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Swagger Docs available at http://localhost:${PORT}/api-docs`);
});