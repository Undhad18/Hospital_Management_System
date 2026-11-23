const express = require("express");

const {
    getProducts,
    getProduct,
    createProduct,
    updateProduct,
    deleteProduct,
    register,
    login,
    createOrder
} = require("../../controllers/v1/product.controller");

const validate = require("../../middleware/validate");

const {
    createProductSchema,
    updateProductSchema,
    productQuerySchema
} = require("../../schemas/product.schema");
const { authenticate } = require("../../middleware/auth.middleware");
const { requireRole } = require("../../middleware/role.middleware");

const router = express.Router();

router.get("/:productId", getProduct);

router.get(
    "/",
    authenticate,
    requireScope("products:read"),
    validate(productQuerySchema, "query"),
    getProducts
);

router.post(
    "/",
    authenticate,
    requireRole("admin"),
    validate(createProductSchema, "body"),
    createProduct
);

router.patch(
    "/:productId",
    authenticate,
    requireRole("admin"),
    validate(updateProductSchema, "body"),
    updateProduct
);

router.delete(
  "/:id",
  authenticate,
  requireScope("products:delete"),
  deleteProduct
);

router.post(
    "/register",
    authenticate,
    requireRole("admin"),
    validate(registerSchema),
    register
);

router.post(
    "/login",
    validate(loginSchema),
    login
);

router.post(
    "/",
    validate(createOrderSchema),
    createOrder
);

module.exports = router;