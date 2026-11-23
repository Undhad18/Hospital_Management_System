
require("dotenv").config();

const mongoose = require("mongoose");
const Product = require("./models/Product");
const Review = require("./models/Review");
const User = require("./models/User");

async function getProductReviews() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const product = await Product.findOne({
      name: "Wireless Mouse"
    }).populate({
      path: "reviews",
      populate: {
        path: "userId",
        select: "name email"
      }
    });

    console.log(JSON.stringify(product, null, 2));
  } catch (error) {
    console.error(error);
  } finally {
    await mongoose.disconnect();
  }
}

getProductReviews();
