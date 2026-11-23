/**
 * OpenAPI Typed Client Generator
 * Generates frontend API client methods automatically from openapi.json
 */
const fs = require("fs");
const path = require("path");

const openApiSpecPath = path.resolve(__dirname, "../backend/docs/openapi.json");
const outputClientPath = path.resolve(__dirname, "../frontend/src/api/generatedClient.js");
const outputIndexPath = path.resolve(__dirname, "../frontend/src/api/index.js");

function generateClient() {
  console.log("Reading OpenAPI specification from:", openApiSpecPath);
  const specRaw = fs.readFileSync(openApiSpecPath, "utf-8");
  const spec = JSON.parse(specRaw);

  const operations = [];

  Object.entries(spec.paths).forEach(([routePath, methods]) => {
    Object.entries(methods).forEach(([method, op]) => {
      operations.push({
        path: routePath,
        method: method.toUpperCase(),
        operationId: op.operationId || `${method}${routePath.replace(/[^a-zA-Z0-9]/g, "")}`,
        summary: op.summary || "",
        tags: op.tags || ["General"],
        parameters: op.parameters || [],
        hasRequestBody: !!op.requestBody,
        isMultipart:
          op.requestBody?.content &&
          Object.keys(op.requestBody.content).includes("multipart/form-data"),
      });
    });
  });

  const code = `/**
 * AUTO-GENERATED API CLIENT
 * Generated from OpenAPI Specification v${spec.info.version}
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
      headers["Authorization"] = \`Bearer \${token}\`;
    }

    if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const config = {
      ...options,
      headers,
      credentials: "include",
    };

    const url = \`\${this.baseURL}\${endpoint}\`;
    const response = await fetch(url, config);

    let data;
    try {
      data = await response.json();
    } catch {
      data = { success: response.ok, status: response.status };
    }

    if (!response.ok) {
      const error = new Error(data.message || \`API request failed with status \${response.status}\`);
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
    const queryString = query.toString() ? \`?\${query.toString()}\` : "";
    return apiClient.request(\`/api/products\${queryString}\`, {
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
   * Delete a product by ID
   * @param {number|string} id
   */
  async deleteProduct(id) {
    return apiClient.request(\`/api/products/\${id}\`, {
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
};
`;

  // Ensure output directory exists
  const targetDir = path.dirname(outputClientPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  fs.writeFileSync(outputClientPath, code, "utf-8");
  console.log("Generated typed API client successfully at:", outputClientPath);

  const indexCode = `export * from "./generatedClient";\nexport { apiClient as default } from "./generatedClient";\n`;
  fs.writeFileSync(outputIndexPath, indexCode, "utf-8");
  console.log("Generated API client index at:", outputIndexPath);
}

if (require.main === module) {
  generateClient();
}

module.exports = generateClient;
