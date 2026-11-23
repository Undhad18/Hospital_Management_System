const { z } = require("zod");

const createProductSchema = z.object({
    name: z
        .string()
        .trim()
        .min(2, "Product name must contain at least 2 characters")
        .max(100, "Product name cannot exceed 100 characters"),

    price: z
        .number()
        .positive("Price must be greater than 0"),

    stock: z
        .number()
        .int("Stock must be an integer")
        .nonnegative("Stock cannot be negative"),

    brand: z
        .string()
        .trim()
        .min(2)
        .max(50)
        .optional(),

    category: z
        .string()
        .trim()
        .min(2)
        .max(100)
});

const updateProductSchema = z.object({
    name: z
        .string()
        .trim()
        .min(2)
        .max(100)
        .optional(),

    price: z
        .number()
        .positive()
        .optional(),

    stock: z
        .number()
        .int()
        .nonnegative()
        .optional(),

    brand: z
        .string()
        .trim()
        .min(2)
        .max(50)
        .optional(),

    category: z
        .string()
        .trim()
        .min(2)
        .max(100)
        .optional()
});

const productQuerySchema = z.object({
    search: z.string().optional(),
    category: z.string().optional(),
    brand: z.string().optional(),
    minPrice: z.coerce.number().nonnegative().optional(),
    maxPrice: z.coerce.number().nonnegative().optional(),
    sort: z.enum([
        "price_asc",
        "price_desc",
        "newest",
        "oldest",
        "name_asc",
        "name_desc"
    ]).default("newest"),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20)
});

module.exports = {
    createProductSchema,
    updateProductSchema,
    productQuerySchema
};