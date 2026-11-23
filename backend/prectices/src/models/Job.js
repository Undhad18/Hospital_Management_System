const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: [
        "PRODUCT_IMPORT"
      ]
    },

    status: {
      type: String,
      enum: [
        "queued",
        "processing",
        "completed",
        "failed",
        "cancelled"
      ],
      default: "queued"
    },

    total: {
      type: Number,
      default: 0
    },

    processed: {
      type: Number,
      default: 0
    },

    failed: {
      type: Number,
      default: 0
    },

    progress: {
      type: Number,
      default: 0
    },

    error: {
      type: String,
      default: null
    },

    result: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },

    startedAt: {
      type: Date,
      default: null
    },

    completedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Job", jobSchema);