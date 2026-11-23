const db = require("../config/db");
const {
  validateProductInput,
  SORT_OPTIONS,
  DEFAULT_SORT,
} = require("../../shared");

/**
 * Create a new product with image upload
 */
const createProduct = async (req, res) => {
  try {
    const {
      name,
      category_id,
      price,
      discount_price,
      stock,
      sku,
      brand,
      status,
    } = req.body || {};

    // 1. Validate fields using shared validator
    const validation = validateProductInput(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.errors[0]?.message || "Validation error",
        errors: validation.errors,
      });
    }

    const parsedPrice = Number(price);

    // 2. Process image file if uploaded
    let imageUrl = null;
    if (req.file) {
      imageUrl = `/uploads/products/${req.file.filename}`;
    }

    // 3. Format numeric and optional fields
    const parsedDiscountPrice =
      discount_price !== undefined && discount_price !== ""
        ? Number(discount_price)
        : null;
    const parsedStock =
      stock !== undefined && stock !== "" ? parseInt(stock, 10) : 0;
    const parsedCategoryId =
      category_id !== undefined && category_id !== ""
        ? parseInt(category_id, 10)
        : null;
    const parsedStatus =
      status !== undefined && status !== "" ? parseInt(status, 10) : 1;

    // 4. Insert product into MySQL database
    const sql = `
      INSERT INTO products (
        name,
        category_id,
        price,
        discount_price,
        stock,
        sku,
        brand,
        image_url,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await db.execute(sql, [
      name.trim(),
      parsedCategoryId,
      parsedPrice,
      parsedDiscountPrice,
      parsedStock,
      sku ? sku.trim() : null,
      brand ? brand.trim() : null,
      imageUrl,
      parsedStatus,
    ]);

    return res.status(201).json({
      success: true,
      message: "Product created successfully",
      product: {
        id: result.insertId,
        name: name.trim(),
        category_id: parsedCategoryId,
        price: parsedPrice,
        discount_price: parsedDiscountPrice,
        stock: parsedStock,
        sku: sku ? sku.trim() : null,
        brand: brand ? brand.trim() : null,
        image_url: imageUrl,
        status: parsedStatus,
      },
    });
  } catch (error) {
    console.error("Create product error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create product",
      error: error.message,
    });
  }
};

/**
 * Get all products with dynamic Search, Filter, Sorting, and LIMIT/OFFSET Pagination in MySQL
 */
const getProducts = async (req, res) => {
  try {
    const {
      search,
      name,
      category_id,
      brand,
      minPrice,
      maxPrice,
      status,
      sort = "newest",
      page = 1,
      limit = 10,
    } = req.query;

    const queryConditions = ["1=1"];
    const queryParams = [];

    // 1. Text Search across name, brand, or SKU
    const searchTerm = search || name;
    if (searchTerm && searchTerm.trim()) {
      queryConditions.push("(name LIKE ? OR brand LIKE ? OR sku LIKE ?)");
      const term = `%${searchTerm.trim()}%`;
      queryParams.push(term, term, term);
    }

    // 2. Category Filter
    if (
      category_id !== undefined &&
      category_id !== "" &&
      category_id !== "all"
    ) {
      queryConditions.push("category_id = ?");
      queryParams.push(parseInt(category_id, 10));
    }

    // 3. Brand Filter
    if (brand && brand.trim() && brand !== "all") {
      queryConditions.push("brand = ?");
      queryParams.push(brand.trim());
    }

    // 4. Min Price Filter
    if (minPrice !== undefined && minPrice !== "" && !isNaN(Number(minPrice))) {
      queryConditions.push("price >= ?");
      queryParams.push(Number(minPrice));
    }

    // 5. Max Price Filter
    if (maxPrice !== undefined && maxPrice !== "" && !isNaN(Number(maxPrice))) {
      queryConditions.push("price <= ?");
      queryParams.push(Number(maxPrice));
    }

    // 6. Status Filter
    if (status !== undefined && status !== "" && status !== "all") {
      queryConditions.push("status = ?");
      queryParams.push(parseInt(status, 10));
    }

    // 7. Sort Options from shared constants
    const matchedSort = SORT_OPTIONS.find((s) => s.value === sort);
    const orderByClause = matchedSort ? matchedSort.sqlClause : "ORDER BY created_at DESC";

    // 8. Pagination Calculations (LIMIT and OFFSET)
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const offset = (pageNum - 1) * limitNum;

    const whereClause = `WHERE ${queryConditions.join(" AND ")}`;

    // Query for total count matching all filter criteria
    const countSql = `SELECT COUNT(*) AS total FROM products ${whereClause}`;
    const [countResult] = await db.query(countSql, queryParams);
    const total = countResult[0]?.total || 0;
    const totalPages = Math.ceil(total / limitNum) || 1;
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    // Query for paginated products data using LIMIT and OFFSET
    const dataSql = `SELECT * FROM products ${whereClause} ${orderByClause} LIMIT ? OFFSET ?`;
    const [rows] = await db.query(dataSql, [...queryParams, limitNum, offset]);

    return res.status(200).json({
      success: true,
      message: "Products fetched successfully",
      data: rows,
      count: rows.length,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNextPage,
        hasPrevPage,
        nextPage: hasNextPage ? pageNum + 1 : null,
        prevPage: hasPrevPage ? pageNum - 1 : null,
      },
      activeFilters: {
        search: searchTerm || null,
        category_id: category_id || null,
        minPrice: minPrice || null,
        maxPrice: maxPrice || null,
        brand: brand || null,
        sort,
      },
    });
  } catch (error) {
    console.error("Get products error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve products",
      error: error.message,
    });
  }
};

/**
 * Get single product by ID
 */
const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query("SELECT * FROM products WHERE id = ? LIMIT 1", [
      id,
    ]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error("Get product by ID error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch product",
      error: error.message,
    });
  }
};

/**
 * Delete product by ID
 */
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await db.query("DELETE FROM products WHERE id = ?", [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    return res.status(204).send();
  } catch (error) {
    console.error("Delete product error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete product",
      error: error.message,
    });
  }
};

/**
 * Update product by ID (Admin only)
 */
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, brand, category_id, price, discount_price, stock, sku, status } = req.body;

    // Check if product exists
    const [existing] = await db.query("SELECT * FROM products WHERE id = ? LIMIT 1", [id]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const currentProduct = existing[0];

    // Determine image URL (new uploaded file or keep existing)
    let imageUrl = currentProduct.image_url;
    if (req.file) {
      imageUrl = `/uploads/products/${req.file.filename}`;
    }

    const updatedName = name !== undefined ? name.trim() : currentProduct.name;
    const updatedBrand = brand !== undefined ? brand.trim() : currentProduct.brand;
    const updatedCategoryId = category_id !== undefined ? category_id : currentProduct.category_id;
    const updatedPrice = price !== undefined ? Number(price) : currentProduct.price;
    const updatedDiscountPrice =
      discount_price !== undefined && discount_price !== "" && !isNaN(Number(discount_price))
        ? Number(discount_price)
        : null;
    const updatedStock = stock !== undefined ? parseInt(stock, 10) : currentProduct.stock;
    const updatedSku = sku !== undefined ? sku.trim() : currentProduct.sku;
    const updatedStatus = status !== undefined ? parseInt(status, 10) : currentProduct.status;

    await db.query(
      `UPDATE products 
       SET name = ?, brand = ?, category_id = ?, price = ?, discount_price = ?, stock = ?, sku = ?, status = ?, image_url = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        updatedName,
        updatedBrand,
        updatedCategoryId,
        updatedPrice,
        updatedDiscountPrice,
        updatedStock,
        updatedSku,
        updatedStatus,
        imageUrl,
        id,
      ]
    );

    const [updatedRows] = await db.query("SELECT * FROM products WHERE id = ? LIMIT 1", [id]);

    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: updatedRows[0],
    });
  } catch (error) {
    console.error("Update product error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update product",
      error: error.message,
    });
  }
};

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
};