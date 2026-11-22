import { useEffect, useState } from "react";
import Login from "./pages/Login";
import StaffDashboard from "./pages/StaffDashboard";
import ConsultationBillingDesk from "./pages/ConsultationBillingDesk";
import AdmissionManagement from "./pages/AdmissionManagement";
import WardBedManagement from "./pages/WardBedManagement";
import LaboratoryManagement from "./pages/LaboratoryManagement";
import PharmacyManagement from "./pages/PharmacyManagement";
import PharmacyReports from "./pages/PharmacyReports";
import Hospitals from "./pages/Hospitals";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ChangePasswordModal from "./pages/ChangePasswordModal";
import StaffProfile from "./pages/StaffProfile";
import HospitalDigitalTwinDashboard from "./pages/HospitalDigitalTwinDashboard";
import PatientFlowDigitalTwin from "./pages/PatientFlowDigitalTwin";
import WardBedDigitalTwin from "./pages/WardBedDigitalTwin";
import DigitalTwinSimulationCenter from "./pages/DigitalTwinSimulationCenter";
import FloorplanHeatmapDigitalTwin from "./pages/FloorplanHeatmapDigitalTwin";
import OtSurgicalSuiteDigitalTwin from "./pages/OtSurgicalSuiteDigitalTwin";
import EmergencyIncidentCommandDigitalTwin from "./pages/EmergencyIncidentCommandDigitalTwin";
import DischargeReadinessDigitalTwin from "./pages/DischargeReadinessDigitalTwin";
import BiomedicalAssetDigitalTwin from "./pages/BiomedicalAssetDigitalTwin";
import InfectionControlDigitalTwin from "./pages/InfectionControlDigitalTwin";
import AiHospitalAssistant from "./pages/AiHospitalAssistant";
import AiOperationalAnalytics from "./pages/AiOperationalAnalytics";
import AiAutomatedReports from "./pages/AiAutomatedReports";
import AiWorkflowNotificationCenter from "./pages/AiWorkflowNotificationCenter";
import {
  PORTALS,
  redirectIfForeignRole,
  consumeIncomingSession,
  getSession,
  saveSession,
  clearSession,
} from "./services/portalConfig";
import { disconnectSocket } from "./services/socket";

const CURRENT_ROLE = "staff";

export default function App() {
  const [session, setSession] = useState(null);
  const [unauthView, setUnauthView] = useState("login");
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined") {
      const tabParam = new URLSearchParams(window.location.search).get("tab");
      if (tabParam) return tabParam;
    }
    return "dashboard";
  });
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
      setFlashMessage("Access denied: Only Staff accounts can sign in to this portal.");
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
    : "ST";

  const tabTitles = {
    dashboard: "Front Desk Operations & Patient Intake",
    "consultation-billing": "Consultation Billing Desk",
    admissions: "Patient Inpatient Admission Management",
    wards: "Ward & Bed Management",
    laboratory: "Laboratory Queue & Sample Desk",
    dispensing: "Prescriptions & Dispensing (FEFO POS)",
    prescriptions: "Prescription Registry & Lifecycle History",
    billing: "Pharmacy Billing & Invoices (12% Statutory GST)",
    pharmacy: "Pharmacy & Inventory Management",
    pharmacy_reports: "Pharmacy Transaction History & Audit Reporting",
    profile: "My Staff Profile & Permissions",
    hospitals: "Hospital Facilities Directory",
    ai_assistant: "AI Hospital Operational Assistant",
    ai_analytics: "AI Operational Intelligence & Analytics",
    ai_reports: "AI Automated Operational Reports",
    ai_automation: "AI Workflow Suggestions & Automation Matrix",
    twin_dashboard: "Hospital Digital Twin — Command Center",
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
        {/* Top Brand Header (STICKY / ANCHORED AT TOP) */}
        <div className="h-14 px-5 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white z-10">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-8 h-8 rounded-md bg-amber-600 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div className="flex min-w-0 flex-col justify-center">
              <span className="font-bold text-sm text-slate-900 block leading-tight">
                HealthMesh
              </span>
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">
                Staff Operational Desk
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
            {/* Front Desk & Patient Flow */}
            <div>
              <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 truncate" title="Patient Admissions & Flow">
                Patient Admissions &amp; Flow
              </p>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("dashboard");
                    setMobileSidebarOpen(false);
                  }}
                  title="Reception & Queue"
                  className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${
                    activeTab === "dashboard"
                      ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "dashboard" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Reception & Queue">Reception &amp; Queue</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("consultation-billing");
                    setMobileSidebarOpen(false);
                  }}
                  title="Consultation Billing"
                  className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${
                    activeTab === "consultation-billing"
                      ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "consultation-billing" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Consultation Billing">Consultation Billing</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("admissions");
                    setMobileSidebarOpen(false);
                  }}
                  title="Patient Admissions"
                  className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${
                    activeTab === "admissions"
                      ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "admissions" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Patient Admissions">Patient Admissions</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("wards");
                    setMobileSidebarOpen(false);
                  }}
                  title="Wards & Bed Grid"
                  className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${
                    activeTab === "wards"
                      ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "wards" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                  <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Wards & Bed Grid">Wards &amp; Bed Grid</span>
                </button>
              </div>
            </div>

            {/* Clinical & Ancillary Services */}
            <div>
              <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 truncate" title="Clinical Services">
                Clinical Services
              </p>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("laboratory");
                    setMobileSidebarOpen(false);
                  }}
                  title="Laboratory Queue"
                  className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${
                    activeTab === "laboratory"
                      ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "laboratory" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                  <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Laboratory Queue">Laboratory Queue</span>
                </button>
              </div>
            </div>

            {/* Prescriptions & Pharmacy Desk */}
            <div>
              <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 truncate" title="Pharmacy & Prescriptions">
                Pharmacy &amp; Prescriptions
              </p>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("dispensing");
                    setMobileSidebarOpen(false);
                  }}
                  title="Prescriptions & Dispensing"
                  className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${
                    activeTab === "dispensing"
                      ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "dispensing" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Prescriptions & Dispensing">Prescriptions &amp; Dispensing</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("prescriptions");
                    setMobileSidebarOpen(false);
                  }}
                  title="Prescription Registry"
                  className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${
                    activeTab === "prescriptions"
                      ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "prescriptions" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Prescription Registry">Prescription Registry</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("billing");
                    setMobileSidebarOpen(false);
                  }}
                  title="Billing & Invoices (12% GST)"
                  className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${
                    activeTab === "billing"
                      ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "billing" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Billing & Invoices (12% GST)">Billing &amp; Invoices (12% GST)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("pharmacy");
                    setMobileSidebarOpen(false);
                  }}
                  title="Pharmacy & Inventory"
                  className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${
                    activeTab === "pharmacy"
                      ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "pharmacy" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Pharmacy & Inventory">Pharmacy &amp; Inventory</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("pharmacy_reports");
                    setMobileSidebarOpen(false);
                  }}
                  title="Transactions & Reports"
                  className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${
                    activeTab === "pharmacy_reports"
                      ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "pharmacy_reports" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Transactions & Reports">Transactions &amp; Reports</span>
                </button>
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
                  className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${
                    activeTab === "ai_assistant"
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
                  className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${
                    activeTab === "ai_analytics"
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
                  className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${
                    activeTab === "ai_reports"
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
                  className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${
                    activeTab === "ai_automation"
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
              <div className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between min-w-0">
                <span className="truncate flex-1 min-w-0" title="Hospital Digital Twin">Hospital Digital Twin</span>
                <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold shrink-0 ml-1">TWIN</span>
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
                  className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${
                    activeTab === "twin_dashboard"
                      ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "twin_dashboard" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Twin Command Center">Twin Command Center</span>
                </button>

                {/* Spatial Floorplan & Heatmap Twin */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("twin_floorplan");
                    setMobileSidebarOpen(false);
                  }}
                  title="Spatial Floorplan & Heatmap"
                  className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${
                    activeTab === "twin_floorplan"
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
                  className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${
                    activeTab === "twin_ot"
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
                  className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${
                    activeTab === "twin_emergency"
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
                  className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${
                    activeTab === "twin_discharge"
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
                  className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${
                    activeTab === "twin_assets"
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
                  className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${
                    activeTab === "twin_infection"
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
                  className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${
                    activeTab === "twin_wards"
                      ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "twin_wards" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                  <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Wards & Spatial Beds">Wards &amp; Spatial Beds</span>
                </button>

                {/* Patient Flow Pipeline */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("twin_flow");
                    setMobileSidebarOpen(false);
                  }}
                  title="Patient Flow Pipeline"
                  className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${
                    activeTab === "twin_flow"
                      ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "twin_flow" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                  <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Patient Flow Pipeline">Patient Flow Pipeline</span>
                </button>

                {/* What-If Simulations */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("twin_simulation");
                    setMobileSidebarOpen(false);
                  }}
                  title="What-If Simulations"
                  className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${
                    activeTab === "twin_simulation"
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

            {/* Hospital Operations & Administration */}
            <div>
              <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 truncate" title="Operations & Setup">
                Operations &amp; Setup
              </p>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("hospitals");
                    setMobileSidebarOpen(false);
                  }}
                  title="Facility Directory"
                  className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${
                    activeTab === "hospitals"
                      ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "hospitals" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="Facility Directory">Facility Directory</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("profile");
                    setMobileSidebarOpen(false);
                  }}
                  title="My Profile & Permissions"
                  className={`w-full min-w-0 flex items-center space-x-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer text-left ${
                    activeTab === "profile"
                      ? "bg-sky-50 text-sky-700 font-semibold border-l-2 border-sky-600"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <svg className={`w-4 h-4 shrink-0 flex-shrink-0 ${activeTab === "profile" ? "text-sky-600" : "text-slate-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="flex-1 min-w-0 truncate whitespace-nowrap overflow-hidden" title="My Profile & Permissions">My Profile &amp; Permissions</span>
                </button>
              </div>
            </div>
          </nav>

        {/* User Profile Card at Sidebar Bottom */}
        <div className="p-3 border-t border-slate-200 bg-slate-50/50 shrink-0">
          <div className="flex items-center space-x-2.5 p-2 rounded-md">
            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-semibold text-xs flex items-center justify-center shrink-0">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-xs font-semibold text-slate-900 block truncate">
                {session.user.fullName}
              </span>
              <span className="text-[10px] text-slate-500 font-mono block">
                Operational Staff #{session.user.id}
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
                Staff Operational Desk
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
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse"></span>
              <span>Desk Terminal Active</span>
            </div>

            {/* Operator Identity Chip */}
            <div className="hidden sm:flex items-center space-x-2 pl-2 border-l border-slate-200">
              <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                Staff #{session.user.id}
              </span>
            </div>
          </div>
        </header>

        {/* Workspace Body */}
        <main
          className={`flex-1 min-h-0 w-full ${
            activeTab === "ai_assistant"
              ? "p-3 sm:p-4 overflow-hidden flex flex-col"
              : "p-6 overflow-y-auto"
          }`}
        >
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

          {activeTab === "dashboard" && <StaffDashboard session={session} />}
          {activeTab === "consultation-billing" && <ConsultationBillingDesk session={session} />}
          {activeTab === "admissions" && <AdmissionManagement session={session} />}
          {activeTab === "wards" && <WardBedManagement session={session} />}
          {activeTab === "laboratory" && <LaboratoryManagement session={session} />}
          {activeTab === "dispensing" && (
            <PharmacyManagement
              session={session}
              forcedSection="dispensing"
              onNavigate={setActiveTab}
            />
          )}
          {activeTab === "prescriptions" && (
            <PharmacyManagement
              session={session}
              forcedSection="prescriptions"
              onNavigate={setActiveTab}
            />
          )}
          {activeTab === "billing" && (
            <PharmacyManagement
              session={session}
              forcedSection="billing"
              onNavigate={setActiveTab}
            />
          )}
          {activeTab === "pharmacy" && (
            <PharmacyManagement
              session={session}
              forcedSection="pharmacy"
              onNavigate={setActiveTab}
            />
          )}
          {activeTab === "pharmacy_reports" && (
            <PharmacyReports session={session} />
          )}
          {activeTab === "profile" && <StaffProfile session={session} />}
          {activeTab === "hospitals" && <Hospitals token={session.token} />}

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
        </main>
      </div>
    </div>
  );
}