/**
 * Product Service
 * Powered by the OpenAPI Generated Typed API Client (productsApi).
 */
import { productsApi } from "../api";
import { getImageUrl } from "../utils/imageUrl";

export const getProductImageUrl = getImageUrl;

/**
 * Fetch products with dynamic Search, Filter, and Sort query params using Generated API Client
 * @param {Object} params - Query parameters
 */
export const getProducts = async (params = {}) => {
  return await productsApi.getProducts(params);
};

/**
 * Create a new product with Multer image upload using Generated API Client
 * @param {FormData|Object} formData
 */
export const createProductWithImage = async (formData) => {
  return await productsApi.createProduct(formData);
};

/**
 * Update an existing product with optional image upload using Generated API Client
 * @param {number|string} id
 * @param {FormData|Object} formData
 */
export const updateProduct = async (id, formData) => {
  return await productsApi.updateProduct(id, formData);
};

/**
 * Delete product by ID using Generated API Client
 * @param {number|string} id
 */
export const deleteProduct = async (id) => {
  return await productsApi.deleteProduct(id);
};
