import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useSocket } from "../context/SocketContext";
import OrdersTrackerModal from "./OrdersTrackerModal";
import NotificationCenterDropdown from "./NotificationCenterDropdown";
import CustomerStatusToast from "./CustomerStatusToast";
import BackgroundEmailQueueInspector from "./BackgroundEmailQueueInspector";
import {
  ShoppingBag,
  Shield,
  Layers,
  LayoutDashboard,
  LogOut,
  Sparkles,
  ExternalLink,
  Activity,
  Package,
  Menu,
  X,
  BookOpen,
  Crown,
  User as UserIcon,
  Truck,
  Radio,
  Mail,
} from "lucide-react";

export default function Navbar() {
  const { user, logout, isAuthenticated } = useAuth();
  const { totalItems, setIsCartOpen } = useCart();
  const { isConnected, latestStatusUpdate } = useSocket();
  const location = useLocation();

  const [isServerHealthy, setIsServerHealthy] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isOrdersModalOpen, setIsOrdersModalOpen] = useState(false);
  const [selectedTrackerOrderId, setSelectedTrackerOrderId] = useState(null);
  const [isEmailQueueOpen, setIsEmailQueueOpen] = useState(false);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    fetch("http://localhost:5000/api/health")
      .then((res) => setIsServerHealthy(res.ok))
      .catch(() => setIsServerHealthy(false));
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-[#080C14]/90 backdrop-blur-2xl">
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 h-18 flex items-center justify-between">
        {/* Brand Logo */}
        <div className="flex items-center gap-6">
          <Link to="/products" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-700 p-0.5 shadow-lg shadow-indigo-500/20 group-hover:shadow-indigo-500/40 transition-all duration-300">
              <div className="w-full h-full bg-[#090D16] rounded-[14px] flex items-center justify-center">
                <Package className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition duration-300" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-heading font-extrabold text-base sm:text-lg tracking-tight text-white group-hover:text-indigo-300 transition">
                  ShopSphere
                </span>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  MERN v2.0
                </span>
              </div>
              <p className="text-[10px] text-slate-400 hidden sm:block">
                Full-Stack Architecture & ACID Transactions
              </p>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          {isAuthenticated && (
            <nav className="hidden md:flex items-center gap-1.5 p-1 rounded-2xl bg-slate-900/80 border border-white/5 shadow-inner">
              <Link
                to="/products"
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${location.pathname === "/products"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  }`}
              >
                <Package className="w-3.5 h-3.5" />
                <span>Products Catalog</span>
              </Link>

              {/* Admin-Only Links */}
              {isAdmin && (
                <>
                  <Link
                    to="/dashboard"
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${location.pathname === "/dashboard"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                      }`}
                  >
                    <LayoutDashboard className="w-3.5 h-3.5" />
                    <span>Dashboard & API</span>
                  </Link>

                  <Link
                    to="/docs"
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${location.pathname === "/docs" || location.pathname === "/swagger"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                      }`}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Swagger Docs</span>
                  </Link>
                </>
              )}
            </nav>
          )}
        </div>

        {/* Right Action Icons & Profile */}
        <div className="flex items-center gap-3">
          {/* Server Health Status Pill (Admins see live API beacon) */}
          {isAdmin && (
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/60 border border-white/5 text-xs text-slate-400">
              <span
                className={`w-2 h-2 rounded-full ${isServerHealthy
                  ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse"
                  : "bg-rose-400"
                  }`}
              />
              <span className="text-[11px] font-mono">
                API: {isServerHealthy ? "Port 5000 (Online)" : "Offline"}
              </span>
            </div>
          )}

          {/* Real-Time Live Orders & Stepper Modal Button */}
          {isAuthenticated && (
            <button
              type="button"
              onClick={() => {
                setSelectedTrackerOrderId(null);
                setIsOrdersModalOpen(true);
              }}
              className="relative flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-white/10 text-slate-200 hover:border-violet-500/40 transition cursor-pointer group shadow-lg"
              title="Open Real-Time Delivery Tracker & Background Email Queue"
            >
              <div className="relative">
                <Truck className="w-4 h-4 text-violet-400 group-hover:scale-110 transition" />
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400" />
              </div>
              <span className="text-xs font-semibold hidden sm:inline">Orders</span>
            </button>
          )}

          {/* Real-Time Notification Center Dropdown */}
          {isAuthenticated && (
            <NotificationCenterDropdown
              onOpenOrderModal={(orderId) => {
                setSelectedTrackerOrderId(orderId);
                setIsOrdersModalOpen(true);
              }}
              onOpenEmailQueue={() => setIsEmailQueueOpen(true)}
            />
          )}

          {/* Cart Button */}
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            className="relative flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-white/10 text-slate-200 hover:border-indigo-500/40 transition cursor-pointer group shadow-lg"
          >
            <div className="relative">
              <ShoppingBag className="w-4 h-4 text-indigo-400 group-hover:scale-110 transition" />
              {totalItems > 0 && (
                <span className="absolute -top-2 -right-2 w-4.5 h-4.5 rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-[9px] font-black flex items-center justify-center shadow-lg animate-pulse">
                  {totalItems}
                </span>
              )}
            </div>
            <span className="text-xs font-semibold hidden sm:inline">Cart</span>
          </button>

          {/* User Profile & Logout */}
          {isAuthenticated ? (
            <div className="flex items-center gap-2 pl-2 border-l border-white/10">
              <Link
                to={isAdmin ? "/dashboard" : "/products"}
                className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-900/60 hover:bg-slate-800 border border-white/5 hover:border-indigo-500/30 transition cursor-pointer"
                title={isAdmin ? "Go to Admin Dashboard" : "Browse Catalog"}
              >
                <div
                  className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black text-white shadow ${isAdmin
                    ? "bg-gradient-to-tr from-amber-500 to-indigo-600"
                    : "bg-gradient-to-tr from-indigo-600 to-violet-500"
                    }`}
                >
                  {isAdmin ? <Crown className="w-3.5 h-3.5 text-amber-300" /> : user?.name ? user.name[0].toUpperCase() : "U"}
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold text-slate-200 ml-1 leading-tight">{user?.name || "User"}</p>
                  <span
                    className={`text-[10px] font-mono capitalize font-semibold ${isAdmin ? "text-amber-400" : "text-indigo-400"
                      }`}
                  >
                    {isAdmin ? "👑 Admin" : "👤 Customer"}
                  </span>
                </div>
              </Link>

              <button
                type="button"
                onClick={logout}
                className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 hover:text-rose-300 transition cursor-pointer"
                title="Log Out"
              >
                <LogOut className="w-4 h-4" />
              </button>

              {/* Mobile menu toggle */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-xl bg-slate-900 border border-white/10 text-slate-400 hover:text-white"
              >
                {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && isAuthenticated && (
        <div className="md:hidden border-t border-white/10 bg-slate-950/95 backdrop-blur-2xl p-4 space-y-2 animate-fadeIn">
          <Link
            to="/products"
            onClick={() => setMobileMenuOpen(false)}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold ${location.pathname === "/products"
              ? "bg-indigo-600 text-white"
              : "text-slate-300 hover:bg-slate-900"
              }`}
          >
            <Package className="w-4 h-4" />
            <span>Products Catalog</span>
          </Link>

          {isAdmin && (
            <>
              <Link
                to="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold ${location.pathname === "/dashboard"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-300 hover:bg-slate-900"
                  }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>Dashboard & API</span>
              </Link>

              <Link
                to="/docs"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold ${location.pathname === "/docs" || location.pathname === "/swagger"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-300 hover:bg-slate-900"
                  }`}
              >
                <BookOpen className="w-4 h-4" />
                <span>Swagger API Docs</span>
              </Link>
            </>
          )}
        </div>
      )}

      {/* Real-Time Orders Tracker Modal */}
      <OrdersTrackerModal
        isOpen={isOrdersModalOpen}
        initialOrderId={selectedTrackerOrderId}
        onClose={() => {
          setIsOrdersModalOpen(false);
          setSelectedTrackerOrderId(null);
        }}
      />

      {/* Background Email Worker Queue Inspector Modal */}
      <BackgroundEmailQueueInspector
        isOpen={isEmailQueueOpen}
        onClose={() => setIsEmailQueueOpen(false)}
      />

      {/* Customer Real-Time Status Toast */}
      <CustomerStatusToast
        onOpenTracker={(orderId) => {
          setSelectedTrackerOrderId(orderId);
          setIsOrdersModalOpen(true);
        }}
      />
    </header>
  );
}

