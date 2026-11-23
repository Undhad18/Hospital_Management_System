/**
 * Authentication Service
 * Powered by OpenAPI Generated Typed API Client (authApi).
 */
import { authApi } from "../api";

const TOKEN_KEY = "mern_auth_token";
const USER_KEY = "mern_auth_user";

// Token storage helpers
export const getStoredToken = () => localStorage.getItem(TOKEN_KEY);
export const setStoredToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const removeStoredToken = () => localStorage.removeItem(TOKEN_KEY);

// User storage helpers
export const getStoredUser = () => {
  const user = localStorage.getItem(USER_KEY);
  try {
    return user ? JSON.parse(user) : null;
  } catch {
    return null;
  }
};
export const setStoredUser = (user) =>
  localStorage.setItem(USER_KEY, JSON.stringify(user));
export const removeStoredUser = () => localStorage.removeItem(USER_KEY);

/**
 * Log in with email and password via generated authApi
 */
export const loginUser = async (credentials) => {
  const result = await authApi.login(credentials);
  if (result.data?.token) {
    setStoredToken(result.data.token);
  }
  if (result.data?.user) {
    setStoredUser(result.data.user);
  }
  return result;
};

/**
 * Register a new user account via generated authApi
 */
export const registerUser = async (userData) => {
  const result = await authApi.register(userData);
  if (result.data?.token) {
    setStoredToken(result.data.token);
  }
  if (result.data?.user) {
    setStoredUser(result.data.user);
  }
  return result;
};

/**
 * Fetch current authenticated user profile via generated authApi
 */
export const getMyProfile = async () => {
  return await authApi.getProfile();
};

/**
 * Fetch protected dashboard metrics via generated authApi
 */
export const fetchDashboardData = async () => {
  return await authApi.getDashboardData();
};

/**
 * Log out user & clear storage
 */
export const logoutUser = async () => {
  removeStoredToken();
  removeStoredUser();
};
