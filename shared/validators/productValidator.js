/**
 * Shared Universal Product Validation Logic
 * Runs client-side for immediate UX feedback and server-side for database security.
 */
function validateProductInput(data = {}) {
  const errors = [];

  // 1. Name validation
  if (!data.name || typeof data.name !== "string" || !data.name.trim()) {
    errors.push({ field: "name", message: "Product name is required." });
  } else if (data.name.trim().length < 2) {
    errors.push({ field: "name", message: "Product name must be at least 2 characters long." });
  } else if (data.name.trim().length > 255) {
    errors.push({ field: "name", message: "Product name cannot exceed 255 characters." });
  }

  // 2. Price validation
  const price = data.price !== undefined && data.price !== "" ? Number(data.price) : NaN;
  if (isNaN(price) || price < 0) {
    errors.push({ field: "price", message: "Price must be a valid non-negative number." });
  }

  // 3. Discount price validation
  if (data.discount_price !== undefined && data.discount_price !== null && data.discount_price !== "") {
    const discount = Number(data.discount_price);
    if (isNaN(discount) || discount < 0) {
      errors.push({ field: "discount_price", message: "Discount price must be a non-negative number." });
    } else if (!isNaN(price) && discount >= price) {
      errors.push({ field: "discount_price", message: "Discount price must be strictly lower than regular price." });
    }
  }

  // 4. Stock validation
  if (data.stock !== undefined && data.stock !== null && data.stock !== "") {
    const stock = Number(data.stock);
    if (isNaN(stock) || stock < 0 || !Number.isInteger(stock)) {
      errors.push({ field: "stock", message: "Stock inventory must be a non-negative integer." });
    }
  }

  // 5. SKU validation
  if (data.sku && typeof data.sku === "string" && data.sku.trim().length > 100) {
    errors.push({ field: "sku", message: "SKU code cannot exceed 100 characters." });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

module.exports = {
  validateProductInput,
};
