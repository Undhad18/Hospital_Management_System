const express = require("express");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");

const productImportRoutes = require("./src/routes/product.routes");
const productRoutes = require("./src/routes/productRoutes");
const jobRoutes = require("./src/routes/job.routes");
const authRoutes = require("./src/routes/auth.routes");
const errorHandler = require("./src/middleware/errorHandler");
const webhookRoutes = require("./src/routes/webhook.routes");
const orderRoutes = require("./src/routes/order.routes");
const {apiLimiter } = require("./src/middleware/rateLimiter.middleware");

let swaggerDocument;
try {
  swaggerDocument = YAML.load("./docs/openapi.yaml");
} catch (e) {
  // Swagger load fallback
}

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: "http://localhost:5173"
  })
);

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "API is running"
  });
});

if (swaggerDocument) {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
}

app.use("/api", apiLimiter);

// Routes
app.use("/api/v1/products", productImportRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/products", productRoutes);
app.use("/api/v1/jobs", jobRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/v1/webhooks", webhookRoutes);
// Error handler MUST be after routes
app.use(errorHandler);


module.exports = app;