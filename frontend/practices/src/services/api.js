const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

/**
 * Custom API Error containing status code and error details.
 */
export class ApiError extends Error {
  constructor(message, status, details = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

/**
 * Universal request wrapper with unified error extraction.
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 204) {
      return null;
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMessage =
        data?.message ||
        data?.error?.message ||
        `Request failed with status ${response.status} (${response.statusText})`;
      
      const errorDetails = data?.errors || data?.error?.details || null;

      throw new ApiError(errorMessage, response.status, errorDetails);
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    // Network / offline error
    throw new ApiError(
      error.message || "Network error. Please check your backend connection.",
      0
    );
  }
}

export const checkApi = async () => {
  return apiRequest("/health");
};

export const fetchProducts = async (params = {}) => {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.append("search", params.search);
  if (params.category) searchParams.append("category", params.category);
  if (params.sort) searchParams.append("sort", params.sort);
  if (params.page) searchParams.append("page", params.page);
  if (params.limit) searchParams.append("limit", params.limit);

  const query = searchParams.toString() ? `?${searchParams.toString()}` : "";
  return apiRequest(`/products${query}`);
};

export const fetchProductById = async (id) => {
  return apiRequest(`/products/${id}`);
};

export const createProduct = async (productData) => {
  return apiRequest("/products", {
    method: "POST",
    body: JSON.stringify(productData),
  });
};

export const updateProduct = async (id, productData) => {
  return apiRequest(`/products/${id}`, {
    method: "PUT",
    body: JSON.stringify(productData),
  });
};

export const deleteProduct = async (id) => {
  return apiRequest(`/products/${id}`, {
    method: "DELETE",
  });
};