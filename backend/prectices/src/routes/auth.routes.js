const express = require("express");

const {
    login,
    register,
    createOrder
} = require("../controllers/auth.controller");

const {
    loginLimiter,
    registerLimiter,
    orderLimiter
} = require("../middleware/rateLimiter.middleware");
const { authenticate } = require("../middleware/auth.middleware");

const router = express.Router();

router.post(
    "/login",
    loginLimiter,
    login
);

router.post(
    "/register",
    registerLimiter,
    register
);

router.post(
    "/orders",
    authenticate,
    orderLimiter,
    createOrder
);

module.exports = router;