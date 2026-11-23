/**
 * @typedef {Object} Product
 * @property {number} id - Unique product identifier
 * @property {string} name - Product title
 * @property {number|null} category_id - Category ID
 * @property {number|string} price - Base price in USD
 * @property {number|string|null} discount_price - Optional promotional discount price
 * @property {number} stock - Available inventory count
 * @property {string|null} sku - Unique SKU tracking code
 * @property {string|null} brand - Brand or manufacturer name
 * @property {string|null} image_url - Relative path to product image
 * @property {number} status - 1 for active, 0 for inactive
 * @property {string} created_at - Timestamp of creation
 * @property {string} updated_at - Timestamp of last modification
 */

/**
 * @typedef {Object} Order
 * @property {number} id - Order ID
 * @property {number} user_id - Customer User ID
 * @property {number|string} total_amount - Total charged
 * @property {string} status - Order status ('completed', 'pending', etc.)
 * @property {string|null} shipping_address - Delivery destination
 * @property {string} payment_method - Payment gateway identifier
 * @property {Array<OrderItem>} items - Order items
 * @property {string} created_at - Order timestamp
 */

/**
 * @typedef {Object} OrderItem
 * @property {number} id - Order item ID
 * @property {number} order_id - Associated order ID
 * @property {number} product_id - Product ID
 * @property {number} quantity - Purchased quantity
 * @property {number|string} price - Price locked at purchase time
 * @property {string} [name] - Product name snapshot
 * @property {string} [image_url] - Product image snapshot
 */

/**
 * Normalizes raw MySQL product rows into standard numeric types
 * @param {Object} raw - Raw DB or API object
 * @returns {Product}
 */
function normalizeProduct(raw = {}) {
  return {
    id: Number(raw.id) || 0,
    name: String(raw.name || "").trim(),
    category_id: raw.category_id !== null && raw.category_id !== undefined ? Number(raw.category_id) : null,
    price: Number(raw.price) || 0,
    discount_price:
      raw.discount_price !== null && raw.discount_price !== undefined && raw.discount_price !== ""
        ? Number(raw.discount_price)
        : null,
    stock: parseInt(raw.stock, 10) || 0,
    sku: raw.sku ? String(raw.sku).trim() : null,
    brand: raw.brand ? String(raw.brand).trim() : null,
    image_url: raw.image_url ? String(raw.image_url) : null,
    status: raw.status !== undefined ? Number(raw.status) : 1,
    created_at: raw.created_at || new Date().toISOString(),
    updated_at: raw.updated_at || new Date().toISOString(),
  };
}

module.exports = {
  normalizeProduct,
};
