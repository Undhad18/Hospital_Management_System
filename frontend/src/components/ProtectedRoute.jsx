import React from "react";
import { Navigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ShieldAlert, Loader2, Package, ArrowLeft, Lock } from "lucide-react";

/**
 * ProtectedRoute Component
 * Guards routes against unauthenticated access and role restrictions (e.g. Admin Only).
 */
const ProtectedRoute = ({ children, requiredRole = null }) => {
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  const location = useLocation();

  // 1. Show sleek loading screen while session is being verified
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#080C14] flex flex-col items-center justify-center p-4 text-white">
        <div className="relative flex items-center justify-center">
          <div className="w-16 h-16 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
          <Loader2 className="w-8 h-8 text-indigo-400 absolute animate-pulse" />
        </div>
        <p className="mt-4 text-sm font-medium text-slate-400 tracking-wide">
          Verifying security token & session...
        </p>
      </div>
    );
  }

  // 2. Redirect to login if user is not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 3. Role-based access check (e.g., Admin Only for Dashboard & Swagger Docs)
  if (requiredRole && user?.role !== requiredRole) {
    return (
      <div className="min-h-screen bg-[#080C14] flex items-center justify-center p-4 text-white radial-mesh">
        <div className="max-w-md w-full bg-slate-900/90 backdrop-blur-2xl border border-rose-500/30 rounded-3xl p-8 shadow-2xl text-center space-y-5">
          <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center justify-center mx-auto text-rose-400 shadow-lg shadow-rose-500/10">
            <Lock className="w-8 h-8" />
          </div>
          
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Admin Privileges Required</span>
            </span>
            <h2 className="text-xl font-bold text-white mt-3 font-heading">Access Restricted</h2>
            <p className="mt-2 text-xs sm:text-sm text-slate-400 leading-relaxed">
              This area is strictly restricted to <span className="text-indigo-400 font-bold uppercase">{requiredRole}</span> accounts. Your current account role is <span className="text-amber-400 font-bold capitalize">{user?.role || "user"}</span>.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/products"
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition flex items-center justify-center gap-2"
            >
              <Package className="w-4 h-4" />
              <span>Go to Product Catalog</span>
            </Link>

            <button
              onClick={logout}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-white/10 transition cursor-pointer"
            >
              Switch Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 4. Authorized: render child components
  return children;
};

export default ProtectedRoute;
