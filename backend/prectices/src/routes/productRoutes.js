const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const Review = require("../models/Review");
const User = require("../models/User");
const { getProducts } = require("../controllers/productController");

// Create product
router.post("/", async (req, res) => {
  try {
    const { name, price, stock, category, description } = req.body || {};

    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof price !== "number" ||
      price < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid product data",
        errors: [
          {
            field: "name or price",
            message: "Valid name and non-negative price are required"
          }
        ]
      });
    }

    const product = await Product.create({
      name: name.trim(),
      price,
      stock,
      category: category ? category.trim() : "general",
      description: description ? description.trim() : ""
    });

    return res
      .status(201)
      .location(`/api/products/${product._id}`)
      .json({
        success: true,
        message: "Product created successfully",
        data: product
      });
  } catch (error) {
    console.error("Create product error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: {
        code: "INTERNAL_SERVER_ERROR"
      }
    });
  }
});

// GET /api/products
// Supports filtering, sorting and pagination
router.get("/", async (req, res) => {
  try {
    const {
      category,
      sort = "newest",
      page = "1",
      limit = "10"
    } = req.query;

    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.min(
      50,
      Math.max(1, parseInt(limit, 10) || 10)
    );

    const filter = {};

    if (category) {
      filter.category = category;
    }

    const sortOptions = {
      newest: { createdAt: -1 },
      price_asc: { price: 1 },
      price_desc: { price: -1 },
      name_asc: { name: 1 }
    };

    if (!sortOptions[sort]) {
      return res.status(400).json({
        success: false,
        message: "Invalid sort option"
      });
    }

    const skip = (currentPage - 1) * pageSize;

    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort(sortOptions[sort])
        .skip(skip)
        .limit(pageSize),
      Product.countDocuments(filter)
    ]);

    return res.status(200).json({
      success: true,
      message: "Products fetched successfully",
      data: products,
      pagination: {
        total,
        page: currentPage,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

// GET /api/products/:id
// Get a single product by ID
router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Product fetched successfully",
      data: product
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID"
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

// GET /api/products/:id/reviews
// Get all reviews for a product using Mongoose virtual populate
router.get("/:id/reviews", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate({
      path: "reviews",
      populate: {
        path: "userId",
        select: "name email"
      }
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Product reviews fetched successfully",
      data: product.reviews || []
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID"
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

// POST /api/products/:id/reviews
// Add a review for a product
router.post("/:id/reviews", async (req, res) => {
  try {
    const { userId, rating, comment } = req.body || {};

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    if (!rating || rating < 1 || rating > 5 || !comment || !comment.trim()) {
      return res.status(400).json({
        success: false,
        message: "Valid rating (1-5) and comment are required"
      });
    }

    const review = await Review.create({
      productId: req.params.id,
      userId,
      rating,
      comment: comment.trim()
    });

    return res.status(201).json({
      success: true,
      message: "Review created successfully",
      data: review
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID"
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

// GET /api/products/:id/category
// Get the category of a product
router.get("/:id/category", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Product category fetched successfully",
      data: {
        productId: product._id,
        category: product.category || "general"
      }
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID"
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

// GET /api/products/:id/related
// Get related products from the same category
router.get("/:id/related", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 5, 20);

    const filter = {
      _id: { $ne: product._id }
    };

    if (product.category) {
      filter.category = product.category;
    }

    const relatedProducts = await Product.find(filter).limit(limit);

    return res.status(200).json({
      success: true,
      message: "Related products fetched successfully",
      data: relatedProducts
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID"
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

// PATCH /api/products/:id
// Partially update a product by ID
router.patch("/:id", async (req, res) => {
  try {
    const updates = req.body || {};

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one field is required to update"
      });
    }

    // Validation for individual fields if present
    if (
      updates.name !== undefined &&
      (typeof updates.name !== "string" || !updates.name.trim())
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid name is required"
      });
    }

    if (
      updates.price !== undefined &&
      (typeof updates.price !== "number" || updates.price < 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Price must be a non-negative number"
      });
    }

    if (
      updates.stock !== undefined &&
      (!Number.isInteger(updates.stock) || updates.stock < 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Stock must be a non-negative integer"
      });
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      {
        new: true,
        runValidators: true
      }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: product
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID"
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

// PUT /api/products/:id
// Replace a product by ID
router.put("/:id", async (req, res) => {
  try {
    const { name, price, stock, description } = req.body;

    // Require all replacement fields
    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof price !== "number" ||
      price < 0 ||
      !Number.isInteger(stock) ||
      stock < 0 ||
      typeof description !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Complete and valid product data is required"
      });
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          name: name.trim(),
          price,
          stock,
          description
        }
      },
      {
        new: true,
        runValidators: true,
        overwriteImmutable: false
      }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Product replaced successfully",
      data: product
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID"
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

// DELETE /api/products/:id
// Delete a product by ID
router.delete("/:id", async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(
      req.params.id
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    return res.status(204).send();
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID"
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

// GET /api/products
router.get("/", getProducts);

module.exports = router;
