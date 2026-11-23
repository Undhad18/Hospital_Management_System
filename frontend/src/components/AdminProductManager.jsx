import React, { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import {
  useProductsQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
  useDeleteProductMutation,
  QUERY_KEYS,
} from "../hooks/useProductsQuery";
import { getImageUrl } from "../utils/imageUrl";
import {
  CATEGORIES,
  SORT_OPTIONS,
  validateProductInput,
} from "@shared";
import {
  Upload,
  Plus,
  Trash2,
  Edit3,
  Image as ImageIcon,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  X,
  Search,
  RefreshCw,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Database,
  Zap,
  SlidersHorizontal,
  Package,
  Layers,
  ArrowUpDown,
  Tag,
  Check,
  RotateCw,
  Shield,
  Sliders,
} from "lucide-react";

const LIMIT_OPTIONS = [6, 10, 20, 50];

export default function AdminProductManager() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();

  // Create Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  
  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  const [feedback, setFeedback] = useState(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [selectedSort, setSelectedSort] = useState("newest");

  // Create Form State
  const [formData, setFormData] = useState({
    name: "",
    brand: "",
    category_id: "1",
    price: "",
    discount_price: "",
    stock: "10",
    sku: "",
    status: "1",
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileInputRef = useRef(null);

  // Edit Form State
  const [editFormData, setEditFormData] = useState({
    name: "",
    brand: "",
    category_id: "1",
    price: "",
    discount_price: "",
    stock: "10",
    sku: "",
    status: "1",
  });
  const [editSelectedFile, setEditSelectedFile] = useState(null);
  const [editPreviewUrl, setEditPreviewUrl] = useState(null);
  const editFileInputRef = useRef(null);

  // 1. TanStack Query for Paginated / Filtered Products
  const queryParams = {
    search: searchTerm.trim() || undefined,
    category_id: selectedCategory !== "all" ? selectedCategory : undefined,
    minPrice: minPrice !== "" ? minPrice : undefined,
    maxPrice: maxPrice !== "" ? maxPrice : undefined,
    sort: selectedSort,
    page: currentPage,
    limit: itemsPerPage,
  };

  const {
    data: queryResult,
    isLoading,
    isFetching,
    error: queryError,
    refetch,
  } = useProductsQuery(queryParams);

  const products = queryResult?.data || [];
  const pagination = queryResult?.pagination || {
    total: 0,
    page: currentPage,
    limit: itemsPerPage,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  };

  // 2. TanStack Mutation for Creating Products
  const createMutation = useCreateProductMutation({
    onSuccess: () => {
      setFeedback({
        type: "success",
        message: "Product created successfully! TanStack cache synced with MySQL.",
      });
      setFormData({
        name: "",
        brand: "",
        category_id: "1",
        price: "",
        discount_price: "",
        stock: "10",
        sku: "",
        status: "1",
      });
      handleClearFile();
      setIsCreateModalOpen(false);
    },
    onError: (err) => {
      setFeedback({
        type: "error",
        message: err.message || "Failed to create product",
      });
    },
  });

  // 3. TanStack Mutation for Updating Products
  const updateMutation = useUpdateProductMutation({
    onSuccess: () => {
      setFeedback({
        type: "success",
        message: "Product updated successfully! MySQL & TanStack cache synced.",
      });
      setIsEditModalOpen(false);
      setEditingProduct(null);
      handleClearEditFile();
    },
    onError: (err) => {
      setFeedback({
        type: "error",
        message: err.message || "Failed to update product",
      });
    },
  });

  // 4. TanStack Mutation for Deleting Products
  const deleteMutation = useDeleteProductMutation({
    onSuccess: () => {
      setFeedback({
        type: "success",
        message: "Product deleted from database & inventory synced.",
      });
    },
    onError: (err) => {
      setFeedback({
        type: "error",
        message: err.message || "Failed to delete product.",
      });
    },
  });

  // Reset to page 1 whenever search or filters change
  const handleFilterChange = (setter, value) => {
    setter(value);
    setCurrentPage(1);
  };

  // Handle manual cache invalidation
  const handleInvalidateCache = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.allProducts });
    setFeedback({
      type: "success",
      message: "TanStack cache refreshed! Fresh data retrieved from MySQL.",
    });
  };

  // Handle image file selection for Create
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        setFeedback({
          type: "error",
          message: "Please select an image file (JPG, PNG, or WEBP).",
        });
        return;
      }
      setSelectedFile(file);
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
    }
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Handle image file selection for Edit
  const handleEditFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        setFeedback({
          type: "error",
          message: "Please select an image file (JPG, PNG, or WEBP).",
        });
        return;
      }
      setEditSelectedFile(file);
      const objectUrl = URL.createObjectURL(file);
      setEditPreviewUrl(objectUrl);
    }
  };

  const handleClearEditFile = () => {
    setEditSelectedFile(null);
    if (editPreviewUrl) {
      URL.revokeObjectURL(editPreviewUrl);
      setEditPreviewUrl(null);
    }
    if (editFileInputRef.current) {
      editFileInputRef.current.value = "";
    }
  };

  const handleInputChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleEditInputChange = (e) => {
    setEditFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // Open Edit Modal with Pre-filled Product Data
  const handleOpenEditModal = (product) => {
    setEditingProduct(product);
    setEditFormData({
      name: product.name || "",
      brand: product.brand || "",
      category_id: String(product.category_id || "1"),
      price: String(product.price || ""),
      discount_price: product.discount_price !== null && product.discount_price !== undefined ? String(product.discount_price) : "",
      stock: String(product.stock !== undefined ? product.stock : "10"),
      sku: product.sku || "",
      status: String(product.status !== undefined ? product.status : "1"),
    });
    setEditSelectedFile(null);
    setEditPreviewUrl(product.image_url ? getImageUrl(product.image_url) : null);
    setIsEditModalOpen(true);
  };

  // Quick fill sample data for creation
  const handleSampleFill = () => {
    const randNum = Math.floor(100 + Math.random() * 900);
    setFormData({
      name: `Gaming Laptop ROG Strix ${randNum}`,
      brand: "ASUS",
      category_id: "1",
      price: "50000",
      discount_price: "45000",
      stock: "10",
      sku: `LAP00${randNum % 10}`,
      status: "1",
    });
  };

  // Submit Create Product
  const handleCreateSubmit = async (e) => {
    e.preventDefault();

    const validation = validateProductInput(formData);
    if (!validation.isValid) {
      setFeedback({
        type: "error",
        message: validation.errors[0]?.message || "Please fix validation errors.",
      });
      return;
    }

    if (!selectedFile) {
      setFeedback({
        type: "error",
        message: "Please choose an image file for the product",
      });
      return;
    }

    setFeedback(null);

    const data = new FormData();
    data.append("name", formData.name);
    data.append("brand", formData.brand);
    data.append("category_id", formData.category_id);
    data.append("price", formData.price);
    if (formData.discount_price) {
      data.append("discount_price", formData.discount_price);
    }
    data.append("stock", formData.stock);
    data.append("sku", formData.sku);
    data.append("status", formData.status);
    data.append("image", selectedFile);

    createMutation.mutate(data);
  };

  // Submit Edit Product
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingProduct) return;

    const validation = validateProductInput(editFormData);
    if (!validation.isValid) {
      setFeedback({
        type: "error",
        message: validation.errors[0]?.message || "Please fix validation errors.",
      });
      return;
    }

    setFeedback(null);

    const data = new FormData();
    data.append("name", editFormData.name);
    data.append("brand", editFormData.brand);
    data.append("category_id", editFormData.category_id);
    data.append("price", editFormData.price);
    if (editFormData.discount_price !== undefined) {
      data.append("discount_price", editFormData.discount_price);
    }
    data.append("stock", editFormData.stock);
    data.append("sku", editFormData.sku);
    data.append("status", editFormData.status);

    if (editSelectedFile) {
      data.append("image", editSelectedFile);
    }

    updateMutation.mutate({
      id: editingProduct.id,
      formData: data,
    });
  };

  // Delete product with TanStack Mutation
  const handleDelete = (id, name) => {
    if (!window.confirm(`Are you sure you want to delete product "${name}" (ID #${id})?`)) return;
    deleteMutation.mutate(id);
  };

  // Reset all filters
  const handleResetFilters = () => {
    setSearchTerm("");
    setSelectedCategory("all");
    setMinPrice("");
    setMaxPrice("");
    setSelectedSort("newest");
    setCurrentPage(1);
  };

  const hasActiveFilters =
    searchTerm !== "" ||
    selectedCategory !== "all" ||
    minPrice !== "" ||
    maxPrice !== "" ||
    selectedSort !== "newest";

  const startRecord = pagination.total === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endRecord = Math.min(currentPage * itemsPerPage, pagination.total);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Banner Feedback Notifications */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-xs flex items-center justify-between gap-3 shadow-xl backdrop-blur-xl animate-fadeIn ${
            feedback.type === "success"
              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/15 border-rose-500/30 text-rose-300"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Hero Banner */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-indigo-950/80 via-slate-900/90 to-purple-950/80 border border-white/10 p-6 sm:p-8 shadow-2xl backdrop-blur-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-semibold">
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              <span>Admin Inventory Control Hub &bull; Full CRUD Operations</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Product Management Catalog
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
              Create, update, and manage catalog items, adjust stock thresholds, and upload multimedia assets. (Admins manage inventory; customers checkout).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleInvalidateCache}
              disabled={isFetching}
              className="px-4 py-2.5 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-white/10 text-slate-200 text-xs font-semibold flex items-center gap-2 transition cursor-pointer shadow-lg"
              title="Invalidate TanStack Cache"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${isFetching ? "animate-spin" : ""}`} />
              <span>Sync Cache</span>
            </button>

            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Product</span>
            </button>
          </div>
        </div>
      </div>

      {/* Category Filter Pills Bar */}
      <div className="p-4 rounded-3xl bg-slate-900/80 border border-white/10 shadow-xl backdrop-blur-xl flex items-center gap-2 overflow-x-auto pb-3 sm:pb-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mr-2 flex-shrink-0">
          <Tag className="w-3.5 h-3.5 text-indigo-400" />
          <span>Categories:</span>
        </div>
        {CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => handleFilterChange(setSelectedCategory, cat.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition cursor-pointer border ${
                isSelected
                  ? "bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30 font-bold"
                  : "bg-slate-950/80 text-slate-400 hover:text-slate-200 border-white/5 hover:border-white/15"
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Search, Sort, Price Filters Bar */}
      <div className="p-4 rounded-3xl bg-slate-900/80 border border-white/10 shadow-xl backdrop-blur-xl space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          {/* Search Input (6 cols) */}
          <div className="sm:col-span-6 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search name, brand, SKU..."
              value={searchTerm}
              onChange={(e) => handleFilterChange(setSearchTerm, e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-2xl bg-slate-950 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          {/* Sort Selector (3 cols) */}
          <div className="sm:col-span-3 relative">
            <select
              value={selectedSort}
              onChange={(e) => handleFilterChange(setSelectedSort, e.target.value)}
              className="w-full px-3 py-2 rounded-2xl bg-slate-950 border border-white/10 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 transition cursor-pointer appearance-none"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-slate-900 text-white">
                  {opt.label}
                </option>
              ))}
            </select>
            <ArrowUpDown className="w-3.5 h-3.5 absolute right-3.5 top-3 text-slate-500 pointer-events-none" />
          </div>

          {/* Min & Max Price (3 cols) */}
          <div className="sm:col-span-3 flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="number"
                placeholder="₹ Min"
                value={minPrice}
                onChange={(e) => handleFilterChange(setMinPrice, e.target.value)}
                className="w-full px-3 py-2 rounded-2xl bg-slate-950 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
            <span className="text-slate-600 font-bold">-</span>
            <div className="relative flex-1">
              <input
                type="number"
                placeholder="₹ Max"
                value={maxPrice}
                onChange={(e) => handleFilterChange(setMaxPrice, e.target.value)}
                className="w-full px-3 py-2 rounded-2xl bg-slate-950 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
          </div>
        </div>

        {/* Results summary and Reset */}
        <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-white/5">
          <div className="flex items-center gap-2">
            <span>
              Showing <strong className="text-white">{startRecord}</strong> - <strong className="text-white">{endRecord}</strong> of <strong className="text-indigo-400">{pagination.total}</strong> products
            </span>
            {isFetching && (
              <span className="flex items-center gap-1 text-[11px] text-indigo-400 font-mono">
                <RotateCw className="w-3 h-3 animate-spin" />
                Syncing...
              </span>
            )}
          </div>

          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="text-indigo-400 hover:text-indigo-300 font-medium cursor-pointer flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Products Grid (ADMIN VIEW: Edit, Delete, Update) */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="h-80 rounded-3xl bg-slate-900/60 border border-white/5 animate-pulse p-4 space-y-3"
            >
              <div className="h-44 bg-slate-800/80 rounded-2xl" />
              <div className="h-4 bg-slate-800 rounded w-3/4" />
              <div className="h-4 bg-slate-800 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-20 bg-slate-900/60 border border-white/10 rounded-3xl">
          <Package className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white">No products found</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            {hasActiveFilters
              ? "Try adjusting your search query, price ranges, or category filters."
              : "No inventory records in database. Click 'Create New Product' to add one."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {products.map((product) => {
            const hasDiscount =
              product.discount_price !== null &&
              product.discount_price !== undefined &&
              !isNaN(Number(product.discount_price)) &&
              Number(product.discount_price) > 0;

            const effectivePrice = hasDiscount ? Number(product.discount_price) : Number(product.price);
            const originalPrice = Number(product.price);

            return (
              <div
                key={product.id}
                className="group relative rounded-3xl bg-slate-900/80 border border-white/10 hover:border-indigo-500/40 p-4 flex flex-col justify-between transition-all duration-300 shadow-xl backdrop-blur-xl hover:shadow-2xl hover:shadow-indigo-500/10 overflow-hidden"
              >
                {/* Top Image & Badges */}
                <div className="space-y-3">
                  <div className="relative h-44 rounded-2xl overflow-hidden bg-slate-950/80 border border-white/5">
                    {product.image_url ? (
                      <img
                        src={getImageUrl(product.image_url)}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                        onError={(e) => {
                          e.target.style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600">
                        <ImageIcon className="w-10 h-10" />
                      </div>
                    )}

                    {/* Brand Badge */}
                    <span className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-xl bg-slate-950/80 backdrop-blur-md border border-white/15 text-[10px] font-bold text-white uppercase tracking-wider">
                      {product.brand || "GENERIC"}
                    </span>

                    {/* Stock status badge */}
                    <span
                      className={`absolute top-2.5 right-2.5 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold ${
                        product.stock > 0
                          ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-300"
                          : "bg-rose-500/20 border border-rose-500/30 text-rose-300"
                      }`}
                    >
                      {product.stock > 0 ? `${product.stock} in stock` : "Out of Stock"}
                    </span>
                  </div>

                  {/* Product Details */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span>ID #{product.id}</span>
                      <span>{product.sku || `SKU-${product.id}`}</span>
                    </div>
                    <h3 className="text-sm font-bold text-white group-hover:text-indigo-300 transition line-clamp-1">
                      {product.name}
                    </h3>
                  </div>
                </div>

                {/* Price & ADMIN ONLY Actions (Edit & Delete - No Add to Cart for Admin) */}
                <div className="pt-3 border-t border-white/5 space-y-3 mt-3">
                  <div className="flex items-baseline justify-between">
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-black text-emerald-400 font-mono">
                        ₹{effectivePrice.toFixed(2)}
                      </span>
                      {hasDiscount && (
                        <span className="text-xs text-slate-500 line-through font-mono">
                          ₹{originalPrice.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Admin CRUD Action Buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenEditModal(product)}
                      className="flex-1 py-2.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 hover:text-white text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-md"
                      title="Edit / Update product properties"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Update Item</span>
                    </button>

                    <button
                      onClick={() => handleDelete(product.id, product.name)}
                      className="p-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 hover:text-rose-300 transition cursor-pointer"
                      title="Delete Product from database"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Bar */}
      {pagination.totalPages > 1 && (
        <div className="p-4 rounded-3xl bg-slate-900/80 border border-white/10 shadow-xl backdrop-blur-xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>Items per page:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2 py-1 rounded-xl bg-slate-950 border border-white/10 text-xs text-white focus:outline-none cursor-pointer"
            >
              {LIMIT_OPTIONS.map((limit) => (
                <option key={limit} value={limit}>
                  {limit}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={!pagination.hasPrevPage}
              className="p-2 rounded-xl bg-slate-950 border border-white/5 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
              title="First Page"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={!pagination.hasPrevPage}
              className="p-2 rounded-xl bg-slate-950 border border-white/5 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="px-3 py-1.5 text-xs font-mono font-bold text-slate-300">
              Page {pagination.page} of {pagination.totalPages}
            </span>

            <button
              onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={!pagination.hasNextPage}
              className="p-2 rounded-xl bg-slate-950 border border-white/5 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage(pagination.totalPages)}
              disabled={!pagination.hasNextPage}
              className="p-2 rounded-xl bg-slate-950 border border-white/5 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
              title="Last Page"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* CREATE PRODUCT MODAL                                      */}
      {/* ========================================================= */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[9999] overflow-hidden flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-white/15 rounded-3xl max-w-xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-white/10 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Upload className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Upload New Product</h3>
                  <p className="text-[11px] text-slate-400">Multipart Multer & MySQL Persistence</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSampleFill}
                  className="px-2.5 py-1 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-mono font-medium transition cursor-pointer flex items-center gap-1"
                  title="Auto-fill with random mock values"
                >
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  Auto-Fill
                </button>
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <form onSubmit={handleCreateSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {/* Image Uploader Box */}
              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">Product Image *</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition ${
                    previewUrl
                      ? "border-emerald-500/50 bg-emerald-950/20"
                      : "border-white/15 hover:border-indigo-500/50 bg-slate-950/60"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png, image/jpeg, image/webp"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {previewUrl ? (
                    <div className="flex items-center justify-center gap-4">
                      <img
                        src={previewUrl}
                        alt="Preview"
                        className="w-16 h-16 rounded-xl object-cover border border-white/20"
                      />
                      <div className="text-left">
                        <p className="text-emerald-400 font-bold">{selectedFile?.name}</p>
                        <p className="text-[10px] text-slate-400">
                          {(selectedFile?.size / 1024).toFixed(1)} KB &bull; Click to replace
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1 py-2">
                      <Upload className="w-6 h-6 text-indigo-400 mx-auto" />
                      <p className="font-semibold text-slate-300">Click or drag image here</p>
                      <p className="text-[10px] text-slate-500">Supports PNG, JPG, WEBP up to 5MB</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Product Name */}
              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Product Name *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="e.g. Gaming Laptop ROG Strix"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Brand */}
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Brand</label>
                  <input
                    type="text"
                    name="brand"
                    value={formData.brand}
                    onChange={handleInputChange}
                    placeholder="e.g. ASUS"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Category */}
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Category</label>
                  <select
                    name="category_id"
                    value={formData.category_id}
                    onChange={handleInputChange}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-white/10 text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    {CATEGORIES.filter((c) => c.id !== "all").map((cat) => (
                      <option key={cat.id} value={cat.id} className="bg-slate-900">
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Regular Price */}
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Price (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    name="price"
                    value={formData.price}
                    onChange={handleInputChange}
                    placeholder="50000.00"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>

                {/* Discount Price */}
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Discount Price (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    name="discount_price"
                    value={formData.discount_price}
                    onChange={handleInputChange}
                    placeholder="45000.00 (Optional)"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Stock Quantity */}
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Stock Quantity</label>
                  <input
                    type="number"
                    name="stock"
                    value={formData.stock}
                    onChange={handleInputChange}
                    placeholder="10"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* SKU */}
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">SKU Code</label>
                  <input
                    type="text"
                    name="sku"
                    value={formData.sku}
                    onChange={handleInputChange}
                    placeholder="LAP001"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold transition cursor-pointer shadow-lg shadow-indigo-600/30 flex items-center gap-2"
                >
                  {createMutation.isPending ? (
                    <>
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Save Product</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* EDIT / UPDATE PRODUCT MODAL                               */}
      {/* ========================================================= */}
      {isEditModalOpen && editingProduct && (
        <div className="fixed inset-0 z-[9999] overflow-hidden flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-white/15 rounded-3xl max-w-xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-white/10 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Update Product <span className="font-mono text-indigo-400">#{editingProduct.id}</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">Modify properties, prices, or replace image</p>
                </div>
              </div>

              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingProduct(null);
                }}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {/* Image Uploader Box */}
              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">Product Image</label>
                <div
                  onClick={() => editFileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition ${
                    editPreviewUrl
                      ? "border-indigo-500/50 bg-indigo-950/20"
                      : "border-white/15 hover:border-indigo-500/50 bg-slate-950/60"
                  }`}
                >
                  <input
                    ref={editFileInputRef}
                    type="file"
                    accept="image/png, image/jpeg, image/webp"
                    onChange={handleEditFileChange}
                    className="hidden"
                  />
                  {editPreviewUrl ? (
                    <div className="flex items-center justify-center gap-4">
                      <img
                        src={editPreviewUrl}
                        alt="Preview"
                        className="w-16 h-16 rounded-xl object-cover border border-white/20"
                      />
                      <div className="text-left">
                        <p className="text-indigo-300 font-bold">
                          {editSelectedFile ? editSelectedFile.name : "Current Image"}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          Click to choose a replacement image
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1 py-2">
                      <Upload className="w-6 h-6 text-indigo-400 mx-auto" />
                      <p className="font-semibold text-slate-300">Click to upload new image</p>
                      <p className="text-[10px] text-slate-500">PNG, JPG, WEBP up to 5MB</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Product Name */}
              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Product Name *</label>
                <input
                  type="text"
                  name="name"
                  value={editFormData.name}
                  onChange={handleEditInputChange}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Brand */}
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Brand</label>
                  <input
                    type="text"
                    name="brand"
                    value={editFormData.brand}
                    onChange={handleEditInputChange}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Category */}
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Category</label>
                  <select
                    name="category_id"
                    value={editFormData.category_id}
                    onChange={handleEditInputChange}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-white/10 text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    {CATEGORIES.filter((c) => c.id !== "all").map((cat) => (
                      <option key={cat.id} value={cat.id} className="bg-slate-900">
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Regular Price */}
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Price (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    name="price"
                    value={editFormData.price}
                    onChange={handleEditInputChange}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>

                {/* Discount Price */}
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Discount Price (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    name="discount_price"
                    value={editFormData.discount_price}
                    onChange={handleEditInputChange}
                    placeholder="Optional"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Stock Quantity */}
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Stock Quantity</label>
                  <input
                    type="number"
                    name="stock"
                    value={editFormData.stock}
                    onChange={handleEditInputChange}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* SKU */}
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">SKU Code</label>
                  <input
                    type="text"
                    name="sku"
                    value={editFormData.sku}
                    onChange={handleEditInputChange}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingProduct(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold transition cursor-pointer shadow-lg shadow-indigo-600/30 flex items-center gap-2"
                >
                  {updateMutation.isPending ? (
                    <>
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Updating...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Update Product</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
