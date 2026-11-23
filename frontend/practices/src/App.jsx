import React, { useState, useEffect, useCallback } from "react";
import {
  fetchProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  checkApi,
  ApiError,
} from "./services/api";
import { productFormSchema } from "./schemas/product.schema";
import {
  Plus,
  Edit2,
  Trash2,
  Search,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Layers,
  Package,
  DollarSign,
  Boxes,
  X,
  Activity,
  ChevronRight,
  TrendingUp,
} from "lucide-react";

export default function App() {
  // State
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [apiStatus, setApiStatus] = useState("checking"); // 'online' | 'offline' | 'checking'
  
  // Filtering & Pagination
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  
  // Feedback
  const [errorBanner, setErrorBanner] = useState(null);
  const [successToast, setSuccessToast] = useState(null);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    price: "",
    stock: "",
    category: "Electronics",
    description: "",
  });
  const [formErrors, setFormErrors] = useState({});

  // Delete Confirmation State
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Categories list
  const categories = ["Electronics", "Clothing", "Home & Kitchen", "Books", "Fitness", "Beauty", "general"];

  // Auto-dismiss toast
  useEffect(() => {
    if (successToast) {
      const timer = setTimeout(() => setSuccessToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successToast]);

  // Check API health
  const verifyHealth = useCallback(async () => {
    try {
      await checkApi();
      setApiStatus("online");
    } catch {
      setApiStatus("offline");
    }
  }, []);

  // Fetch products
  const loadProducts = useCallback(async () => {
    setLoading(true);
    setErrorBanner(null);
    try {
      const params = {
        sort: sortBy,
      };
      if (selectedCategory !== "all") {
        params.category = selectedCategory;
      }
      const res = await fetchProducts(params);
      setProducts(res?.data || []);
      setApiStatus("online");
    } catch (err) {
      setErrorBanner(err.message || "Failed to load products.");
      if (err.status === 0) setApiStatus("offline");
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, sortBy]);

  useEffect(() => {
    verifyHealth();
    loadProducts();
  }, [verifyHealth, loadProducts]);

  // Handle Form Change
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear field-level error on change
    if (formErrors[name]) {
      setFormErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  // Open Modal for Create
  const handleOpenCreate = () => {
    setEditingProduct(null);
    setFormData({
      name: "",
      price: "",
      stock: "",
      category: "Electronics",
      description: "",
    });
    setFormErrors({});
    setModalOpen(true);
  };

  // Open Modal for Edit
  const handleOpenEdit = (prod) => {
    setEditingProduct(prod);
    setFormData({
      name: prod.name || "",
      price: prod.price !== undefined ? String(prod.price) : "",
      stock: prod.stock !== undefined ? String(prod.stock) : "",
      category: prod.category || "Electronics",
      description: prod.description || "",
    });
    setFormErrors({});
    setModalOpen(true);
  };

  // Validate form with Zod
  const validateForm = () => {
    const parsedPrice = parseFloat(formData.price);
    const parsedStock = parseInt(formData.stock, 10);

    const payload = {
      name: formData.name,
      price: isNaN(parsedPrice) ? formData.price : parsedPrice,
      stock: isNaN(parsedStock) ? formData.stock : parsedStock,
      category: formData.category,
      description: formData.description || "",
    };

    const result = productFormSchema.safeParse(payload);
    if (!result.success) {
      const fieldErrors = {};
      result.error.errors.forEach((err) => {
        const fieldName = err.path[0];
        if (fieldName && !fieldErrors[fieldName]) {
          fieldErrors[fieldName] = err.message;
        }
      });
      setFormErrors(fieldErrors);
      return null;
    }

    return result.data;
  };

  // Handle Submit Form
  const handleSubmit = async (e) => {
    e.preventDefault();
    const validatedData = validateForm();
    if (!validatedData) return;

    setSubmitting(true);
    setErrorBanner(null);

    try {
      if (editingProduct) {
        // Edit
        await updateProduct(editingProduct._id, validatedData);
        setSuccessToast(`Product "${validatedData.name}" updated successfully!`);
      } else {
        // Create
        await createProduct(validatedData);
        setSuccessToast(`Product "${validatedData.name}" created successfully!`);
      }
      setModalOpen(false);
      loadProducts();
    } catch (err) {
      if (err.details && Array.isArray(err.details)) {
        // Backend validation errors mapping
        const backendFieldErrors = {};
        err.details.forEach((d) => {
          if (d.field) backendFieldErrors[d.field] = d.message;
        });
        setFormErrors(backendFieldErrors);
      }
      setErrorBanner(err.message || "Failed to save product.");
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Delete Product
  const handleDelete = async (id) => {
    setSubmitting(true);
    try {
      await deleteProduct(id);
      setDeleteConfirmId(null);
      setSuccessToast("Product deleted successfully.");
      loadProducts();
    } catch (err) {
      setErrorBanner(err.message || "Failed to delete product.");
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered by search on client side
  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.description && p.description.toLowerCase().includes(search.toLowerCase())) ||
    (p.category && p.category.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30 shadow-inner">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-lg font-bold tracking-tight text-white">Full-Stack Product Hub</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-400 border border-indigo-800/60 font-mono">
                  MERN Tier
                </span>
              </div>
              <p className="text-xs text-slate-400">React + Express + Mongo/MySQL End-to-End CRUD</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Health Status Pill */}
            <div
              className={`flex items-center space-x-2 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                apiStatus === "online"
                  ? "bg-emerald-950/60 border-emerald-800/80 text-emerald-300"
                  : apiStatus === "checking"
                  ? "bg-amber-950/60 border-amber-800/80 text-amber-300"
                  : "bg-rose-950/60 border-rose-800/80 text-rose-300"
              }`}
            >
              <Activity className={`w-3.5 h-3.5 ${apiStatus === "checking" ? "animate-spin" : ""}`} />
              <span>
                {apiStatus === "online" ? "API Live (:5000)" : apiStatus === "checking" ? "Connecting..." : "API Offline"}
              </span>
            </div>

            <button
              onClick={handleOpenCreate}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Product</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Toast / Notification Banner */}
        {errorBanner && (
          <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-800/70 text-rose-200 flex items-start justify-between shadow-lg animate-fade-in">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold">Operation Error</h4>
                <p className="text-xs text-rose-300/90 mt-0.5">{errorBanner}</p>
              </div>
            </div>
            <button
              onClick={() => setErrorBanner(null)}
              className="text-rose-400 hover:text-rose-200 p-1 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {successToast && (
          <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-800/70 text-emerald-200 flex items-start justify-between shadow-lg animate-fade-in">
            <div className="flex items-center space-x-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <p className="text-sm font-medium">{successToast}</p>
            </div>
            <button
              onClick={() => setSuccessToast(null)}
              className="text-emerald-400 hover:text-emerald-200 p-1 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl flex items-center space-x-4">
            <div className="p-3 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Total Catalog</p>
              <h3 className="text-2xl font-bold text-white mt-0.5">{products.length} Products</h3>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl flex items-center space-x-4">
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
              <Boxes className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Total Inventory</p>
              <h3 className="text-2xl font-bold text-white mt-0.5">
                {products.reduce((acc, curr) => acc + (Number(curr.stock) || 0), 0)} Units
              </h3>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl flex items-center space-x-4">
            <div className="p-3 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Average Price</p>
              <h3 className="text-2xl font-bold text-white mt-0.5">
                ${products.length > 0
                  ? (
                      products.reduce((acc, curr) => acc + (Number(curr.price) || 0), 0) /
                      products.length
                    ).toFixed(2)
                  : "0.00"}
              </h3>
            </div>
          </div>
        </div>

        {/* Toolbar: Search, Filter, Sort, Refresh */}
        <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Category Select */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            {/* Sort Select */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="newest">Newest First</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="name_asc">Name: A - Z</option>
            </select>

            <button
              onClick={loadProducts}
              disabled={loading}
              title="Refresh products list"
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-indigo-400" : ""}`} />
            </button>
          </div>
        </div>

        {/* Product Table / Cards */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          {loading ? (
            /* Skeleton Loading State */
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="animate-pulse flex items-center justify-between py-3 border-b border-slate-800/60">
                  <div className="space-y-2 w-1/3">
                    <div className="h-4 bg-slate-800 rounded w-3/4"></div>
                    <div className="h-3 bg-slate-800/60 rounded w-1/2"></div>
                  </div>
                  <div className="h-4 bg-slate-800 rounded w-20"></div>
                  <div className="h-4 bg-slate-800 rounded w-16"></div>
                  <div className="h-8 bg-slate-800 rounded w-24"></div>
                </div>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            /* Empty State */
            <div className="py-16 px-4 text-center space-y-4">
              <div className="inline-flex p-4 bg-slate-800/60 rounded-full text-slate-400">
                <Package className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">No products found</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  {search || selectedCategory !== "all"
                    ? "Try adjusting your search query or filters to find products."
                    : "Your inventory catalog is currently empty. Get started by adding a product."}
                </p>
              </div>
              <button
                onClick={handleOpenCreate}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create First Product</span>
              </button>
            </div>
          ) : (
            /* Products Table */
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-950/80 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-800">
                  <tr>
                    <th scope="col" className="px-6 py-4 font-semibold">Product Name</th>
                    <th scope="col" className="px-6 py-4 font-semibold">Category</th>
                    <th scope="col" className="px-6 py-4 font-semibold">Price</th>
                    <th scope="col" className="px-6 py-4 font-semibold">Stock</th>
                    <th scope="col" className="px-6 py-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredProducts.map((prod) => (
                    <tr key={prod._id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-white">{prod.name}</div>
                        {prod.description && (
                          <div className="text-xs text-slate-400 truncate max-w-xs mt-0.5">
                            {prod.description}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700/60">
                          {prod.category || "general"}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono font-semibold text-emerald-400">
                        ${Number(prod.price).toFixed(2)}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            prod.stock > 10
                              ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800/60"
                              : prod.stock > 0
                              ? "bg-amber-950/80 text-amber-400 border border-amber-800/60"
                              : "bg-rose-950/80 text-rose-400 border border-rose-800/60"
                          }`}
                        >
                          {prod.stock > 0 ? `${prod.stock} in stock` : "Out of stock"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex items-center space-x-2">
                          <button
                            onClick={() => handleOpenEdit(prod)}
                            className="p-1.5 text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="Edit Product"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(prod._id)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="Delete Product"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Modal: Create / Edit Product with Dual Zod Validation */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Package className="w-5 h-5 text-indigo-400" />
                <span>{editingProduct ? "Edit Product" : "Create New Product"}</span>
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Product Name */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                  Product Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="e.g. Wireless Noise-Cancelling Headphones"
                  className={`w-full px-3.5 py-2.5 bg-slate-950 border rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:outline-none transition-colors ${
                    formErrors.name
                      ? "border-rose-500 focus:border-rose-500"
                      : "border-slate-800 focus:border-indigo-500"
                  }`}
                />
                {formErrors.name && (
                  <p className="text-xs text-rose-400 mt-1 flex items-center space-x-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{formErrors.name}</span>
                  </p>
                )}
              </div>

              {/* Price & Stock Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                    Price ($) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    name="price"
                    value={formData.price}
                    onChange={handleInputChange}
                    placeholder="99.99"
                    className={`w-full px-3.5 py-2.5 bg-slate-950 border rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:outline-none transition-colors ${
                      formErrors.price
                        ? "border-rose-500 focus:border-rose-500"
                        : "border-slate-800 focus:border-indigo-500"
                    }`}
                  />
                  {formErrors.price && (
                    <p className="text-xs text-rose-400 mt-1 flex items-center space-x-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{formErrors.price}</span>
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                    Stock Quantity <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    step="1"
                    name="stock"
                    value={formData.stock}
                    onChange={handleInputChange}
                    placeholder="50"
                    className={`w-full px-3.5 py-2.5 bg-slate-950 border rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:outline-none transition-colors ${
                      formErrors.stock
                        ? "border-rose-500 focus:border-rose-500"
                        : "border-slate-800 focus:border-indigo-500"
                    }`}
                  />
                  {formErrors.stock && (
                    <p className="text-xs text-rose-400 mt-1 flex items-center space-x-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{formErrors.stock}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                  Category <span className="text-rose-400">*</span>
                </label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleInputChange}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                {formErrors.category && (
                  <p className="text-xs text-rose-400 mt-1 flex items-center space-x-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{formErrors.category}</span>
                  </p>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  name="description"
                  rows="3"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="Optional product details, specifications, or notes..."
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                ></textarea>
                {formErrors.description && (
                  <p className="text-xs text-rose-400 mt-1 flex items-center space-x-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{formErrors.description}</span>
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center space-x-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-lg shadow-indigo-600/20 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {submitting && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>{editingProduct ? "Save Changes" : "Create Product"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="p-3 bg-rose-500/10 rounded-full border border-rose-500/20">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white">Delete Product</h3>
            </div>
            <p className="text-xs text-slate-300">
              Are you sure you want to delete this product? This action cannot be undone and will remove the item from the catalog.
            </p>
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                disabled={submitting}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold rounded-lg shadow-lg shadow-rose-600/20 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {submitting && <RefreshCw className="w-4 h-4 animate-spin" />}
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}