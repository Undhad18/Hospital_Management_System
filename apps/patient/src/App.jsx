import { useEffect, useState } from "react";
import Login from "./pages/Login";
import PatientDashboard from "./pages/PatientDashboard";
import MyAppointments from "./pages/MyAppointments";
import MedicalRecords from "./pages/MedicalRecords";
import BillsAndPayments from "./pages/BillsAndPayments";
import ProfileCompletion from "./pages/ProfileCompletion";
import PublicHome from "./pages/PublicHome";
import BookAppointmentModal from "./pages/BookAppointmentModal";
import PatientRegistration from "./pages/PatientRegistration";
import OtpVerificationModal from "./pages/OtpVerificationModal";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ChangePasswordModal from "./pages/ChangePasswordModal";
import { patientStore } from "./services/patientData";
import {
  redirectIfForeignRole,
  consumeIncomingSession,
  getSession,
  saveSession,
  clearSession,
} from "./services/portalConfig";

const CURRENT_ROLE = "patient";

export default function App() {
  const [session, setSession] = useState(null);
  const [unauthView, setUnauthView] = useState("home"); // 'home' | 'login' | 'register' | 'forgot' | 'reset'
  const [activeTab, setActiveTab] = useState("dashboard"); // 'dashboard' | 'appointments' | 'records' | 'bills' | 'profile'
  const [otpModal, setOtpModal] = useState(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [flashMessage, setFlashMessage] = useState(null);
  const [resetEmail, setResetEmail] = useState("");
  const [profile, setProfile] = useState(() => patientStore.getProfile());
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [profileGuardTriggered, setProfileGuardTriggered] = useState(false);

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

  // Sync profile when session changes
  useEffect(() => {
    if (session?.user?.fullName && profile.full_name !== session.user.fullName) {
      setProfile((prev) => ({
        ...prev,
        full_name: session.user.fullName,
        email: session.user.email || prev.email,
      }));
    }
  }, [session]);

  function handleLogin(result) {
    if (result.user?.role !== CURRENT_ROLE) {
      setFlashMessage("Access denied: Only Patient accounts can sign in to this portal.");
      return;
    }

    const newSession = {
      token: result.token,
      user: result.user,
    };
    saveSession(newSession);
    setSession(newSession);
    setFlashMessage(null);
    setProfile(patientStore.getProfile());
  }

  function handleLogout() {
    clearSession();
    setSession(null);
    setActiveTab("dashboard");
    setUnauthView("home");
  }

  function handleProfileUpdated(updated) {
    setProfile(updated);
    setProfileGuardTriggered(false);
    setFlashMessage("Your clinical profile and emergency baseline have been updated successfully.");
    setActiveTab("dashboard");
  }

  function handleOpenBooking() {
    // Mandatory Profile Guard check
    if (!profile.profile_completed) {
      setProfileGuardTriggered(true);
      setActiveTab("profile");
      setFlashMessage(
        "Mandatory Profile Guard: Please complete your demographic and medical baseline details before booking an appointment."
      );
      return;
    }
    setIsBookingOpen(true);
  }

  function handleBookingSuccess() {
    setIsBookingOpen(false);
    setActiveTab("appointments");
    setFlashMessage("Appointment booked successfully! Doctor confirmation pending (valid for 4 hours).");
  }

  // -------------------------------------------------------------------------
  // Unauthenticated Layout
  // -------------------------------------------------------------------------
  if (!session) {
    return (
      <div className="min-h-screen w-full bg-slate-50 flex flex-col justify-between text-slate-800 font-sans">
        {flashMessage && (
          <div className="fixed top-6 right-6 z-50 p-4 rounded-xl bg-white border border-rose-200 text-rose-700 text-xs font-semibold shadow-xl flex items-center space-x-2 animate-fade-in">
            <svg className="w-5 h-5 text-rose-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{flashMessage}</span>
            <button
              onClick={() => setFlashMessage(null)}
              className="ml-3 text-slate-400 hover:text-slate-700 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {unauthView === "home" && (
          <PublicHome
            onNavigateLogin={() => setUnauthView("login")}
            onNavigateRegister={() => setUnauthView("register")}
          />
        )}

        {unauthView === "login" && (
          <div className="w-full min-h-screen">
            <div className="p-4 sm:p-6 bg-slate-50">
              <button
                type="button"
                onClick={() => setUnauthView("home")}
                className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-600 hover:text-sky-600 transition"
              >
                <span>←</span>
                <span>Back to Public Hospital Network</span>
              </button>
            </div>
            <Login
              onLogin={handleLogin}
              onNavigateRegister={() => setUnauthView("register")}
              onNavigateForgot={() => setUnauthView("forgot")}
              currentRole={CURRENT_ROLE}
            />
          </div>
        )}

        {unauthView !== "home" && unauthView !== "login" && (
          <div className="flex-1 w-full flex flex-col items-center justify-center p-4 min-h-screen">
            <div className="w-full max-w-md mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setUnauthView("home")}
                className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-600 hover:text-sky-600 transition"
              >
                <span>←</span>
                <span>Back to Home</span>
              </button>
            </div>
            {unauthView === "register" && (
              <PatientRegistration
                onRegistered={(email) => {
                  setOtpModal({ email, purpose: "registration" });
                }}
                onBackToLogin={() => setUnauthView("login")}
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
                  setFlashMessage("Password has been reset successfully. Please sign in.");
                  setUnauthView("login");
                }}
                onBackToLogin={() => setUnauthView("login")}
              />
            )}
          </div>
        )}

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

  // -------------------------------------------------------------------------
  // Authenticated Layout
  // -------------------------------------------------------------------------
  const mustChangePassword = Boolean(session.user?.mustChangePassword);

  const initials = profile?.full_name
    ? profile.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "PT";

  return (
    <div className="h-screen w-full bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-sky-500 selection:text-white overflow-hidden">
      {/* Mandatory Password Change Guard */}
      {mustChangePassword && (
        <ChangePasswordModal
          token={session.token}
          isForced={true}
          onSuccess={(res) => {
            const updated = { token: res.token, user: res.user };
            saveSession(updated);
            setSession(updated);
            setFlashMessage("Password updated successfully.");
          }}
        />
      )}

      {showChangePassword && !mustChangePassword && (
        <ChangePasswordModal
          token={session.token}
          isForced={false}
          onClose={() => setShowChangePassword(false)}
          onSuccess={() => {
            setShowChangePassword(false);
            setFlashMessage("Password updated successfully.");
          }}
        />
      )}

      {/* Booking Modal */}
      {isBookingOpen && (
        <BookAppointmentModal
          isOpen={isBookingOpen}
          onClose={() => setIsBookingOpen(false)}
          onBookingSuccess={handleBookingSuccess}
        />
      )}

      {/* Global Flash Toast */}
      {flashMessage && (
        <div className="fixed top-5 right-5 z-50 max-w-md p-4 bg-white rounded-xl shadow-xl border border-sky-200 text-slate-800 text-xs font-medium flex items-start space-x-3 animate-fade-in">
          <div className="w-5 h-5 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center shrink-0 mt-0.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="flex-1">{flashMessage}</div>
          <button
            onClick={() => setFlashMessage(null)}
            className="text-slate-400 hover:text-slate-700 text-sm font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Clinical Header */}
      <header className="shrink-0 z-40 bg-white border-b border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.04)] w-full">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            
            {/* Hospital Branding */}
            <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab("dashboard")}>
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-sky-500 text-white flex items-center justify-center shadow-md shadow-sky-600/20 font-black text-lg">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M19 14l-7 7m0 0l-7-7m7 7V3" transform="rotate(180 12 12)" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-extrabold text-base tracking-tight text-slate-900">
                    Health<span className="text-sky-600">Mesh</span>
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">
                    PORT :5177
                  </span>
                </div>
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest leading-tight">
                  Patient Health Portal
                </p>
              </div>
            </div>

            {/* Desktop Navigation Tabs */}
            <nav className="hidden md:flex items-center space-x-1 lg:space-x-2">
              <button
                type="button"
                onClick={() => setActiveTab("dashboard")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeTab === "dashboard"
                    ? "bg-sky-50 text-sky-700"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                Dashboard
              </button>

              <button
                type="button"
                onClick={handleOpenBooking}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-sky-700 bg-sky-100 hover:bg-sky-200 transition flex items-center space-x-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 4v16m8-8H4" />
                </svg>
                <span>Book Appointment</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("appointments")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeTab === "appointments"
                    ? "bg-sky-50 text-sky-700"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                My Appointments
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("records")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeTab === "records"
                    ? "bg-sky-50 text-sky-700"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                Medical Records
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("bills")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeTab === "bills"
                    ? "bg-sky-50 text-sky-700"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                Bills &amp; Payments
              </button>
            </nav>

            {/* Header User Pill & Actions */}
            <div className="flex items-center space-x-3">
              {/* Header User Pill */}
              <div
                onClick={() => setActiveTab("profile")}
                className="flex items-center space-x-2.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer transition select-none"
                title="Click to view & edit patient profile"
              >
                <div className="w-7 h-7 rounded-full bg-sky-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-inner">
                  {initials}
                </div>
                <div className="hidden sm:block text-left">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs font-bold text-slate-800 truncate max-w-[120px]">
                      {profile?.full_name || "Patient"}
                    </span>
                    {/* Blood Group Badge */}
                    <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-200">
                      {profile?.blood_group || "B+"}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1">
                    {profile?.profile_completed ? (
                      <span className="text-[10px] font-medium text-emerald-600 flex items-center">
                        <svg className="w-2.5 h-2.5 mr-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Profile Verified
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-amber-600 flex items-center animate-pulse">
                        Complete Profile
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Settings / Password dropdown / Logout */}
              <button
                type="button"
                onClick={() => setShowChangePassword(true)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                title="Security & Password"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                title="Sign Out"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto w-full px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-12">
        {activeTab === "dashboard" && (
          <PatientDashboard
            session={session}
            profile={profile}
            onOpenBooking={handleOpenBooking}
            onNavigateTab={(tab) => setActiveTab(tab)}
          />
        )}

        {activeTab === "appointments" && (
          <MyAppointments session={session} onOpenBooking={handleOpenBooking} />
        )}

        {activeTab === "records" && (
          <MedicalRecords session={session} />
        )}

        {activeTab === "bills" && (
          <BillsAndPayments />
        )}

        {activeTab === "profile" && (
          <ProfileCompletion
            profile={profile}
            onComplete={handleProfileUpdated}
            isMandatory={profileGuardTriggered}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-lg px-2 py-1 flex items-center justify-around">
        <button
          type="button"
          onClick={() => setActiveTab("dashboard")}
          className={`flex flex-col items-center py-1 px-2 text-[10px] font-semibold transition ${
            activeTab === "dashboard" ? "text-sky-600" : "text-slate-500"
          }`}
        >
          <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          Home
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("appointments")}
          className={`flex flex-col items-center py-1 px-2 text-[10px] font-semibold transition ${
            activeTab === "appointments" ? "text-sky-600" : "text-slate-500"
          }`}
        >
          <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Visits
        </button>

        {/* Center Booking Action */}
        <button
          type="button"
          onClick={handleOpenBooking}
          className="flex flex-col items-center -mt-4"
        >
          <div className="w-12 h-12 rounded-full bg-sky-600 hover:bg-sky-700 text-white flex items-center justify-center shadow-lg shadow-sky-600/30 transition">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <span className="text-[10px] font-bold text-sky-700 mt-0.5">Book</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("records")}
          className={`flex flex-col items-center py-1 px-2 text-[10px] font-semibold transition ${
            activeTab === "records" ? "text-sky-600" : "text-slate-500"
          }`}
        >
          <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Records
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("bills")}
          className={`flex flex-col items-center py-1 px-2 text-[10px] font-semibold transition ${
            activeTab === "bills" ? "text-sky-600" : "text-slate-500"
          }`}
        >
          <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z" />
          </svg>
          Bills
        </button>
      </nav>

      {/* Book Appointment Modal */}
      <BookAppointmentModal
        isOpen={isBookingOpen}
        onClose={() => setIsBookingOpen(false)}
        onBookingSuccess={handleBookingSuccess}
      />

    </div>
  );
}