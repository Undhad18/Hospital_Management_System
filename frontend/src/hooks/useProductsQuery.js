import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  getProducts,
  createProductWithImage,
  updateProduct,
  deleteProduct,
} from "../services/productService";
import { checkout, getMyOrders } from "../services/orderService";

// Query Keys Constants
export const QUERY_KEYS = {
  products: (params) => ["products", params],
  allProducts: ["products"],
  orders: ["orders"],
  dashboard: ["dashboard-data"],
};

/**
 * Hook to Fetch Paginated, Filtered & Sorted Products with TanStack Cache
 * @param {Object} params - { page, limit, search, category_id, minPrice, maxPrice, sort }
 */
export const useProductsQuery = (params) => {
  return useQuery({
    queryKey: QUERY_KEYS.products(params),
    queryFn: async () => {
      const result = await getProducts(params);
      if (!result.success) {
        throw new Error(result.message || "Failed to fetch products from API");
      }
      return result;
    },
    placeholderData: keepPreviousData, // Smooth page navigation without layout flicker
    staleTime: 1000 * 30, // 30 seconds
  });
};

/**
 * Hook to Create a New Product (with Image Upload) and Invalidate Product Cache
 */
export const useCreateProductMutation = (options = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData) => {
      const result = await createProductWithImage(formData);
      if (!result.success) {
        throw new Error(result.message || "Failed to create product");
      }
      return result;
    },
    onSuccess: (data, variables, context) => {
      // Automatically Invalidate & Refetch all product list queries
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.allProducts });
      if (options.onSuccess) {
        options.onSuccess(data, variables, context);
      }
    },
    onError: (error, variables, context) => {
      if (options.onError) {
        options.onError(error, variables, context);
      }
    },
  });
};

/**
 * Hook to Update a Product and Invalidate Product Cache
 */
export const useUpdateProductMutation = (options = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, formData }) => {
      const result = await updateProduct(id, formData);
      if (!result.success) {
        throw new Error(result.message || "Failed to update product");
      }
      return result;
    },
    onSuccess: (data, variables, context) => {
      // Automatically Invalidate & Refetch all product list queries
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.allProducts });
      if (options.onSuccess) {
        options.onSuccess(data, variables, context);
      }
    },
    onError: (error, variables, context) => {
      if (options.onError) {
        options.onError(error, variables, context);
      }
    },
  });
};

/**
 * Hook to Delete a Product and Invalidate Product Cache
 */
export const useDeleteProductMutation = (options = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (productId) => {
      const result = await deleteProduct(productId);
      if (!result.success) {
        throw new Error(result.message || "Failed to delete product");
      }
      return result;
    },
    onSuccess: (data, variables, context) => {
      // Invalidate and refresh cache
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.allProducts });
      if (options.onSuccess) {
        options.onSuccess(data, variables, context);
      }
    },
    onError: (error, variables, context) => {
      if (options.onError) {
        options.onError(error, variables, context);
      }
    },
  });
};

/**
 * Hook to Execute ACID Checkout Transaction and Sync Stock Across Queries
 */
export const useCheckoutMutation = (options = {}) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (checkoutPayload) => {
      const result = await checkout(checkoutPayload);
      if (!result.success) {
        const err = new Error(result.message || "Checkout transaction failed");
        err.transactionLogs = result.transactionLogs || [];
        throw err;
      }
      return result;
    },
    onSuccess: (data, variables, context) => {
      // Invalidate products query cache so stock decreases are immediately visible
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.allProducts });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.orders });
      if (options.onSuccess) {
        options.onSuccess(data, variables, context);
      }
    },
    onError: (error, variables, context) => {
      if (options.onError) {
        options.onError(error, variables, context);
      }
    },
  });
};

/**
 * Hook to Fetch Authenticated User Orders
 */
export const useOrdersQuery = () => {
  return useQuery({
    queryKey: QUERY_KEYS.orders,
    queryFn: async () => {
      const result = await getMyOrders();
      if (!result.success) {
        throw new Error(result.message || "Failed to fetch orders");
      }
      return result.data || [];
    },
    staleTime: 1000 * 20,
  });
};
