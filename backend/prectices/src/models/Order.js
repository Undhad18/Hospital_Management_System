const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    price: {
      type: Number,
      default: 0
    }
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      default: () => Math.floor(1000 + Math.random() * 9000).toString(),
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    items: [orderItemSchema],
    totalAmount: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ["pending", "processing", "paid", "shipped", "delivered", "cancelled"],
      default: "pending"
    },
    shippingAddress: {
      addressLine1: String,
      city: String,
      state: String,
      postalCode: String,
      country: String
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
