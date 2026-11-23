const Product = require("../models/Product");
const { sendSuccess } = require("../utils/response");

const getProducts = async (req, res, next) => {
    try {
        const {
            search,
            category,
            brand,
            minPrice,
            maxPrice,
            sort = "newest",
            page = 1,
            limit = 20
        } = req.query;

        // -------------------------
        // Pagination validation
        // -------------------------

        const currentPage = Math.max(parseInt(page, 10) || 1, 1);

        const perPage = Math.min(
            Math.max(parseInt(limit, 10) || 20, 1),
            100
        );

        const skip = (currentPage - 1) * perPage;

        // -------------------------
        // Build filter
        // -------------------------

        const filter = {};

        // Search
        if (search) {
            filter.name = {
                $regex: search,
                $options: "i"
            };
        }

        // Category
        if (category) {
            filter.category = category;
        }

        // Brand
        if (brand) {
            filter.brand = brand;
        }

        // Price
        if (minPrice || maxPrice) {
            filter.price = {};

            if (minPrice) {
                filter.price.$gte = Number(minPrice);
            }

            if (maxPrice) {
                filter.price.$lte = Number(maxPrice);
            }
        }

        // -------------------------
        // Sorting
        // -------------------------

        const sortOptions = {
            price_asc: { price: 1 },
            price_desc: { price: -1 },
            newest: { createdAt: -1 },
            oldest: { createdAt: 1 },
            name_asc: { name: 1 },
            name_desc: { name: -1 }
        };

        const sortOption =
            sortOptions[sort] || sortOptions.newest;

        // -------------------------
        // Query database
        // -------------------------

        const [products, total] = await Promise.all([
            Product.find(filter)
                .sort(sortOption)
                .skip(skip)
                .limit(perPage),

            Product.countDocuments(filter)
        ]);

        // -------------------------
        // Pagination metadata
        // -------------------------

        const totalPages = Math.ceil(total / perPage);

        return sendSuccess(res, {
            statusCode: 200,
            message: "Products fetched successfully",
            data: products,
            meta: {
                page: currentPage,
                limit: perPage,
                total,
                totalPages,
                hasNextPage: currentPage < totalPages,
                hasPreviousPage: currentPage > 1
            }
        });

    } catch (error) {
        next(error);
    }
};

const createProduct = async (req, res) => {
    try {
        const product = await productService.createProduct(
            req.body
        );

        return res.status(201).json({
            success: true,
            message: "Product created successfully",
            data: product
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

module.exports = {
    getProducts,
    createProduct
};