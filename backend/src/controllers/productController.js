const Product = require("../models/Product");
const { sendSuccess } = require("../utils/response");

// GET all products
const getProducts = async (req, res, next) => {
  try {
    const products = await Product.find();
    return sendSuccess(res, {
      statusCode: 200,
      message: "Products fetched successfully",
      data: products
    });
  } catch (error) {
    next(error);
  }
};

// GET single product by ID (Your Step 9 code)
const getProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      const error = new Error("Product not found");
      error.statusCode = 404;
      error.type = "https://api.shopsphere.com/problems/product-not-found";
      error.title = "Product Not Found";
      error.detail = `Product with ID ${req.params.id} was not found.`;

      throw error;
    }

    res.status(200).json({
      success: true,
      message: "Product fetched successfully",
      data: product
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProducts,
  getProduct
};
