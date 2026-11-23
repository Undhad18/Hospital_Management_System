/**
 * Centralized Shared Module (ES Module Entry for Vite / React)
 */

// 1. Categories
export const CATEGORIES = [
  { id: "all", label: "All Categories", value: "all", slug: "all" },
  { id: "1", label: "Laptops & Computers", value: "1", slug: "laptops" },
  { id: "2", label: "Smartphones & Tablets", value: "2", slug: "smartphones" },
  { id: "3", label: "Audio & Headphones", value: "3", slug: "audio" },
  { id: "4", label: "Accessories & Peripherals", value: "4", slug: "accessories" },
];

export const CATEGORY_MAP = CATEGORIES.reduce((acc, cat) => {
  acc[cat.id] = cat.label;
  return acc;
}, {});

// 2. Sort Options
export const SORT_OPTIONS = [
  { value: "newest", label: "Newest First", sqlClause: "ORDER BY created_at DESC" },
  { value: "price_asc", label: "Price: Low to High", sqlClause: "ORDER BY price ASC" },
  { value: "price_desc", label: "Price: High to Low", sqlClause: "ORDER BY price DESC" },
  { value: "name_asc", label: "Name: A to Z", sqlClause: "ORDER BY name ASC" },
  { value: "name_desc", label: "Name: Z to A", sqlClause: "ORDER BY name DESC" },
  { value: "oldest", label: "Oldest First", sqlClause: "ORDER BY created_at ASC" },
];

export const DEFAULT_SORT = "newest";

// 3. Order Statuses & Payment Methods
export const ORDER_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

export const PAYMENT_METHODS = {
  CREDIT_CARD: "credit_card",
  PAYPAL: "paypal",
  CASH_ON_DELIVERY: "cod",
};

// 4. Product Validator
export function validateProductInput(data = {}) {
  const errors = [];

  if (!data.name || typeof data.name !== "string" || !data.name.trim()) {
    errors.push({ field: "name", message: "Product name is required." });
  } else if (data.name.trim().length < 2) {
    errors.push({ field: "name", message: "Product name must be at least 2 characters long." });
  } else if (data.name.trim().length > 255) {
    errors.push({ field: "name", message: "Product name cannot exceed 255 characters." });
  }

  const price = data.price !== undefined && data.price !== "" ? Number(data.price) : NaN;
  if (isNaN(price) || price < 0) {
    errors.push({ field: "price", message: "Price must be a valid non-negative number." });
  }

  if (data.discount_price !== undefined && data.discount_price !== null && data.discount_price !== "") {
    const discount = Number(data.discount_price);
    if (isNaN(discount) || discount < 0) {
      errors.push({ field: "discount_price", message: "Discount price must be a non-negative number." });
    } else if (!isNaN(price) && discount >= price) {
      errors.push({ field: "discount_price", message: "Discount price must be strictly lower than regular price." });
    }
  }

  if (data.stock !== undefined && data.stock !== null && data.stock !== "") {
    const stock = Number(data.stock);
    if (isNaN(stock) || stock < 0 || !Number.isInteger(stock)) {
      errors.push({ field: "stock", message: "Stock inventory must be a non-negative integer." });
    }
  }

  if (data.sku && typeof data.sku === "string" && data.sku.trim().length > 100) {
    errors.push({ field: "sku", message: "SKU code cannot exceed 100 characters." });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// 5. Auth Validators
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRegistration(data = {}) {
  const errors = [];

  if (!data.name || typeof data.name !== "string" || !data.name.trim()) {
    errors.push({ field: "name", message: "Full name is required." });
  } else if (data.name.trim().length < 2) {
    errors.push({ field: "name", message: "Name must be at least 2 characters long." });
  }

  if (!data.email || typeof data.email !== "string" || !data.email.trim()) {
    errors.push({ field: "email", message: "Email is required." });
  } else if (!EMAIL_REGEX.test(data.email.trim())) {
    errors.push({ field: "email", message: "Please provide a valid email address." });
  }

  if (!data.password || typeof data.password !== "string") {
    errors.push({ field: "password", message: "Password is required." });
  } else if (data.password.length < 6) {
    errors.push({ field: "password", message: "Password must be at least 6 characters long." });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function validateLogin(data = {}) {
  const errors = [];

  if (!data.email || typeof data.email !== "string" || !data.email.trim()) {
    errors.push({ field: "email", message: "Email is required." });
  } else if (!EMAIL_REGEX.test(data.email.trim())) {
    errors.push({ field: "email", message: "Please provide a valid email address." });
  }

  if (!data.password || typeof data.password !== "string" || !data.password) {
    errors.push({ field: "password", message: "Password is required." });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// 6. Normalizers
export function normalizeProduct(raw = {}) {
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

export default {
  CATEGORIES,
  CATEGORY_MAP,
  SORT_OPTIONS,
  DEFAULT_SORT,
  ORDER_STATUS,
  PAYMENT_METHODS,
  validateProductInput,
  validateRegistration,
  validateLogin,
  EMAIL_REGEX,
  normalizeProduct,
};
