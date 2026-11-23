const express = require("express");
const { getProducts } = require(
    "../../controllers/v2/product.controller"
);
const { authenticate } = require("../../middleware/auth.middleware");
const { requireScope } = require("../../middleware/scope.middleware");

const router = express.Router();

router.get(
    "/",
    authenticate,
    requireScope("products:read"),
    getProducts
);

module.exports = router;