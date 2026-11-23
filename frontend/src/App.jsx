import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { CartProvider } from "./context/CartContext";
import { SocketProvider } from "./context/SocketContext";
import { FeatureFlagProvider } from "./context/FeatureFlagContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import SwaggerDocs from "./pages/SwaggerDocs";

function RootRedirect() {
  const { user, isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  // Admins land on Dashboard, regular users land on Products Catalog
  return <Navigate to={user?.role === "admin" ? "/dashboard" : "/products"} replace />;
}

function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <FeatureFlagProvider>
          <CartProvider>
            <Routes>
          {/* Public Auth Route */}
          <Route path="/login" element={<Login />} />

          {/* Catalog Route: Accessible to ALL authenticated users (customers & admins) */}
          <Route
            path="/products"
            element={
              <ProtectedRoute>
                <Products />
              </ProtectedRoute>
            }
          />

          {/* Admin-Only Routes: Dashboard & Swagger Docs */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute requiredRole="admin">
                <Dashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/docs"
            element={
              <ProtectedRoute requiredRole="admin">
                <SwaggerDocs />
              </ProtectedRoute>
            }
          />

          <Route
            path="/swagger"
            element={
              <ProtectedRoute requiredRole="admin">
                <SwaggerDocs />
              </ProtectedRoute>
            }
          />

          {/* Root Redirect based on Role */}
          <Route path="/" element={<RootRedirect />} />

          {/* Catch-all fallback */}
          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </CartProvider>
    </FeatureFlagProvider>
  </SocketProvider>
</AuthProvider>
  );
}

export default App;