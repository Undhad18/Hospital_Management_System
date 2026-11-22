import { useEffect, useState } from "react";
import Login from "./pages/Login";
import Hospitals from "./pages/Hospitals";
import PendingApprovals from "./pages/PendingApprovals";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ChangePasswordModal from "./pages/ChangePasswordModal";
import UserManagement from "./pages/UserManagement";
import Locations from "./pages/Locations";
import DepartmentsAndDesignations from "./pages/DepartmentsAndDesignations";
import NotificationHistory from "./pages/NotificationHistory";
import MasterLabCatalog from "./pages/MasterLabCatalog";
import MasterMedicineCatalog from "./pages/MasterMedicineCatalog";
import {
  PORTALS,
  redirectIfForeignRole,
  consumeIncomingSession,
  getSession,
  saveSession,
  clearSession,
} from "./services/portalConfig";

const CURRENT_ROLE = "super_admin";

export default function App() {
  const [session, setSession] = useState(null);
  const [unauthView, setUnauthView] = useState("login"); // 'login' | 'forgot' | 'reset'
  const [activeTab, setActiveTab] = useState("hospitals"); // 'hospitals' | 'users' | 'approvals' | 'locations' | 'departments'
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [flashMessage, setFlashMessage] = useState(null);
  const [resetEmail, setResetEmail] = useState("");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Listen for unauthorized 401 events globally
  useEffect(() => {
    function handleUnauthorized(e) {
      clearSession();
      setSession(null);
      setUnauthView("login");
      setFlashMessage(e.detail?.message || "Session expired or invalid. Please sign in again.");
    }
    window.addEventListener("hms_unauthorized", handleUnauthorized);
    return () => window.removeEventListener("hms_unauthorized", handleUnauthorized);
  }, []);

  useEffect(() => {
    const incoming = consumeIncomingSession();
    if (incoming) {
      if (!redirectIfForeignRole(incoming, CURRENT_ROLE)) {
        setSession(incoming);
      }
      return;
    }

    const saved = getSession();
    if (saved?.token && saved?.user?.role === CURRENT_ROLE) {
      setSession(saved);
    } else if (saved) {
      clearSession();
    }
  }, []);

  function handleLogin(result) {
    if (result.user?.role !== CURRENT_ROLE) {
      setFlashMessage(
        "Access denied: Only Super Admin accounts can sign in to this portal."
      );
      return;
    }

    const newSession = {
      token: result.token,
      user: result.user,
    };
    saveSession(newSession);
    setSession(newSession);
    setFlashMessage(null);
  }

  function handleLogout() {
    clearSession();
    setSession(null);
    setActiveTab("hospitals");
    setUnauthView("login");
  }

  // --- Unauthenticated Views ---
  if (!session) {
    return (
      <div className="min-h-screen w-full bg-slate-50 flex flex-col justify-between text-slate-900 font-sans">
        {flashMessage && (
          <div className="fixed top-4 right-4 z-50 p-4 rounded-md bg-white border border-slate-200 text-slate-900 text-sm shadow-md flex items-center space-x-2.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
            <span className="font-medium text-xs">{flashMessage}</span>
            <button
              onClick={() => setFlashMessage(null)}
              className="ml-3 text-slate-400 hover:text-slate-600 font-bold"
            >
              ×
            </button>
          </div>
        )}

        <div className="flex-1 flex flex-col">
          {unauthView === "login" && (
            <Login
              onLogin={handleLogin}
              onNavigateForgot={() => setUnauthView("forgot")}
              currentRole={CURRENT_ROLE}
            />
          )}

          {unauthView === "forgot" && (
            <ForgotPassword
              onOtpSent={(email) => {
                setResetEmail(email);
                setUnauthView("reset");
              }}
              onBackToLogin={() => setUnauthView("login")}
            />
          )}

          {unauthView === "reset" && (
            <ResetPassword
              initialEmail={resetEmail}
              onResetSuccess={() => {
                setFlashMessage("Password reset successful. Please sign in with your new credentials.");
                setUnauthView("login");
              }}
              onBackToLogin={() => setUnauthView("login")}
            />
          )}
        </div>
      </div>
    );
  }

  // --- Authenticated Layout ---
  const mustChangePassword = Boolean(session.user.mustChangePassword);

  const initials = session.user.fullName
    ? session.user.fullName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
    : "SA";

  const tabTitles = {
    hospitals: "Hospital Facilities Directory",
    users: "User Lifecycle & RBAC Governance",
    approvals: "Central Credential Approvals",
    locations: "Geographic Masters (Countries & Cities)",
    departments: "Master Departments & Clinical Designations",
    labs: "Master Laboratory Test Catalog",
    medicines: "Master Medicine Catalog & Pharmacy Governance",
    notifications: "System Outbox & Email Delivery History",
  };

  return (
    <div className="h-screen w-full bg-slate-50 text-slate-900 flex flex-col font-sans overflow-hidden">
      <div className="flex-1 flex w-full min-h-0 overflow-hidden">
        {/* Forced Password Change Modal */}
        {mustChangePassword && (
          <ChangePasswordModal
            token={session.token}
            isForced={true}
            onSuccess={(res) => {
              const updated = {
                token: res.token,
                user: res.user,
              };
              saveSession(updated);
              setSession(updated);
              setFlashMessage("Password updated successfully.");
            }}
          />
        )}

        {/* Manual Change Password Modal */}
        {showChangePassword && !mustChangePassword && (
          <ChangePasswordModal
            token={session.token}
            isForced={false}
            onSuccess={(res) => {
              const updated = {
                token: res.token,
                user: res.user,
              };
              saveSession(updated);
              setSession(updated);
              setShowChangePassword(false);
              setFlashMessage("Password updated successfully.");
            }}
            onClose={() => setShowChangePassword(false)}
          />
        )}

        {/* Mobile backdrop */}
        {mobileSidebarOpen && (
          <div
            onClick={() => setMobileSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs md:hidden"
          ></div>
        )}

        {/* ======================= ANCHORED ENTERPRISE SIDEBAR ======================= */}
        <aside
          className={`fixed md:static inset-y-0 left-0 z-50 h-screen md:h-full w-64 bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 transition-transform duration-200 ease-in-out ${mobileSidebarOpen
            ? "translate-x-0"
            : "-translate-x-full md:translate-x-0"
            }`}
        >
          {/* Top Brand Header (STICKY ANCHORED) */}
          <div className="h-14 px-5 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white z-10">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-md bg-sky-600 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <span className="font-bold text-sm text-slate-900 block leading-tight">
                  HealthMesh
                </span>
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">
                  Central Authority
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMobileSidebarOpen(false)}
              className="md:hidden text-slate-400 hover:text-slate-600 p-1 rounded-md transition cursor-pointer"
              title="Close sidebar"
            >
              ✕
            </button>
          </div>

          {/* Navigation Section (SCROLLBAR HIDDEN & FLUID SCROLLING BELOW HEADER) */}
          <nav className="p-3 space-y-5 flex-1 min-w-0 overflow-y-auto no-scrollbar">
              {/* Facility & User Administration */}
              <div>
                <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Facility &amp; User Administration
                </p>
                <div className="space-y-1">
                  {/* Hospitals Directory */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("hospitals");
                      setMobileSidebarOpen(false);
                    }}
                    className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer ${activeTab === "hospitals"
                      ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                  >
                    <svg className={`w-4 h-4 shrink-0 ${activeTab === "hospitals" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <span>Hospitals Directory</span>
                  </button>

                  {/* Central Approvals */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("approvals");
                      setMobileSidebarOpen(false);
                    }}
                    className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer ${activeTab === "approvals"
                      ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                  >
                    <svg className={`w-4 h-4 shrink-0 ${activeTab === "approvals" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <span>Central Approvals</span>
                  </button>

                  {/* User Lifecycle & RBAC */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("users");
                      setMobileSidebarOpen(false);
                    }}
                    className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer ${activeTab === "users"
                      ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                  >
                    <svg className={`w-4 h-4 shrink-0 ${activeTab === "users" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    <span>User Lifecycle &amp; RBAC</span>
                  </button>

                  {/* Geographic Masters */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("locations");
                      setMobileSidebarOpen(false);
                    }}
                    className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer ${activeTab === "locations"
                      ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                  >
                    <svg className={`w-4 h-4 shrink-0 ${activeTab === "locations" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Geographic Masters</span>
                  </button>

                  {/* Departments & Roles */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("departments");
                      setMobileSidebarOpen(false);
                    }}
                    className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer ${activeTab === "departments"
                      ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                  >
                    <svg className={`w-4 h-4 shrink-0 ${activeTab === "departments" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <span>Departments &amp; Roles</span>
                  </button>
                </div>
              </div>

              {/* Clinical & Ancillary Services */}
              <div>
                <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Clinical &amp; Ancillary Services
                </p>
                <div className="space-y-1">
                  {/* Master Laboratory Tests (Module 11) */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("labs");
                      setMobileSidebarOpen(false);
                    }}
                    className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer ${activeTab === "labs"
                      ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                  >
                    <svg className={`w-4 h-4 shrink-0 ${activeTab === "labs" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    <span>Master Lab Catalog</span>
                  </button>

                  {/* Master Medicines & Pharmacy Governance (Module 12) */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("medicines");
                      setMobileSidebarOpen(false);
                    }}
                    className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer ${activeTab === "medicines"
                      ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                  >
                    <svg className={`w-4 h-4 shrink-0 ${activeTab === "medicines" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <span>Master Medicine Catalog</span>
                  </button>
                </div>
              </div>

              {/* Audit & Communications */}
              <div>
                <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Audit &amp; Communications
                </p>
                <div className="space-y-1">
                  {/* System Notifications & Outbox */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("notifications");
                      setMobileSidebarOpen(false);
                    }}
                    className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer ${activeTab === "notifications"
                      ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                  >
                    <svg className={`w-4 h-4 shrink-0 ${activeTab === "notifications" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span>Email &amp; Outbox History</span>
                  </button>
                </div>
              </div>
            </nav>

          {/* User Profile Card at Sidebar Bottom */}
          <div className="p-3 border-t border-slate-200 bg-slate-50/50">
            <div className="flex items-center space-x-2.5 p-2 rounded-md">
              <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-semibold text-xs flex items-center justify-center shrink-0">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-semibold text-slate-900 block truncate">
                  {session.user.fullName}
                </span>
                <span className="text-[10px] text-slate-500 font-mono block">
                  Root UID #{session.user.id}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="text-slate-400 hover:text-rose-600 p-1.5 rounded transition cursor-pointer"
                title="Sign out of console"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </aside>

        {/* ======================= MAIN CONTENT WRAPPER ======================= */}
        <div className="flex-1 flex flex-col min-w-0 h-full bg-slate-50 overflow-hidden">
          {/* Unified Enterprise Header (56px) */}
          <header className="h-14 shrink-0 bg-white border-b border-slate-200 px-6 lg:px-8 flex items-center justify-between shadow-2xs z-20">
            <div className="flex items-center space-x-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                className="md:hidden p-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {/* Breadcrumb Path */}
              <div className="flex items-center space-x-2 text-xs min-w-0">
                <span className="text-slate-400 font-medium">HealthMesh</span>
                <span className="text-slate-300">/</span>
                <span className="text-slate-500 font-medium truncate hidden sm:inline">
                  Central Authority
                </span>
                <span className="text-slate-300 hidden sm:inline">/</span>
                <span className="font-semibold text-slate-900 truncate">
                  {tabTitles[activeTab]}
                </span>
              </div>
            </div>

            {/* Useful & Attractive Operational Utilities */}
            <div className="flex items-center space-x-3 shrink-0">
              {/* Shift / System Clock */}
              <div className="hidden lg:flex items-center space-x-1.5 px-2.5 py-1 rounded bg-slate-50 border border-slate-200 text-[11px] font-mono text-slate-600">
                <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>
                  {currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>

              {/* Live Operational Status Badge */}
              <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-sky-50 border border-sky-200 text-sky-800 text-[11px] font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-600 animate-pulse"></span>
                <span>Central Mesh Active</span>
              </div>

              {/* Operator Identity Chip */}
              <div className="hidden sm:flex items-center space-x-2 pl-2 border-l border-slate-200">
                <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  Root UID #{session.user.id}
                </span>
              </div>
            </div>
          </header>

          {/* Dynamic Page Main Content */}
          <main className="flex-1 overflow-y-auto p-6 w-full">
            {flashMessage && (
              <div className="mb-5 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md text-xs flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span className="font-medium">{flashMessage}</span>
                </div>
                <button
                  onClick={() => setFlashMessage(null)}
                  className="text-emerald-700 hover:text-emerald-900 font-bold ml-4"
                >
                  ✕
                </button>
              </div>
            )}

            {activeTab === "hospitals" && <Hospitals token={session.token} />}
            {activeTab === "users" && (
              <UserManagement
                token={session.token}
                currentUserId={session.user.id}
              />
            )}
            {activeTab === "approvals" && (
              <PendingApprovals token={session.token} />
            )}
            {activeTab === "locations" && (
              <Locations token={session.token} />
            )}
            {activeTab === "departments" && (
              <DepartmentsAndDesignations token={session.token} />
            )}
            {activeTab === "labs" && (
              <MasterLabCatalog token={session.token} />
            )}
            {activeTab === "medicines" && (
              <MasterMedicineCatalog token={session.token} />
            )}
            {activeTab === "notifications" && (
              <NotificationHistory token={session.token} />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}