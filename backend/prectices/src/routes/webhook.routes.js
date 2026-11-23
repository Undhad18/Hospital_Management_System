const express = require("express");

const {
  handlePaymentWebhook
} = require("../controllers/webhook.controller");

const router = express.Router();

router.post(
  "/payment",
  handlePaymentWebhook
);

module.exports = router;