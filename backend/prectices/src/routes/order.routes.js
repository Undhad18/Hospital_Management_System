const express = require("express");
const {
  getOrders,
  getOrderById,
  createOrder,
  updateOrderStatus
} = require("../controllers/order.controller");

const router = express.Router();

router.get("/", getOrders);
router.get("/:orderId", getOrderById);
router.post("/", createOrder);
router.patch("/:orderId/status", updateOrderStatus);
router.patch("/:orderId", updateOrderStatus);

module.exports = router;
