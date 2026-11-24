import { useEffect, useState, lazy, Suspense } from "react";
import Login from "./pages/Login";
import DoctorDashboard from "./pages/DoctorDashboard";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ChangePasswordModal from "./pages/ChangePasswordModal";
import HeaderClock from "./components/HeaderClock";
import LoadingSpinner from "./components/LoadingSpinner";

// Route-based code-split lazy loaded components
const DoctorProfile = lazy(() => import("./pages/DoctorProfile"));
const DoctorPrescriptions = lazy(() => import("./pages/DoctorPrescriptions"));
const Hospitals = lazy(() => import("./pages/Hospitals"));

const PageFallback = () => (
  <div className="flex flex-col items-center justify-center min-h-[300px] p-8">
    <LoadingSpinner size="lg" color="sky" label="Loading doctor module..." />
  </div>
);
import {
  PORTALS,
  redirectIfForeignRole,
  consumeIncomingSession,
  getSession,
  saveSession,
  clearSession,
} from "./services/portalConfig";

const CURRENT_ROLE = "doctor";

export default function App() {
  const [session, setSession] = useState(null);
  const [unauthView, setUnauthView] = useState("login");
  const [activeTab, setActiveTab] = useState("dashboard"); // 'dashboard' | 'hospitals'
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [flashMessage, setFlashMessage] = useState(null);
  const [resetEmail, setResetEmail] = useState("");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

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
      setFlashMessage("Access denied: Only Doctor accounts can sign in to this portal.");
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
    setActiveTab("dashboard");
    setUnauthView("login");
  }

  if (!session) {
    return (
      <div className="min-h-screen w-full bg-slate-50 flex flex-col justify-between text-slate-900 font-sans">
        {flashMessage && (
          <div className="fixed top-4 right-4 z-50 p-3 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs shadow-md flex items-center space-x-2">
            <svg
              className="w-4 h-4 text-emerald-600 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-medium">{flashMessage}</span>
            <button
              onClick={() => setFlashMessage(null)}
              className="ml-2 text-emerald-600 hover:text-emerald-900 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        <div className="flex-1 flex items-center justify-center">
          {unauthView === "login" && (
            <Login
              onLogin={handleLogin}
              onNavigateForgot={() => setUnauthView("forgot")}
              currentRole={CURRENT_ROLE}
            />
          )}

          {unauthView === "forgot" && (
            <ForgotPassword
              onRequestSuccess={(email) => {
                setResetEmail(email);
                setUnauthView("reset");
              }}
              onBackToLogin={() => setUnauthView("login")}
            />
          )}

          {unauthView === "reset" && (
            <ResetPassword
              defaultEmail={resetEmail}
              onResetSuccess={() => {
                setFlashMessage(
                  "Password has been reset successfully. Please sign in."
                );
                setUnauthView("login");
              }}
              onBackToLogin={() => setUnauthView("login")}
            />
          )}
        </div>
      </div>
    );
  }

  const mustChangePassword = Boolean(session.user.mustChangePassword);

  const initials = session.user.fullName
    ? session.user.fullName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
    : "DR";

  const tabTitles = {
    dashboard: "Physician Clinical Workstation & OPD Queue",
    prescriptions: "Prescription Registry & Clinical Hub",
    profile: "My Clinical Profile & Practice Fees",
    hospitals: "Hospital Network Directory",
  };

  return (
    <div className="h-screen w-full bg-slate-50 text-slate-900 flex font-sans overflow-hidden">
      {mustChangePassword && (
        <ChangePasswordModal
          token={session.token}
          isForced={true}
          onSuccess={(res) => {
            const updated = { token: res.token, user: res.user };
            saveSession(updated);
            setSession(updated);
            setFlashMessage("Security password updated successfully.");
          }}
        />
      )}

      {showChangePassword && !mustChangePassword && (
        <ChangePasswordModal
          token={session.token}
          isForced={false}
          onSuccess={(res) => {
            const updated = { token: res.token, user: res.user };
            saveSession(updated);
            setSession(updated);
            setShowChangePassword(false);
            setFlashMessage("Security password updated successfully.");
          }}
          onClose={() => setShowChangePassword(false)}
        />
      )}

      {mobileSidebarOpen && (
        <div
          onClick={() => setMobileSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs md:hidden"
        ></div>
      )}

      {/* ======================= ENTERPRISE ANCHORED SIDEBAR ======================= */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 h-screen md:h-full w-64 bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 transition-transform duration-200 ease-in-out ${
          mobileSidebarOpen
            ? "translate-x-0"
            : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="flex flex-col flex-1 overflow-y-auto">
          {/* Top Brand Header */}
          <div className="h-14 px-5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-md bg-teal-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <div>
                <span className="font-bold text-sm text-slate-900 block leading-tight">
                  HealthMesh
                </span>
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">
                  Doctor Workstation
                </span>
              </div>
            </div>

            <button
              onClick={() => setMobileSidebarOpen(false)}
              className="md:hidden text-slate-400 hover:text-slate-600 p-1"
            >
              ✕
            </button>
          </div>

          {/* Navigation Section */}
          <nav className="p-3 space-y-5 flex-1">
            {/* Clinical & Patient Care */}
            <div>
              <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Clinical &amp; Patient Care
              </p>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("dashboard");
                    setMobileSidebarOpen(false);
                  }}
                  className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer ${
                    activeTab === "dashboard"
                      ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <svg className={`w-4 h-4 shrink-0 ${activeTab === "dashboard" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                  <span>OPD Queue &amp; EHR</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("prescriptions");
                    setMobileSidebarOpen(false);
                  }}
                  className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer ${
                    activeTab === "prescriptions"
                      ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <svg className={`w-4 h-4 shrink-0 ${activeTab === "prescriptions" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Prescriptions Hub</span>
                </button>
              </div>
            </div>

            {/* Practice & Operations */}
            <div>
              <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Practice &amp; Operations
              </p>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("profile");
                    setMobileSidebarOpen(false);
                  }}
                  className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer ${
                    activeTab === "profile"
                      ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <svg className={`w-4 h-4 shrink-0 ${activeTab === "profile" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span>My Profile &amp; Fees</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("hospitals");
                    setMobileSidebarOpen(false);
                  }}
                  className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer ${
                    activeTab === "hospitals"
                      ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <svg className={`w-4 h-4 shrink-0 ${activeTab === "hospitals" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  <span>Facility Directory</span>
                </button>
              </div>
            </div>
          </nav>
        </div>

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
                Attending Physician #{session.user.id}
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

      {/* ======================= MAIN CONTENT AREA ======================= */}
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
                Physician Workstation
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
            <HeaderClock />

            {/* Live Operational Status Badge */}
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-teal-50 border border-teal-200 text-teal-800 text-[11px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-600 animate-pulse"></span>
              <span>Doctor Station Active</span>
            </div>

            {/* Operator Identity Chip */}
            <div className="hidden sm:flex items-center space-x-2 pl-2 border-l border-slate-200">
              <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                MD #{session.user.id}
              </span>
            </div>
          </div>
        </header>

        {/* Workspace Body */}
        <main className="flex-1 overflow-y-auto p-6 w-full">
          {flashMessage && (
            <div className="mb-4 p-3 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
              <span className="font-medium">{flashMessage}</span>
              <button
                onClick={() => setFlashMessage(null)}
                className="text-emerald-700 hover:text-emerald-900 font-bold ml-4"
              >
                ✕
              </button>
            </div>
          )}

          <Suspense fallback={<PageFallback />}>
          {activeTab === "dashboard" && <DoctorDashboard session={session} />}
          {activeTab === "prescriptions" && <DoctorPrescriptions session={session} />}
          {activeTab === "profile" && <DoctorProfile session={session} />}
          {activeTab === "hospitals" && <Hospitals token={session.token} />}
          </Suspense>
        </main>
      </div>
    </div>
  );
}