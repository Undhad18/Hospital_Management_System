const Product = require("../../models/Product");
const { sendSuccess } = require("../../utils/response");

const getProducts = async (req, res, next) => {
    try {
        const products = await Product.find();

        return sendSuccess(res, {
            statusCode: 200,
            message: "Products fetched successfully",
            data: products.map((product) => ({
                id: product._id,
                productName: product.name,
                sellingPrice: product.price
            }))
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { getProducts };