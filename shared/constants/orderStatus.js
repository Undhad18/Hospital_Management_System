/**
 * Shared Order Status Constants
 */
const ORDER_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

const PAYMENT_METHODS = {
  CREDIT_CARD: "credit_card",
  PAYPAL: "paypal",
  CASH_ON_DELIVERY: "cod",
};

module.exports = {
  ORDER_STATUS,
  PAYMENT_METHODS,
};
