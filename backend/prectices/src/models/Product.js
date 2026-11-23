
const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    description: {
      type: String,
      default: ""
    },
    category: {
      type: String,
      default: "general",
      trim: true
    },
    stock: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  { timestamps: true }
);

// Virtual relationship with Review
productSchema.virtual("reviews", {
  ref: "Review",
  localField: "_id",
  foreignField: "productId"
});

productSchema.set("toJSON", { virtuals: true });
productSchema.set("toObject", { virtuals: true });

productSchema.virtual("priceWithGST").get(function () {
  return Number((this.price * 1.18).toFixed(2));
});

module.exports = mongoose.model("Product", productSchema);
