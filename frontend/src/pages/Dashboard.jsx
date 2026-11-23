import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { useCart } from "../context/CartContext";

// Modular Tab Components
import RealTimeOrdersManager from "../components/dashboard/RealTimeOrdersManager";
import ProductionTopologyViewer from "../components/ProductionTopologyViewer";
import TelemetryTraceViewer from "../components/TelemetryTraceViewer";
import FeatureFlagManager from "../components/FeatureFlagManager";
import IntegrationDebuggingPlaybook from "../components/IntegrationDebuggingPlaybook";
import ArchitectureDiagramsStudio from "../components/ArchitectureDiagramsStudio";
import StripeIdempotencyStudio from "../components/dashboard/StripeIdempotencyStudio";
import AdminProductManager from "../components/AdminProductManager";
import SystemOverviewTab from "../components/dashboard/SystemOverviewTab";
import EmailQueueTab from "../components/dashboard/EmailQueueTab";
import ApiRouteTesterTab from "../components/dashboard/ApiRouteTesterTab";
import SwaggerDocsTab from "../components/dashboard/SwaggerDocsTab";
import JwtInspectorTab from "../components/dashboard/JwtInspectorTab";

// Modals
import CartDrawer from "../components/CartDrawer";
import BackgroundEmailQueueInspector from "../components/BackgroundEmailQueueInspector";

// Icons
import { LayoutDashboard, Package, Truck, Mail, Terminal, BookOpen, Key, Database, Activity, LogOut, User, Shield, ShoppingBag, ExternalLink, ChevronRight, ChevronLeft, Menu, X, CreditCard, SlidersHorizontal, Wrench, GitMerge, Server, Globe, RefreshCw, } from "lucide-react";

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { isConnected } = useSocket();
  const { totalItems, setIsCartOpen } = useCart();

  // Navigation / Sidebar state
  const [activeTab, setActiveTab] = useState("orders");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isServerHealthy, setIsServerHealthy] = useState(true);
  const [isEmailQueueOpen, setIsEmailQueueOpen] = useState(false);
  const [ordersCount, setOrdersCount] = useState(0);

  const handleOrdersLoaded = useCallback((ords) => {
    if (ords && typeof ords.length === "number") {
      setOrdersCount(ords.length);
    }
  }, []);

  // Check backend server health
  useEffect(() => {
    fetch("http://localhost:5000/api/health")
      .then((res) => setIsServerHealthy(res.ok))
      .catch(() => setIsServerHealthy(false));
  }, []);

  const sidebarNavItems = [
    {
      id: "orders",
      label: "Real-Time Orders",
      icon: Truck,
      // badge: ordersCount > 0 ? `${ordersCount}` : null,
      badgeColor: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
    },
    {
      id: "production-topology",
      label: "Production & Topology",
      icon: Server,
      // badge: "NGINX",
      badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    },
    {
      id: "telemetry-traces",
      label: "E2E Trace & Observability",
      icon: Activity,
      // badge: "APM",
      badgeColor: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    },
    {
      id: "feature-flags",
      label: "Feature Flags & Rollouts",
      icon: SlidersHorizontal,
      // badge: "A/B TEST",
      badgeColor: "bg-violet-500/20 text-violet-300 border-violet-500/30",
    },
    {
      id: "debugging-playbook",
      label: "Integration Playbook",
      icon: Wrench,
      // badge: "SRE RUNBOOK",
      badgeColor: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    },
    {
      id: "architecture-blueprints",
      label: "Architecture & Blueprints",
      icon: GitMerge,
      // badge: "ER & FLOW",
      badgeColor: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    },
    {
      id: "stripe-idempotency",
      label: "Stripe & Idempotency",
      icon: CreditCard,
      // badge: "ACID",
      badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    },
    {
      id: "overview",
      label: "System Overview",
      icon: LayoutDashboard,
    },
    {
      id: "email-queue",
      label: "Email Worker Queue",
      icon: Mail,
      // badge: "ASYNC",
      badgeColor: "bg-violet-500/20 text-violet-300 border-violet-500/30",
    },
    {
      id: "products",
      label: "Products Catalog",
      icon: Package,
    },
    {
      id: "api-tester",
      label: "API Route Tester",
      icon: Terminal,
    },
    {
      id: "swagger",
      label: "Swagger OpenAPI 3.0",
      icon: BookOpen,
    },
    {
      id: "jwt",
      label: "JWT Token Inspector",
      icon: Key,
    },
  ];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#060910] text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div
          onClick={() => setMobileSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* ========================================================= */}
      {/* LEFT EXPANSIVE SIDEBAR NAVIGATION                         */}
      {/* ========================================================= */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 flex flex-col h-screen max-h-screen border-r border-white/10 bg-[#080C14]/95 lg:bg-[#080C14]/90 backdrop-blur-2xl transition-all duration-300 ${sidebarCollapsed ? "w-20" : "w-72"
          } ${mobileSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        {/* Sidebar Header / Brand (Fixed Top) */}
        {sidebarCollapsed ? (
          <div className="p-3 py-3.5 border-b border-white/10 flex flex-col items-center justify-center gap-2.5 flex-shrink-0">
            <Link
              to="/dashboard"
              className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-500 via-indigo-600 to-violet-700 p-0.5 shadow-lg shadow-indigo-500/25 flex-shrink-0 group flex items-center justify-center"
              title="ShopSphere Admin Hub"
            >
              <div className="w-full h-full bg-[#080C14] rounded-[14px] flex items-center justify-center">
                <Shield className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition" />
              </div>
            </Link>

            <button
              onClick={() => setSidebarCollapsed(false)}
              className="hidden lg:flex w-8 h-7 rounded-xl bg-slate-900/90 hover:bg-indigo-600 text-slate-400 hover:text-white border border-white/10 hover:border-indigo-500/40 items-center justify-center transition cursor-pointer shadow-sm group"
              title="Expand Sidebar"
            >
              <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition" />
            </button>
          </div>
        ) : (
          <div className="p-4 border-b border-white/10 flex items-center justify-between flex-shrink-0">
            <Link to="/dashboard" className="flex items-center gap-3 overflow-hidden group">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-500 via-indigo-600 to-violet-700 p-0.5 shadow-lg shadow-indigo-500/25 flex-shrink-0">
                <div className="w-full h-full bg-[#080C14] rounded-[14px] flex items-center justify-center">
                  <Shield className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition" />
                </div>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-base tracking-tight text-white font-heading truncate">
                    ShopSphere
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[9px] font-mono font-bold">
                    ADMIN
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 font-mono truncate">Fulfillment & Studio</p>
              </div>
            </Link>

            <button
              onClick={() => setSidebarCollapsed(true)}
              className="hidden lg:flex p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 transition cursor-pointer"
              title="Collapse Sidebar"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              onClick={() => setMobileSidebarOpen(false)}
              className="lg:hidden p-1.5 rounded-xl text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Sidebar Nav Items (Scrollable Middle with custom sleek scrollbar) */}
        <div
          className={`flex-1 overflow-y-auto overflow-x-hidden min-h-0 space-y-1.5 custom-scrollbar ${sidebarCollapsed ? "px-2 py-3" : "p-3 pr-2"
            }`}
        >
          {!sidebarCollapsed ? (
            <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold">
              Management & Pipelines
            </div>
          ) : (
            <div className="w-8 h-px bg-white/10 mx-auto my-2" />
          )}

          {sidebarNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileSidebarOpen(false);
                }}
                className={`w-full transition group cursor-pointer relative ${sidebarCollapsed
                  ? "h-11 rounded-2xl flex items-center justify-center p-0"
                  : "flex items-center justify-between p-3 rounded-2xl text-xs font-semibold"
                  } ${isActive
                    ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-600/30 border border-indigo-400/30"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent hover:border-white/5"
                  }`}
                title={item.label}
              >
                <div
                  className={`flex items-center ${sidebarCollapsed ? "justify-center w-full" : "gap-3 overflow-hidden"
                    }`}
                >
                  <Icon
                    className={`w-5 h-5 flex-shrink-0 transition ${isActive ? "text-white scale-110" : "text-slate-400 group-hover:text-indigo-400 group-hover:scale-110"
                      }`}
                  />
                  {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                </div>

                {/* Expanded Badge */}
                {!sidebarCollapsed && item.badge && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${isActive
                      ? "bg-white/20 text-white border-white/30"
                      : item.badgeColor || "bg-slate-800 text-slate-400 border-white/10"
                      }`}
                  >
                    {item.badge}
                  </span>
                )}

                {/* Collapsed subtle badge indicator dot */}
                {sidebarCollapsed && item.badge && (
                  <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-indigo-400 shadow-[0_0_6px_rgba(99,102,241,0.9)]" />
                )}
              </button>
            );
          })}
        </div>

        {/* Sidebar Footer Profile & Quick Links (Fixed Bottom) */}
        <div className="p-3 border-t border-white/10 bg-slate-950/40 flex-shrink-0">
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center gap-2">
              <div
                className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-md border border-white/10"
                title={`${user?.name || "Admin"} (Admin Master)`}
              >
                {user?.name ? user.name[0].toUpperCase() : "A"}
              </div>

              <button
                onClick={logout}
                className="w-10 h-9 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition cursor-pointer flex items-center justify-center"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="p-2.5 rounded-xl bg-slate-900/60 border border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow flex-shrink-0">
                  {user?.name ? user.name[0].toUpperCase() : "A"}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">{user?.name || "Admin"}</p>
                  <span className="text-[10px] mt-1 font-mono text-amber-400 flex items-center gap-1">
                    👑 Admin Master
                  </span>
                </div>
              </div>

              <button
                onClick={logout}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ========================================================= */}
      {/* MAIN APPLICATION WORKSPACE                                */}
      {/* ========================================================= */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Floating App Bar */}
        <header className="h-18 border-b border-white/10 bg-[#080C14]/80 backdrop-blur-2xl px-4 sm:px-6 flex items-center justify-between flex-shrink-0 z-30">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Breadcrumb Title */}
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>Studio</span>
                <span>/</span>
                <span className="text-indigo-300 font-semibold capitalize">
                  {activeTab.replace("-", " ")}
                </span>
              </div>
              <h1 className="text-sm sm:text-base font-extrabold text-white tracking-tight">
                {activeTab === "orders" && "Real-Time Orders & Delivery Stream"}
                {activeTab === "production-topology" && "Production Topology & Same-Origin Proxy"}
                {activeTab === "telemetry-traces" && "End-to-End APM Telemetry & Tracing"}
                {activeTab === "feature-flags" && "Feature Flags & Progressive Delivery"}
                {activeTab === "debugging-playbook" && "Integration Debugging Playbook"}
                {activeTab === "architecture-blueprints" && "System Architecture & Blueprints"}
                {activeTab === "stripe-idempotency" && "Stripe Payments & Idempotency Engine"}
                {activeTab === "products" && "Product Management Catalog & Inventory"}
                {activeTab === "overview" && "Platform Metrics & Real-Time Telemetry"}
                {activeTab === "email-queue" && "Background Email Worker Queue"}
                {activeTab === "api-tester" && "Protected Express API Route Tester"}
                {activeTab === "swagger" && "Swagger OpenAPI 3.0 Interactive Spec"}
                {activeTab === "jwt" && "JSON Web Token (JWT) Deep Inspector"}
              </h1>
            </div>
          </div>

          {/* Right Header Status Badges & Quick Triggers */}
          <div className="flex items-center gap-3">
            {/* WebSocket Live Beacon */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-white/10 text-xs">
              <span
                className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" : "bg-rose-400"
                  }`}
              />
              <span className="text-[11px] font-mono text-slate-300">
                {isConnected ? "Socket.IO: Live" : "Socket: Offline"}
              </span>
            </div>

            {/* API Health Beacon */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-white/10 text-xs text-slate-400">
              <span
                className={`w-2 h-2 rounded-full ${isServerHealthy ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" : "bg-rose-400"
                  }`}
              />
              <span className="text-[11px] font-mono text-slate-300">
                API: {isServerHealthy ? "Port 5000" : "Offline"}
              </span>
            </div>

            {/* Email Queue Modal Trigger */}
            {/* <button
              onClick={() => setIsEmailQueueOpen(true)}
              className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 hover:text-white transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer shadow-lg shadow-violet-600/10"
              title="Inspect Background Email Queue"
            >
              <Mail className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Email Queue</span>
            </button> */}
          </div>
        </header>

        {/* Full-Screen Dynamic Tab Workspace */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 bg-[#060910] relative custom-scrollbar">
          {/* Subtle Background Glow Accent */}
          <div className="absolute top-0 right-1/3 w-96 h-96 bg-indigo-600/5 rounded-full blur-3xl pointer-events-none" />

          {/* TAB: REAL-TIME ORDERS STREAM                             */}
          {activeTab === "orders" && (
            <RealTimeOrdersManager onOrdersLoaded={handleOrdersLoaded} />
          )}

          {/* TAB: PRODUCTION TOPOLOGY & SAME-ORIGIN REVERSE PROXY       */}
          {activeTab === "production-topology" && <ProductionTopologyViewer />}

          {/* TAB: END-TO-END APM TELEMETRY & DISTRIBUTED TRACING        */}
          {activeTab === "telemetry-traces" && <TelemetryTraceViewer />}

          {/* TAB: PROGRESSIVE DELIVERY & FEATURE FLAG MANAGER           */}
          {activeTab === "feature-flags" && <FeatureFlagManager />}

          {/* TAB: INTEGRATION DEBUGGING PLAYBOOK & SRE STUDIO          */}
          {activeTab === "debugging-playbook" && <IntegrationDebuggingPlaybook />}

          {/* TAB: SYSTEM ARCHITECTURE & INTEGRATION BLUEPRINTS         */}
          {activeTab === "architecture-blueprints" && <ArchitectureDiagramsStudio />}

          {/* TAB: STRIPE TEST PAYMENTS & IDEMPOTENCY ENGINE             */}
          {activeTab === "stripe-idempotency" && <StripeIdempotencyStudio />}

          {/* TAB: PRODUCTS CATALOG & INVENTORY MANAGEMENT              */}
          {activeTab === "products" && <AdminProductManager />}

          {/* TAB: SYSTEM OVERVIEW & ARCHITECTURE METRICS               */}
          {activeTab === "overview" && <SystemOverviewTab />}

          {/* TAB: BACKGROUND EMAIL WORKER QUEUE                        */}
          {activeTab === "email-queue" && (
            <EmailQueueTab onOpenInspector={() => setIsEmailQueueOpen(true)} />
          )}

          {/* TAB: PROTECTED API ROUTE TESTER                           */}
          {activeTab === "api-tester" && <ApiRouteTesterTab />}

          {/* TAB: SWAGGER OPENAPI 3.0 SPEC                             */}
          {activeTab === "swagger" && <SwaggerDocsTab />}

          {/* TAB: JWT TOKEN DEEP INSPECTOR                             */}
          {activeTab === "jwt" && <JwtInspectorTab />}
        </main>
      </div>

      {/* Cart Drawer Modal */}
      <CartDrawer />

      {/* Background Email Queue Inspector Modal */}
      <BackgroundEmailQueueInspector
        isOpen={isEmailQueueOpen}
        onClose={() => setIsEmailQueueOpen(false)}
      />
    </div>
  );
}
