const express = require("express");

const {
  subscribe
} = require("../controllers/realtime.controller");

const router = express.Router();

router.get(
  "/events",
  subscribe
);

module.exports = router;