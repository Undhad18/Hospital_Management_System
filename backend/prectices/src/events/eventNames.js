const EVENTS = {
  PRODUCT_CREATED: "product.created",
  PRODUCT_UPDATED: "product.updated",
  PRODUCT_DELETED: "product.deleted",

  ORDER_CREATED: "order.created",
  ORDER_STATUS_CHANGED:
    "order.status_changed",
  ORDER_CANCELLED:
    "order.cancelled",

  PAYMENT_SUCCEEDED:
    "payment.succeeded",
  PAYMENT_FAILED:
    "payment.failed",
  PAYMENT_REFUNDED:
    "payment.refunded",

  INVENTORY_UPDATED:
    "inventory.updated",

  NOTIFICATION_CREATED:
    "notification.created"
};

module.exports = EVENTS;