/**
 * AUTO-GENERATED API CLIENT
 * Generated from OpenAPI Specification v1.0.0
 * Do not manually edit. Run 'npm run generate:api' to regenerate.
 */

const DEFAULT_BASE_URL = "http://localhost:5000";

/**
 * Base HTTP Client for OpenAPI Operations
 */
class ApiClient {
  constructor(baseURL = DEFAULT_BASE_URL) {
    this.baseURL = baseURL;
  }

  getAuthToken() {
    try {
      return localStorage.getItem("mern_auth_token");
    } catch {
      return null;
    }
  }

  async request(endpoint, options = {}) {
    const token = this.getAuthToken();
    const headers = {
      ...options.headers,
    };

    if (token && !headers["Authorization"]) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const config = {
      ...options,
      headers,
      credentials: "include",
    };

    const url = `${this.baseURL}${endpoint}`;
    const response = await fetch(url, config);

    let data;
    try {
      data = await response.json();
    } catch {
      data = { success: response.ok, status: response.status };
    }

    if (!response.ok) {
      const error = new Error(data.message || `API request failed with status ${response.status}`);
      error.status = response.status;
      error.data = data;
      error.transactionLogs = data.transactionLogs;
      throw error;
    }

    return data;
  }
}

export const apiClient = new ApiClient();

// ==========================================
// Authentication API
// ==========================================
export const authApi = {
  /**
   * Register a new user
   * @param {Object} data - { name, email, password, role }
   */
  async register(data) {
    return apiClient.request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  /**
   * Authenticate user credentials
   * @param {Object} credentials - { email, password }
   */
  async login(credentials) {
    return apiClient.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
  },

  /**
   * Fetch authenticated user profile
   */
  async getProfile() {
    return apiClient.request("/api/auth/me", {
      method: "GET",
    });
  },

  /**
   * Fetch protected dashboard data
   */
  async getDashboardData() {
    return apiClient.request("/api/auth/dashboard-data", {
      method: "GET",
    });
  },
};

// ==========================================
// Products API
// ==========================================
export const productsApi = {
  /**
   * List paginated products with search & filters
   * @param {Object} [params] - { page, limit, search, category_id, brand, minPrice, maxPrice, sort }
   */
  async getProducts(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== "") {
        query.append(key, val);
      }
    });
    const queryString = query.toString() ? `?${query.toString()}` : "";
    return apiClient.request(`/api/products${queryString}`, {
      method: "GET",
    });
  },

  /**
   * Create a new product with image upload
   * @param {FormData|Object} data
   */
  async createProduct(data) {
    const isFormData = data instanceof FormData;
    return apiClient.request("/api/products", {
      method: "POST",
      body: isFormData ? data : JSON.stringify(data),
    });
  },

  /**
   * Update a product by ID (Supports FormData for image file upload or JSON)
   * @param {number|string} id
   * @param {FormData|Object} data
   */
  async updateProduct(id, data) {
    const isFormData = data instanceof FormData;
    return apiClient.request(`/api/products/${id}`, {
      method: "PUT",
      body: isFormData ? data : JSON.stringify(data),
    });
  },

  /**
   * Delete a product by ID
   * @param {number|string} id
   */
  async deleteProduct(id) {
    return apiClient.request(`/api/products/${id}`, {
      method: "DELETE",
    });
  },
};

// ==========================================
// Orders & Checkout API
// ==========================================
export const ordersApi = {
  /**
   * Execute Cart -> Order -> Stock update ACID transaction
   * @param {Object} checkoutData - { userId, shippingAddress, paymentMethod, cartItems }
   */
  async checkout(checkoutData) {
    return apiClient.request("/api/orders/checkout", {
      method: "POST",
      body: JSON.stringify(checkoutData),
    });
  },

  /**
   * Get authenticated user order history
   */
  async getMyOrders() {
    return apiClient.request("/api/orders/my-orders", {
      method: "GET",
    });
  },

  /**
   * Get all orders (admin/feed)
   */
  async getAllOrders(limit = 50) {
    return apiClient.request(`/api/orders/all?limit=${limit}`, {
      method: "GET",
    });
  },

  /**
   * Get single order by ID
   */
  async getOrderById(id) {
    return apiClient.request(`/api/orders/${id}`, {
      method: "GET",
    });
  },

  /**
   * Update order status
   * @param {number|string} id
   * @param {Object} data - { status, trackingNotes }
   */
  async updateOrderStatus(id, data) {
    return apiClient.request(`/api/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  /**
   * Trigger Real-Time Lifecycle Simulation (Placed -> Confirmed -> Packed -> Shipped -> Delivered)
   * @param {number|string} id
   * @param {Object} options - { intervalMs }
   */
  async simulateOrderStatusFlow(id, options = { intervalMs: 2500 }) {
    return apiClient.request(`/api/orders/${id}/simulate`, {
      method: "POST",
      body: JSON.stringify(options),
    });
  },

  /**
   * Cancel and Refund an eligible order
   * @param {number|string} id
   * @param {Object} data - { reason, isAdmin }
   */
  async cancelOrder(id, data = {}) {
    return apiClient.request(`/api/orders/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  /**
   * Run Database Consistency & Integrity Check
   */
  async checkDatabaseConsistency() {
    return apiClient.request("/api/orders/consistency/check", {
      method: "GET",
    });
  },

  /**
   * Get Background Email Queue Stats
   */
  async getEmailQueueStats() {
    return apiClient.request("/api/orders/email-queue/stats", {
      method: "GET",
    });
  },

  /**
   * Get Background Email Queue Logs
   */
  async getEmailQueueLogs(limit = 20) {
    return apiClient.request(`/api/orders/email-queue/logs?limit=${limit}`, {
      method: "GET",
    });
  },
};


