const rateLimit = require("express-rate-limit");

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,

  limit: 100,

  standardHeaders: "draft-7",

  legacyHeaders: false,

  message: {
    type: "https://api.shopsphere.com/problems/rate-limit-exceeded",
    title: "Too Many Requests",
    status: 429,
    detail: "Too many requests. Please try again later."
  }
});

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false
});

const registerLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false
});

const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false
});

module.exports = {
  apiLimiter,
  loginLimiter,
  registerLimiter,
  orderLimiter
};