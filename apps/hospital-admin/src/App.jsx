import { useEffect, useState, lazy, Suspense } from "react";
import Login from "./pages/Login";
import Hospitals from "./pages/Hospitals";
import PendingApprovals from "./pages/PendingApprovals";
import PatientRegistration from "./pages/PatientRegistration";
import OtpVerificationModal from "./pages/OtpVerificationModal";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ChangePasswordModal from "./pages/ChangePasswordModal";
import HeaderClock from "./components/HeaderClock";
import LoadingSpinner from "./components/LoadingSpinner";

// Route-based code-split lazy loaded components
const UserManagement = lazy(() => import("./pages/UserManagement"));
const HospitalDepartments = lazy(() => import("./pages/HospitalDepartments"));
const NotificationHistory = lazy(() => import("./pages/NotificationHistory"));
const AdmissionManagement = lazy(() => import("./pages/AdmissionManagement"));
const WardBedManagement = lazy(() => import("./pages/WardBedManagement"));
const HospitalLabTests = lazy(() => import("./pages/HospitalLabTests"));
const HospitalPharmacy = lazy(() => import("./pages/HospitalPharmacy"));
const PrescriptionRegistry = lazy(() => import("./pages/PrescriptionRegistry"));
const PharmacyReports = lazy(() => import("./pages/PharmacyReports"));
const AiHospitalAssistant = lazy(() => import("./pages/AiHospitalAssistant"));
const AiOperationalAnalytics = lazy(() => import("./pages/AiOperationalAnalytics"));
const AiAutomatedReports = lazy(() => import("./pages/AiAutomatedReports"));
const AiWorkflowNotificationCenter = lazy(() => import("./pages/AiWorkflowNotificationCenter"));
const HospitalDigitalTwinDashboard = lazy(() => import("./pages/HospitalDigitalTwinDashboard"));
const WardBedDigitalTwin = lazy(() => import("./pages/WardBedDigitalTwin"));
const PatientFlowDigitalTwin = lazy(() => import("./pages/PatientFlowDigitalTwin"));
const DigitalTwinSimulationCenter = lazy(() => import("./pages/DigitalTwinSimulationCenter"));
const FloorplanHeatmapDigitalTwin = lazy(() => import("./pages/FloorplanHeatmapDigitalTwin"));
const OtSurgicalSuiteDigitalTwin = lazy(() => import("./pages/OtSurgicalSuiteDigitalTwin"));
const EmergencyIncidentCommandDigitalTwin = lazy(() => import("./pages/EmergencyIncidentCommandDigitalTwin"));
const DischargeReadinessDigitalTwin = lazy(() => import("./pages/DischargeReadinessDigitalTwin"));
const BiomedicalAssetDigitalTwin = lazy(() => import("./pages/BiomedicalAssetDigitalTwin"));
const InfectionControlDigitalTwin = lazy(() => import("./pages/InfectionControlDigitalTwin"));
const Hospital3DDigitalTwin = lazy(() => import("./pages/Hospital3DDigitalTwin"));

const PageFallback = () => (
  <div className="flex flex-col items-center justify-center min-h-[350px] p-8">
    <LoadingSpinner size="lg" color="sky" label="Loading application module..." />
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
import { disconnectSocket } from "./services/socket";

const CURRENT_ROLE = "hospital_admin";

export default function App() {
  const [session, setSession] = useState(null);
  const [unauthView, setUnauthView] = useState("login"); // 'login' | 'register' | 'forgot' | 'reset'
  const [activeTab, setActiveTab] = useState("hospitals"); // 'hospitals' | 'approvals' | 'users' | 'departments'
  const [otpModal, setOtpModal] = useState(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [flashMessage, setFlashMessage] = useState(null);
  const [resetEmail, setResetEmail] = useState("");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Listen for unauthorized 401 events globally
  useEffect(() => {
    function handleUnauthorized(e) {
      disconnectSocket();
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
      setFlashMessage("Access denied: Only Hospital Admin accounts can sign in to this portal.");
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
    disconnectSocket();
    clearSession();
    setSession(null);
    setActiveTab("hospitals");
    setUnauthView("login");
  }

  // --- Unauthenticated Views ---
  if (!session) {
    return (
      <div className="min-h-screen w-full bg-slate-50 text-slate-900 font-sans relative">
        {flashMessage && (
          <div className="fixed top-4 right-4 z-50 p-3 bg-white border border-emerald-200 text-emerald-800 text-xs rounded-md shadow-md flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
            <span className="font-medium">{flashMessage}</span>
            <button
              onClick={() => setFlashMessage(null)}
              className="ml-3 text-slate-400 hover:text-slate-600 font-bold"
            >
              ×
            </button>
          </div>
        )}

        <div className="w-full">
          {unauthView === "login" && (
            <Login
              onLogin={handleLogin}
              onNavigateRegister={() => setUnauthView("register")}
              onNavigateForgot={() => setUnauthView("forgot")}
              currentRole={CURRENT_ROLE}
            />
          )}

          {unauthView === "register" && (
            <PatientRegistration
              onRegistered={(email) => {
                setOtpModal({ email, purpose: "email_verification" });
              }}
              onBackToLogin={() => setUnauthView("login")}
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
                setFlashMessage("Password reset successful. Please sign in with your new password.");
                setUnauthView("login");
              }}
              onBackToLogin={() => setUnauthView("login")}
            />
          )}
        </div>

        {otpModal && (
          <OtpVerificationModal
            email={otpModal.email}
            purpose={otpModal.purpose}
            onSuccess={() => {
              setOtpModal(null);
              setFlashMessage("Email verification complete! You can now sign in.");
              setUnauthView("login");
            }}
            onCancel={() => setOtpModal(null)}
          />
        )}
      </div>
    );
  }

  // --- Authenticated Layout ---
  const isSuperAdmin = session.user.role === "super_admin";
  const isHospitalAdmin = session.user.role === "hospital_admin";
  const mustChangePassword = Boolean(session.user.mustChangePassword);

  const initials = session.user.fullName
    ? session.user.fullName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
    : "HA";

  const tabTitles = {
    hospitals: "Facility Profile & Setup",
    approvals: "Pending Staff & Personnel Approvals",
    users: "User Lifecycle & RBAC Governance",
    departments: "Clinical Departments & Units",
    labs: "Hospital Laboratory Test Offerings",
    pharmacy: "Hospital Pharmacy Formulary & Inventory",
    prescriptions: "Prescription Registry & History",
    pharmacy_reports: "Transaction History & Audit Reports",
    reports: "Transaction History & Audit Reports",
    admissions: "Inpatient Patient Admissions",
    wards: "Ward & Bed Management",
    notifications: "Notification Outbox & Delivery History",
    ai_assistant: "AI Hospital Operational Assistant",
    ai_analytics: "AI Operational Intelligence & Analytics",
    ai_reports: "AI Automated Operational Reports",
    ai_automation: "AI Workflow Suggestions & Automation Matrix",
    twin_dashboard: "Hospital Digital Twin — Command Center",
    twin_3d: "Hospital 3D Spatial Digital Twin & WebGL Model",
    twin_floorplan: "Spatial Floorplan & Congestion Heatmap Twin",
    twin_ot: "Operation Theater (OT) & PACU Surgical Suite Twin",
    twin_emergency: "Emergency Code Blue & Disaster Incident Twin",
    twin_discharge: "AI Discharge Readiness & Bed Liberation Twin",
    twin_assets: "Biomedical Equipment & IoT Asset Tracking Twin",
    twin_infection: "Infection Control & Outbreak Surveillance Twin",
    twin_wards: "Inpatient Wards & Spatial Bed Digital Twin",
    twin_flow: "10-Stage Patient Operational Journey",
    twin_simulation: "Digital Twin What-If Simulation Sandbox",
  };

  return (
    <div className="h-screen w-full bg-slate-50 text-slate-900 flex font-sans overflow-hidden">
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
            setFlashMessage("Security password updated successfully.");
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
            setFlashMessage("Security password updated successfully.");
          }}
          onClose={() => setShowChangePassword(false)}
        />
      )}

      {/* Mobile backdrop */}
      {mobileSidebarOpen && (
        <div
          onClick={() => setMobileSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs md:hidden"
        ></div>
      )}

      {/* ======================= ENTERPRISE ANCHORED SIDEBAR ======================= */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 h-screen md:h-full w-64 bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 transition-transform duration-200 ease-in-out ${mobileSidebarOpen
          ? "translate-x-0"
          : "-translate-x-full md:translate-x-0"
          }`}
      >
        {/* Top Brand Header (STICKY / ANCHORED AT TOP) */}
        <div className="h-14 px-5 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white z-10">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-8 h-8 rounded-md bg-sky-600 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div className="flex min-w-0 flex-col justify-center">
              <span className="font-bold text-sm text-slate-900 block leading-tight">
                HealthMesh
              </span>
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">
                Hospital Admin
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
                          <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2 whitespace-nowrap" title="Facility & User Administration">
                            Facility &amp; User Administration
                          </p>
                          <div className="space-y-1">
                            {/* Facility Profile */}
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab("hospitals");
                                setMobileSidebarOpen(false);
                              }}
                              title="Facility Profile & Setup"
                              className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${activeTab === "hospitals"
                                ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                }`}
                            >
                              <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "hospitals" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                              </svg>
                              <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Facility Profile & Setup">Facility Profile &amp; Setup</span>
                            </button>

                            {/* Pending Approvals */}
                            {isHospitalAdmin && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab("approvals");
                                  setMobileSidebarOpen(false);
                                }}
                                title="Staff Approvals"
                                className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${activeTab === "approvals"
                                  ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                  }`}
                              >
                                <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "approvals" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                                <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Staff Approvals">Staff Approvals</span>
                              </button>
                            )}

                            {/* User Lifecycle */}
                            {(isHospitalAdmin || isSuperAdmin) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab("users");
                                  setMobileSidebarOpen(false);
                                }}
                                title="User Management & RBAC"
                                className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${activeTab === "users"
                                  ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                  }`}
                              >
                                <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "users" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                                <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="User Management & RBAC">User Management &amp; RBAC</span>
                              </button>
                            )}

                            {/* Departments */}
                            {isHospitalAdmin && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab("departments");
                                  setMobileSidebarOpen(false);
                                }}
                                title="Departments & Units"
                                className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${activeTab === "departments"
                                  ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                  }`}
                              >
                                <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "departments" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                </svg>
                                <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Departments & Units">Departments &amp; Units</span>
                              </button>
                            )}
                          </div>
                      </div>

                      {/* Clinical & Ancillary Services */}
                      <div>
                          <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2 whitespace-nowrap" title="Clinical & Ancillary Services">
                            Clinical &amp; Ancillary Services
                          </p>
                          <div className="space-y-1">
                            {/* Patient Inpatient Admissions */}
                            {(isHospitalAdmin || isSuperAdmin) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab("admissions");
                                  setMobileSidebarOpen(false);
                                }}
                                title="Patient Admissions"
                                className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${activeTab === "admissions"
                                  ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                  }`}
                              >
                                <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "admissions" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                                <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Patient Admissions">Patient Admissions</span>
                              </button>
                            )}

                            {/* Ward and Bed Management (Module 10) */}
                            {(isHospitalAdmin || isSuperAdmin) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab("wards");
                                  setMobileSidebarOpen(false);
                                }}
                                title="Wards & Bed Grid"
                                className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${activeTab === "wards"
                                  ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                  }`}
                              >
                                <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "wards" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                                </svg>
                                <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Wards & Bed Grid">Wards &amp; Bed Grid</span>
                              </button>
                            )}

                            {/* Laboratory Test Offerings (Module 11) */}
                            {(isHospitalAdmin || isSuperAdmin) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab("labs");
                                  setMobileSidebarOpen(false);
                                }}
                                title="Laboratory Offerings"
                                className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${activeTab === "labs"
                                  ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                  }`}
                              >
                                <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "labs" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                </svg>
                                <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Laboratory Offerings">Laboratory Offerings</span>
                              </button>
                            )}

                            {/* Pharmacy & Inventory (Module 12) */}
                            {(isHospitalAdmin || isSuperAdmin) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab("pharmacy");
                                  setMobileSidebarOpen(false);
                                }}
                                title="Pharmacy & Formulary"
                                className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${activeTab === "pharmacy"
                                  ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                  }`}
                              >
                                <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "pharmacy" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                </svg>
                                <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Pharmacy & Formulary">Pharmacy &amp; Formulary</span>
                              </button>
                            )}

                            {/* Prescription Registry & History */}
                            {(isHospitalAdmin || isSuperAdmin) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab("prescriptions");
                                  setMobileSidebarOpen(false);
                                }}
                                title="Prescription Registry & History"
                                className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${activeTab === "prescriptions"
                                  ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                  }`}
                              >
                                <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "prescriptions" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Prescription Registry & History">Prescription Registry &amp; History</span>
                              </button>
                            )}
                          </div>
                      </div>

                      {/* Audit & Communications */}
                      <div>
                          <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2 whitespace-nowrap" title="Audit & Communications">
                            Audit &amp; Communications
                          </p>
                          <div className="space-y-1">
                            {/* Transaction History & Reports */}
                            {(isHospitalAdmin || isSuperAdmin) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab("pharmacy_reports");
                                  setMobileSidebarOpen(false);
                                }}
                                title="Transaction History & Reports"
                                className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${activeTab === "pharmacy_reports" || activeTab === "reports"
                                  ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                  }`}
                              >
                                <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "pharmacy_reports" || activeTab === "reports" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Transaction History & Reports">Transaction History &amp; Reports</span>
                              </button>
                            )}

                            {/* Notifications & Outbox */}
                            {(isHospitalAdmin || isSuperAdmin) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab("notifications");
                                  setMobileSidebarOpen(false);
                                }}
                                title="Email & Outbox History"
                                className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${activeTab === "notifications"
                                  ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                  }`}
                              >
                                <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "notifications" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                                <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Email & Outbox History">Email &amp; Outbox History</span>
                              </button>
                            )}
                          </div>
                      </div>

                      {/* AI Hospital Intelligence Module */}
                      <div>
                          <div className="px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between min-w-0">
                            <span className="truncate flex-1 min-w-0" title="AI Hospital Intelligence">AI Hospital Intelligence</span>
                            <span className="text-[9px] bg-sky-100 text-sky-800 px-1.5 py-0.2 rounded font-bold shrink-0 ml-1">AI</span>
                          </div>
                          <div className="space-y-1">
                            {/* AI Assistant */}
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab("ai_assistant");
                                setMobileSidebarOpen(false);
                              }}
                              title="AI Hospital Assistant"
                              className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${activeTab === "ai_assistant"
                                ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                }`}
                            >
                              <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "ai_assistant" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                              </svg>
                              <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="AI Hospital Assistant">AI Hospital Assistant</span>
                            </button>

                            {/* AI Operational Analytics */}
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab("ai_analytics");
                                setMobileSidebarOpen(false);
                              }}
                              title="Operational Analytics"
                              className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${activeTab === "ai_analytics"
                                ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                }`}
                            >
                              <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "ai_analytics" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                              </svg>
                              <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Operational Analytics">Operational Analytics</span>
                            </button>

                            {/* AI Automated Reports */}
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab("ai_reports");
                                setMobileSidebarOpen(false);
                              }}
                              title="Automated Reports"
                              className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${activeTab === "ai_reports"
                                ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                }`}
                            >
                              <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "ai_reports" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Automated Reports">Automated Reports</span>
                            </button>

                            {/* AI Workflow Suggestions & Matrix */}
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab("ai_automation");
                                setMobileSidebarOpen(false);
                              }}
                              title="Workflow & Opportunities"
                              className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${activeTab === "ai_automation"
                                ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                }`}
                            >
                              <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "ai_automation" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                              <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Workflow & Opportunities">Workflow &amp; Opportunities</span>
                            </button>
                          </div>
                        </div>

                        {/* Hospital Digital Twin Module */}
                        <div>
                            <div className="px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between min-w-0">
                              <span className="truncate flex-1 min-w-0" title="Hospital Digital Twin">Hospital Digital Twin</span>
                              <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-bold shrink-0 ml-1">TWIN</span>
                            </div>
                            <div className="space-y-1">
                              {/* Digital Twin Command Center */}
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab("twin_dashboard");
                                  setMobileSidebarOpen(false);
                                }}
                                title="Twin Command Center"
                                className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${activeTab === "twin_dashboard"
                                  ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                  }`}
                              >
                                <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "twin_dashboard" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                                <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Twin Command Center">Twin Command Center</span>
                              </button>

                              {/* 3D Spatial Digital Twin */}
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab("twin_3d");
                                  setMobileSidebarOpen(false);
                                }}
                                title="3D Spatial Digital Twin (WebGL)"
                                className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${activeTab === "twin_3d"
                                  ? "bg-indigo-50 text-indigo-700 font-semibold border-l-2 border-indigo-600 shadow-xs"
                                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                  }`}
                              >
                                <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "twin_3d" ? "text-indigo-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                </svg>
                                <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="3D Spatial Twin">3D Spatial Twin</span>
                                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 border border-indigo-200">3D</span>
                              </button>

                              {/* Spatial Floorplan & Heatmap Twin */}
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab("twin_floorplan");
                                  setMobileSidebarOpen(false);
                                }}
                                title="Spatial Floorplan & Heatmap"
                                className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${activeTab === "twin_floorplan"
                                  ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                  }`}
                              >
                                <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "twin_floorplan" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                </svg>
                                <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Spatial Floorplan & Heatmap">Floorplan &amp; Heatmap</span>
                              </button>

                              {/* Operation Theater & PACU Twin */}
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab("twin_ot");
                                  setMobileSidebarOpen(false);
                                }}
                                title="OT & PACU Surgical Suite Twin"
                                className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${activeTab === "twin_ot"
                                  ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                  }`}
                              >
                                <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "twin_ot" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                </svg>
                                <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="OT & PACU Surgical Suite">OT &amp; PACU Surgical Twin</span>
                              </button>

                              {/* Emergency Code Blue & Disaster Twin */}
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab("twin_emergency");
                                  setMobileSidebarOpen(false);
                                }}
                                title="Emergency Code Blue & Disaster Incident Twin"
                                className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${activeTab === "twin_emergency"
                                  ? "bg-rose-50 text-rose-700 font-semibold border-l-2 border-rose-600"
                                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                  }`}
                              >
                                <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "twin_emergency" ? "text-rose-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Emergency Code Blue & Disaster Twin">Code Blue &amp; Disaster Twin</span>
                              </button>

                              {/* Discharge Readiness & Bed Liberation Twin */}
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab("twin_discharge");
                                  setMobileSidebarOpen(false);
                                }}
                                title="AI Discharge Readiness & Bed Liberation"
                                className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${activeTab === "twin_discharge"
                                  ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                  }`}
                              >
                                <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "twin_discharge" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                                <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Discharge Readiness & Bed Turnover">Discharge &amp; Bed Turnover</span>
                              </button>

                              {/* Biomedical Equipment & IoT Asset Tracking Twin */}
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab("twin_assets");
                                  setMobileSidebarOpen(false);
                                }}
                                title="Biomedical Equipment & IoT Asset Tracking"
                                className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${activeTab === "twin_assets"
                                  ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                  }`}
                              >
                                <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "twin_assets" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                                </svg>
                                <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Biomedical Equipment & Assets">Biomedical Assets Twin</span>
                              </button>

                              {/* Infection Control & Outbreak Twin (Feature 6) */}
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab("twin_infection");
                                  setMobileSidebarOpen(false);
                                }}
                                title="Infection & Outbreak Twin"
                                className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${activeTab === "twin_infection"
                                  ? "bg-rose-50 text-rose-700 font-semibold border-l-2 border-rose-600"
                                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                  }`}
                              >
                                <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "twin_infection" ? "text-rose-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Infection Control & Outbreak Twin">Infection & Outbreak Twin</span>
                              </button>

                              {/* Ward & Bed Digital Twin */}
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab("twin_wards");
                                  setMobileSidebarOpen(false);
                                }}
                                title="Wards & Spatial Beds"
                                className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${activeTab === "twin_wards"
                                  ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                  }`}
                              >
                                <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "twin_wards" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                                </svg>
                                <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Wards & Spatial Beds">Wards &amp; Spatial Beds</span>
                              </button>

                              {/* Patient Flow Journey */}
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab("twin_flow");
                                  setMobileSidebarOpen(false);
                                }}
                                title="Patient Flow Pipeline"
                                className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${activeTab === "twin_flow"
                                  ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                  }`}
                              >
                                <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "twin_flow" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                                <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Patient Flow Pipeline">Patient Flow Pipeline</span>
                              </button>

                              {/* What-If Simulation Sandbox */}
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab("twin_simulation");
                                  setMobileSidebarOpen(false);
                                }}
                                title="What-If Simulations"
                                className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${activeTab === "twin_simulation"
                                  ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                  }`}
                              >
                                <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "twin_simulation" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                </svg>
                                <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="What-If Simulations">What-If Simulations</span>
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
                              Hospital Admin {session.user.hospitalId ? `#H${session.user.hospitalId}` : `#${session.user.id}`}
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
                      <header className="h-14 shrink-0 bg-white px-6 lg:px-8 flex items-center justify-between border-b border-slate-200 shadow-2xs z-20">
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
                              {session.user.hospitalName || "Hospital Facility"}
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
                          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-sky-50 border border-sky-200 text-sky-800 text-[11px] font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-600 animate-pulse"></span>
                            <span>Node #{session.user.hospitalId ? `H${session.user.hospitalId}` : session.user.id} Online</span>
                          </div>

                          {/* Operator Identity Chip */}
                          <div className="hidden sm:flex items-center space-x-2 pl-2 border-l border-slate-200">
                            <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              Admin #{session.user.id}
                            </span>
                          </div>
                        </div>
                      </header>

                      {/* Dynamic Main Body Content */}
                      <main
                        className={`flex-1 min-h-0 w-full ${activeTab === "ai_assistant"
                          ? "p-3 sm:p-4 overflow-hidden flex flex-col"
                          : "p-6 overflow-y-auto"
                          }`}
                      >
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
                              ×
                            </button>
                          </div>
                        )}

                        <Suspense fallback={<PageFallback />}>
                        {activeTab === "hospitals" && <Hospitals token={session.token} />}

                        {activeTab === "approvals" && isHospitalAdmin && (
                          <PendingApprovals token={session.token} />
                        )}

                        {activeTab === "users" && (isHospitalAdmin || isSuperAdmin) && (
                          <UserManagement
                            token={session.token}
                            currentUserId={session.user.id}
                            hospitalId={session.user.hospitalId}
                          />
                        )}

                        {activeTab === "departments" && isHospitalAdmin && (
                          <HospitalDepartments
                            token={session.token}
                            hospitalId={session.user.hospitalId}
                            hospitalName={session.user.hospitalName}
                          />
                        )}

                        {activeTab === "labs" && (
                          <HospitalLabTests session={session} />
                        )}

                        {activeTab === "pharmacy" && (
                          <HospitalPharmacy session={session} />
                        )}

                        {activeTab === "prescriptions" && (
                          <PrescriptionRegistry session={session} />
                        )}

                        {(activeTab === "pharmacy_reports" || activeTab === "reports") && (
                          <PharmacyReports session={session} />
                        )}

                        {activeTab === "admissions" && (
                          <AdmissionManagement session={session} />
                        )}

                        {activeTab === "wards" && (
                          <WardBedManagement session={session} />
                        )}

                        {activeTab === "notifications" && (
                          <NotificationHistory token={session.token} />
                        )}

                        {/* AI Hospital Intelligence Views */}
                        {activeTab === "ai_assistant" && (
                          <AiHospitalAssistant session={session} />
                        )}

                        {activeTab === "ai_analytics" && (
                          <AiOperationalAnalytics session={session} />
                        )}

                        {activeTab === "ai_reports" && (
                          <AiAutomatedReports session={session} />
                        )}

                        {activeTab === "ai_automation" && (
                          <AiWorkflowNotificationCenter session={session} />
                        )}

                        {/* Hospital Digital Twin Views */}
                        {activeTab === "twin_dashboard" && (
                          <HospitalDigitalTwinDashboard session={session} />
                        )}

                        {activeTab === "twin_3d" && (
                          <Hospital3DDigitalTwin session={session} />
                        )}

                        {activeTab === "twin_floorplan" && (
                          <FloorplanHeatmapDigitalTwin session={session} />
                        )}

                        {activeTab === "twin_ot" && (
                          <OtSurgicalSuiteDigitalTwin session={session} />
                        )}

                        {activeTab === "twin_emergency" && (
                          <EmergencyIncidentCommandDigitalTwin session={session} />
                        )}

                        {activeTab === "twin_discharge" && (
                          <DischargeReadinessDigitalTwin session={session} />
                        )}

                        {activeTab === "twin_assets" && (
                          <BiomedicalAssetDigitalTwin session={session} />
                        )}

                        {activeTab === "twin_infection" && (
                          <InfectionControlDigitalTwin session={session} />
                        )}

                        {activeTab === "twin_wards" && (
                          <WardBedDigitalTwin session={session} />
                        )}

                        {activeTab === "twin_flow" && (
                          <PatientFlowDigitalTwin session={session} />
                        )}

                        {activeTab === "twin_simulation" && (
                          <DigitalTwinSimulationCenter session={session} />
                        )}
                        </Suspense>
                      </main>
                    </div>
                  </div>
                  );
}
