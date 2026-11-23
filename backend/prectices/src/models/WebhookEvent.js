const mongoose = require("mongoose");

const webhookEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true
    },

    eventType: {
      type: String,
      required: true
    },

    processed: {
      type: Boolean,
      default: false
    },

    receivedAt: {
      type: Date,
      default: Date.now
    }
  }
);

module.exports = mongoose.model(
  "WebhookEvent",
  webhookEventSchema
);