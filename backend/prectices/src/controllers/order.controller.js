const mongoose = require("mongoose");
const Order = require("../models/Order");

const getOrders = async (req, res, next) => {
  try {
    const orders = await Order.find().populate("items.productId").sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: "Orders fetched successfully",
      data: orders
    });
  } catch (error) {
    next(error);
  }
};

const getOrderById = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const query = [
      { orderId: String(orderId) }
    ];

    if (mongoose.Types.ObjectId.isValid(orderId)) {
      query.push({ _id: orderId });
    }

    const order = await Order.findOne({ $or: query }).populate("items.productId");

    if (!order) {
      return res.status(404).json({
        type: "https://api.shopsphere.com/problems/order-not-found",
        title: "Order Not Found",
        status: 404,
        detail: `Order with ID ${orderId} was not found.`,
        instance: req.originalUrl
      });
    }

    return res.status(200).json({
      success: true,
      message: "Order fetched successfully",
      data: order
    });
  } catch (error) {
    next(error);
  }
};

const createOrder = async (req, res, next) => {
  try {
    const { items, shippingAddress, totalAmount } = req.body || {};

    const order = await Order.create({
      items: items || [],
      shippingAddress: shippingAddress || {},
      totalAmount: totalAmount || 0,
      status: "pending"
    });

    return res.status(201).json({
      success: true,
      message: "Order created successfully",
      data: order
    });
  } catch (error) {
    next(error);
  }
};

const updateOrderStatus = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body || {};

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status field is required"
      });
    }

    const query = [
      { orderId: String(orderId) }
    ];

    if (mongoose.Types.ObjectId.isValid(orderId)) {
      query.push({ _id: orderId });
    }

    const order = await Order.findOneAndUpdate(
      { $or: query },
      { $set: { status } },
      { returnDocument: "after", runValidators: true }
    ).populate("items.productId");

    if (!order) {
      return res.status(404).json({
        type: "https://api.shopsphere.com/problems/order-not-found",
        title: "Order Not Found",
        status: 404,
        detail: `Order with ID ${orderId} was not found.`,
        instance: req.originalUrl
      });
    }

    return res.status(200).json({
      success: true,
      message: "Order status updated successfully",
      data: order
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOrders,
  getOrderById,
  createOrder,
  updateOrderStatus
};
