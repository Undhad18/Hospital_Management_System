const axios = require("axios");

const paymentClient = axios.create({
  baseURL: process.env.PAYMENT_API_URL,
  timeout: 5000
});

module.exports = paymentClient;