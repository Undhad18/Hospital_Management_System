import { z } from "zod";

export const productFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Product name must contain at least 2 characters")
    .max(100, "Product name cannot exceed 100 characters"),

  price: z.coerce
    .number({ invalid_type_error: "Price must be a valid number" })
    .positive("Price must be greater than 0"),

  stock: z.coerce
    .number({ invalid_type_error: "Stock must be a valid number" })
    .int("Stock must be a whole number")
    .nonnegative("Stock cannot be negative"),

  category: z
    .string()
    .trim()
    .min(2, "Category must contain at least 2 characters")
    .max(100, "Category cannot exceed 100 characters"),

  description: z
    .string()
    .trim()
    .max(500, "Description cannot exceed 500 characters")
    .optional()
    .default("")
});
