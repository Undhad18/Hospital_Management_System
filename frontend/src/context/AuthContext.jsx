import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  loginUser,
  registerUser,
  getMyProfile,
  logoutUser,
  getStoredToken,
  getStoredUser,
  removeStoredToken,
  removeStoredUser,
} from "../services/authService";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => getStoredUser());
  const [token, setToken] = useState(() => getStoredToken());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const clearError = () => setError(null);

  // Initialize and verify authentication state on initial load
  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = getStoredToken();
      if (!storedToken) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await getMyProfile();
        if (response.success && response.data?.user) {
          setUser(response.data.user);
          setToken(storedToken);
        } else {
          // Token invalid
          removeStoredToken();
          removeStoredUser();
          setUser(null);
          setToken(null);
        }
      } catch (err) {
        console.warn("Session verification failed:", err.message);
        removeStoredToken();
        removeStoredUser();
        setUser(null);
        setToken(null);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  // Login handler
  const login = async (email, password) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await loginUser({ email, password });
      if (response.success && response.data) {
        setUser(response.data.user);
        setToken(response.data.token);
        return { success: true, user: response.data.user };
      }
      throw new Error(response.message || "Login failed");
    } catch (err) {
      const errorMsg = err.data?.message || err.message || "Failed to log in";
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsLoading(false);
    }
  };

  // Register handler
  const register = async (name, email, password, role = "user") => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await registerUser({ name, email, password, role });
      if (response.success && response.data) {
        setUser(response.data.user);
        setToken(response.data.token);
        return { success: true, user: response.data.user };
      }
      throw new Error(response.message || "Registration failed");
    } catch (err) {
      const errorMsg = err.data?.message || err.message || "Failed to register";
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsLoading(false);
    }
  };

  // Logout handler
  const logout = async () => {
    setIsLoading(true);
    try {
      await logoutUser();
    } finally {
      setUser(null);
      setToken(null);
      setError(null);
      setIsLoading(false);
    }
  };

  // Refresh current user data
  const refreshUser = useCallback(async () => {
    try {
      const response = await getMyProfile();
      if (response.success && response.data?.user) {
        setUser(response.data.user);
      }
    } catch (err) {
      console.error("Failed to refresh user profile:", err);
    }
  }, []);

  const value = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    isLoading,
    error,
    login,
    register,
    logout,
    refreshUser,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom Hook to consume AuthContext
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
