import React, { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import CartDrawer from "../components/CartDrawer";
import Navbar from "../components/Navbar";
import {
  useProductsQuery,
  useCreateProductMutation,
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
  Image as ImageIcon,
  Sparkles,
  ShoppingBag,
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
} from "lucide-react";

const LIMIT_OPTIONS = [6, 10, 20, 50];

export default function Products() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();
  const { addToCart, totalItems, setIsCartOpen } = useCart();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [addedItemEffect, setAddedItemEffect] = useState(null);

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
        message: "Product uploaded! TanStack cache invalidated & MySQL updated.",
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
      setIsModalOpen(false);
    },
    onError: (err) => {
      setFeedback({
        type: "error",
        message: err.message || "Product upload failed",
      });
    },
  });

  // 3. TanStack Mutation for Deleting Products
  const deleteMutation = useDeleteProductMutation({
    onSuccess: () => {
      setFeedback({
        type: "success",
        message: "Product removed & query cache synced.",
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
      message: "TanStack query cache invalidated! Fresh data fetched from MySQL.",
    });
  };

  // Handle image file selection & create local preview
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
      setPreviewUrl(URL.createObjectURL(file));
      setFeedback(null);
    }
  };

  // Clear selected file
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

  const handleInputChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // Quick fill sample data
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

  // Submit Product Form with Multer and TanStack Mutation
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Client validation with shared schema
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

  // Delete product with TanStack Mutation
  const handleDelete = (id, name) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return;
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
    <div className="min-h-screen bg-[#080C14] text-slate-100 font-sans pb-16 radial-mesh">
      <Navbar />

      <main className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 py-8 space-y-6 relative z-10">
        {/* Banner Feedback Notifications */}
        {feedback && (
          <div
            className={`p-4 rounded-2xl border text-xs flex items-center justify-between gap-3 shadow-xl backdrop-blur-xl animate-fade-in ${
              feedback.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                : "bg-rose-500/10 border-rose-500/20 text-rose-300"
            }`}
          >
            <div className="flex items-center gap-2.5">
              {feedback.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span className="font-semibold">{feedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Hero Header & Upload Action */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 sm:p-8 rounded-3xl bg-slate-900/60 border border-white/10 backdrop-blur-2xl shadow-2xl relative overflow-hidden">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>{isAdmin ? "Admin Inventory Management (MySQL + TanStack)" : "Live Product Catalog"}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-heading">
              {isAdmin ? "Product Management Catalog" : "Explore Products Catalog"}
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">
              {isAdmin
                ? "Live parameterized search, multi-field filtering, and Multer image uploads."
                : "Browse verified electronics, compute, audio and hardware with real-time stock levels."}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleInvalidateCache}
              disabled={isFetching}
              className="px-3.5 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-white/10 text-slate-200 text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
              title="Invalidates TanStack cache"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin text-indigo-400" : ""}`} />
              <span className="hidden sm:inline">Sync Cache</span>
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setFeedback(null);
                  setIsModalOpen(true);
                }}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold flex items-center gap-2 shadow-xl shadow-indigo-600/30 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Upload Product</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Bar */}
        <div className="p-5 rounded-3xl bg-slate-900/70 border border-white/10 shadow-2xl backdrop-blur-2xl space-y-4">
          {/* Category Chips Bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-xs font-bold text-slate-400 mr-1 shrink-0 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-indigo-400" />
              Categories:
            </span>
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleFilterChange(setSelectedCategory, cat.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  selectedCategory === cat.id
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "bg-slate-950/60 text-slate-400 hover:text-slate-200 border border-white/5 hover:border-white/10"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Search, Sort, and Price Range Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-3 border-t border-white/5">
            {/* Search Input */}
            <div className="md:col-span-5 relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => handleFilterChange(setSearchTerm, e.target.value)}
                placeholder="Search name, brand, SKU..."
                className="w-full pl-10 pr-9 py-2 bg-slate-950/70 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => handleFilterChange(setSearchTerm, "")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Sort Dropdown */}
            <div className="md:col-span-3 relative">
              <select
                value={selectedSort}
                onChange={(e) => handleFilterChange(setSelectedSort, e.target.value)}
                className="w-full px-3 py-2 bg-slate-950/70 border border-white/10 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition cursor-pointer appearance-none"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Price Range */}
            <div className="md:col-span-4 flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs">₹</span>
                <input
                  type="number"
                  value={minPrice}
                  onChange={(e) => handleFilterChange(setMinPrice, e.target.value)}
                  placeholder="Min ₹"
                  className="w-full pl-6 pr-2 py-2 bg-slate-950/70 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <span className="text-slate-500 text-xs">–</span>
              <div className="relative flex-1">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs">₹</span>
                <input
                  type="number"
                  value={maxPrice}
                  onChange={(e) => handleFilterChange(setMaxPrice, e.target.value)}
                  placeholder="Max ₹"
                  className="w-full pl-6 pr-2 py-2 bg-slate-950/70 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                  title="Clear All Filters"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Product Cards Gallery Grid */}
        {isLoading ? (
          <div className="py-24 flex flex-col items-center justify-center text-slate-400">
            <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-3" />
            <p className="text-xs font-mono">Loading products from MySQL...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="py-20 text-center border border-dashed border-white/10 rounded-3xl bg-slate-900/40 backdrop-blur-xl">
            <div className="w-14 h-14 rounded-2xl bg-slate-800/60 border border-white/5 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <Search className="w-6 h-6 text-slate-500" />
            </div>
            <h3 className="text-base font-bold text-white font-heading">No matching products found</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              No products match your current search and filter criteria. Try clearing filters or uploading a new product.
            </p>
            <div className="mt-5 flex gap-2.5 justify-center">
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl transition cursor-pointer"
                >
                  Clear Filters
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition cursor-pointer shadow-lg shadow-indigo-600/30"
              >
                Upload Product
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
              {products.map((product) => {
                const effectivePrice =
                  product.discount_price && Number(product.discount_price) > 0
                    ? Number(product.discount_price)
                    : Number(product.price);

                return (
                  <div
                    key={product.id}
                    className="p-3.5 rounded-3xl bg-slate-900/80 border border-white/10 hover:border-indigo-500/40 shadow-xl hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-300 flex flex-col justify-between group glass-card-hover"
                  >
                    <div>
                      {/* Product Image */}
                      <div className="relative h-48 w-full rounded-2xl bg-slate-950 overflow-hidden border border-white/5">
                        <img
                          src={getImageUrl(product.image_url)}
                          alt={product.name}
                          onError={(e) => {
                            e.target.src =
                              "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600&auto=format&fit=crop&q=80";
                          }}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                        />

                        {product.brand && (
                          <span className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-slate-950/80 backdrop-blur-md text-[10px] font-extrabold text-indigo-300 uppercase tracking-wider border border-white/10">
                            {product.brand}
                          </span>
                        )}

                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDelete(product.id, product.name)}
                            disabled={deleteMutation.isPending}
                            className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white backdrop-blur-md transition shadow cursor-pointer opacity-0 group-hover:opacity-100"
                            title="Delete Product (Admin Only)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Info & Details */}
                      <div className="mt-3.5 space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span className="font-mono text-[10px] text-slate-500">ID #{product.id}</span>
                          {product.sku && (
                            <span className="font-mono text-[10px] bg-slate-950 px-2 py-0.5 rounded-md border border-white/5 text-slate-400">
                              {product.sku}
                            </span>
                          )}
                        </div>

                        <h3 className="font-bold text-sm text-white line-clamp-1 group-hover:text-indigo-300 transition">
                          {product.name}
                        </h3>

                        {/* Price & Stock Status */}
                        <div className="flex items-center justify-between pt-2 border-t border-white/5">
                          <div>
                            <div className="text-base font-extrabold text-emerald-400 font-mono">
                              ₹{effectivePrice.toFixed(2)}
                            </div>
                            {product.discount_price && (
                              <div className="text-[10px] text-slate-500 line-through font-mono">
                                ₹{Number(product.price).toFixed(2)}
                              </div>
                            )}
                          </div>

                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              product.stock > 0
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                : "bg-rose-500/10 border-rose-500/20 text-rose-400"
                            }`}
                          >
                            {product.stock > 0 ? `${product.stock} In Stock` : "Out of Stock"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-3 mt-3 border-t border-white/5 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={product.stock <= 0}
                        onClick={() => {
                          addToCart(product, 1);
                          setAddedItemEffect(product.id);
                          setTimeout(() => setAddedItemEffect(null), 1200);
                        }}
                        className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer border ${
                          product.stock <= 0
                            ? "bg-slate-950 border-white/5 text-slate-600 cursor-not-allowed"
                            : addedItemEffect === product.id
                            ? "bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-600/30"
                            : "bg-slate-800/80 hover:bg-slate-700 border-white/10 text-slate-200"
                        }`}
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>{addedItemEffect === product.id ? "Added!" : "Add Cart"}</span>
                      </button>

                      <button
                        type="button"
                        disabled={product.stock <= 0}
                        onClick={() => {
                          addToCart(product, 1);
                          setIsCartOpen(true);
                        }}
                        className="py-2 px-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold shadow-md shadow-indigo-600/20 flex items-center justify-center gap-1 transition cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Buy Now</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            <div className="p-4 rounded-3xl bg-slate-900/80 border border-white/10 shadow-2xl backdrop-blur-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
              {/* Left Record Indicator */}
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span>Per page:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2.5 py-1.5 bg-slate-950 border border-white/10 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  {LIMIT_OPTIONS.map((lim) => (
                    <option key={lim} value={lim}>
                      {lim}
                    </option>
                  ))}
                </select>
                <span className="text-slate-500">
                  (Showing {startRecord}–{endRecord} of {pagination.total})
                </span>
              </div>

              {/* Right Navigation */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="p-2 rounded-xl bg-slate-950 border border-white/10 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 transition"
                  title="First Page"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={!pagination.hasPrevPage && currentPage <= 1}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-950 border border-white/10 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-bold text-slate-300 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Prev</span>
                </button>

                {Array.from({ length: pagination.totalPages || 1 }, (_, i) => i + 1)
                  .filter((pNo) => pNo === 1 || pNo === pagination.totalPages || Math.abs(pNo - currentPage) <= 1)
                  .map((pNo) => (
                    <button
                      key={pNo}
                      type="button"
                      onClick={() => setCurrentPage(pNo)}
                      className={`w-8 h-8 rounded-xl text-xs font-extrabold transition ${
                        currentPage === pNo
                          ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                          : "bg-slate-950 text-slate-400 hover:bg-slate-800 border border-white/5"
                      }`}
                    >
                      {pNo}
                    </button>
                  ))}

                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(pagination.totalPages, prev + 1))}
                  disabled={!pagination.hasNextPage && currentPage >= pagination.totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-950 border border-white/10 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-bold text-slate-300 transition"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentPage(pagination.totalPages)}
                  disabled={currentPage === pagination.totalPages || pagination.totalPages <= 1}
                  className="p-2 rounded-xl bg-slate-950 border border-white/10 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 transition"
                  title="Last Page"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Upload Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative my-8 backdrop-blur-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Upload className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white font-heading">Upload New Product</h3>
                  <p className="text-[11px] text-slate-400">Multer Storage + MySQL + TanStack Sync</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSampleFill}
                  className="px-2.5 py-1 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-[11px] font-semibold hover:bg-indigo-600/30 transition cursor-pointer flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Auto-fill</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    handleClearFile();
                  }}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Image Upload Area with Live Preview */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Product Image <span className="text-rose-400">*</span>
                </label>

                {previewUrl ? (
                  <div className="relative rounded-2xl border border-white/10 overflow-hidden bg-slate-950 group">
                    <img
                      src={previewUrl}
                      alt="Upload Preview"
                      className="w-full h-44 object-cover"
                    />
                    <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2 backdrop-blur-sm">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow"
                      >
                        Change Image
                      </button>
                      <button
                        type="button"
                        onClick={handleClearFile}
                        className="px-3 py-1.5 bg-rose-600 text-white rounded-xl text-xs font-bold shadow"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-2xl p-6 text-center cursor-pointer transition bg-slate-950/40 hover:bg-slate-950/80"
                  >
                    <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center mx-auto mb-2 text-slate-400">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-semibold text-slate-200">
                      Click to choose product image
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      JPG, PNG, or WEBP up to 5MB
                    </p>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* Product Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Product Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="e.g. Gaming Laptop RTX 4070"
                  required
                  className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Brand & Category */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Brand
                  </label>
                  <input
                    type="text"
                    name="brand"
                    value={formData.brand}
                    onChange={handleInputChange}
                    placeholder="e.g. ASUS, Apple"
                    className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    name="category_id"
                    value={formData.category_id}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="1">Laptops & Computers</option>
                    <option value="2">Smartphones & Tablets</option>
                    <option value="3">Audio & Headphones</option>
                    <option value="4">Accessories & Peripherals</option>
                  </select>
                </div>
              </div>

              {/* Price & Discount Price */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Price (₹) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    name="price"
                    value={formData.price}
                    onChange={handleInputChange}
                    placeholder="50000"
                    required
                    className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Discount Price (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    name="discount_price"
                    value={formData.discount_price}
                    onChange={handleInputChange}
                    placeholder="45000"
                    className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Stock & SKU */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Stock Inventory
                  </label>
                  <input
                    type="number"
                    name="stock"
                    value={formData.stock}
                    onChange={handleInputChange}
                    placeholder="10"
                    className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    SKU Code
                  </label>
                  <input
                    type="text"
                    name="sku"
                    value={formData.sku}
                    onChange={handleInputChange}
                    placeholder="LAP001"
                    className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 border-t border-white/10 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    handleClearFile();
                  }}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition flex items-center gap-2 shadow-lg shadow-indigo-600/30 cursor-pointer"
                >
                  {createMutation.isPending ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Uploading to MySQL...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Save & Upload</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Slide-out Cart Drawer with Live ACID Transaction Inspector */}
      <CartDrawer />
    </div>
  );
}
