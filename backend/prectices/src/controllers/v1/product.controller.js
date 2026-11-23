const crypto = require("crypto");
const Product = require("../../models/Product");
const { sendSuccess } = require("../../utils/response");

const getProducts = async (req, res, next) => {
    try {
        const product = await Product.findById(
            req.params.productId
        ).lean();

        if (!product) {
            const error = new Error("Product not found");

            error.statusCode = 404;
            error.type =
                "https://api.shopsphere.com/problems/product-not-found";
            error.title = "Product Not Found";
            error.detail =
                `Product with ID ${req.params.productId} was not found.`;

            throw error;
        }

        const productString = JSON.stringify(product);

        const etag = `"${crypto
            .createHash("sha256")
            .update(productString)
            .digest("hex")}"`;

        res.setHeader("ETag", etag);

        res.setHeader(
            "Cache-Control",
            "private, max-age=60"
        );

        const clientETag = req.get("If-None-Match");

        if (clientETag === etag) {
            return res.status(304).end();
        }

        return sendSuccess(res, {
            statusCode: 200,
            message: "Product fetched successfully",
            data: product
        });

    } catch (error) {
        next(error);
    }
};

module.exports = { getProducts };