import { useState } from "react";
import { loginUser, loginWithGoogle } from "../services/api";
import { PORTALS } from "../services/portalConfig";

export default function Login({
  onLogin,
  onNavigateRegister,
  onNavigateForgot,
  currentRole = "patient",
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [statusNotice, setStatusNotice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const currentPortal = PORTALS[currentRole] || PORTALS.patient;

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setStatusNotice(null);
    setLoading(true);

    try {
      const result = await loginUser(email, password);

      if (result.user?.role !== currentRole) {
        setError(
          `Access Denied: Only Patient accounts can sign in to the Patient Portal. (Detected role: ${result.user?.role || "unknown"}).`
        );
        return;
      }

      onLogin(result);
    } catch (err) {
      if (err.data?.status) {
        setStatusNotice({
          status: err.data.status,
          message: err.message,
        });
      } else {
        setError(
          err.message || "Unable to sign in. Please verify your credentials."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setError("");
    setGoogleLoading(true);

    try {
      // If window.google OAuth credential exists, use it; otherwise use development sandbox token
      const token =
        window.__GOOGLE_CREDENTIAL__ ||
        "test_google_token:" +
          JSON.stringify({
            sub: "google_patient_sub_demo",
            email: "patient.google@example.com",
            name: "Verified Google Patient",
            email_verified: true,
          });

      const result = await loginWithGoogle(token);
      onLogin(result);
    } catch (err) {
      setError(err.message || "Unable to sign in with Google.");
    } finally {
      setGoogleLoading(false);
    }
  }

  function fillDemoAccount(demoEmail, demoPassword) {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setError("");
    setStatusNotice(null);
  }

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-slate-50 text-slate-900 font-sans">
      {/* ======================= LEFT SPLIT: PATIENT BRANDING ======================= */}
      <div className="lg:w-5/12 bg-sky-900 text-white p-8 lg:p-14 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-sky-800 relative">
        <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(#CBD5E1_1px,transparent_1px)] [background-size:16px_16px]"></div>

        <div className="relative z-10">
          <div className="flex items-center space-x-3 mb-8">
            <div className="w-10 h-10 rounded-md bg-white text-sky-700 flex items-center justify-center font-bold text-lg shadow-sm">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight text-white block">
                CareCommand
              </span>
              <span className="text-xs font-mono text-sky-200 uppercase tracking-wider">
                Patient Healthcare Portal
              </span>
            </div>
          </div>

          <div className="space-y-4 max-w-md">
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-white leading-snug">
              Your Personal Healthcare &amp; Appointment Hub
            </h1>
            <p className="text-sm text-sky-100 leading-relaxed">
              Book consultations across accredited network hospitals, access digital prescriptions, track clinical lab reports, and manage invoices from your private patient portal.
            </p>
          </div>

          <div className="mt-8 space-y-3 max-w-sm text-xs text-sky-100">
            <div className="flex items-start space-x-2.5">
              <svg className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
              <span>Instant multi-specialty physician appointment booking with live slot availability</span>
            </div>
            <div className="flex items-start space-x-2.5">
              <svg className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
              <span>Verified electronic health records, diagnosis summaries, and digital prescriptions</span>
            </div>
            <div className="flex items-start space-x-2.5">
              <svg className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
              <span>Itemized pharmacy receipts with statutory 12% GST breakdown &amp; UPI settlements</span>
            </div>
          </div>
        </div>

        <div className="relative z-10 pt-8 mt-8 border-t border-sky-800 text-xs text-sky-200 flex items-center justify-between">
          <span>Patient Health Console</span>
          <span className="font-mono text-[11px] text-sky-200">Port :5177</span>
        </div>
      </div>

      {/* ======================= RIGHT SPLIT: AUTH CARD ======================= */}
      <div className="lg:w-7/12 flex items-center justify-center p-6 sm:p-12 lg:p-16 bg-white">
        <div className="w-full max-w-md space-y-6">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-sky-50 text-sky-800 text-xs font-medium mb-3 border border-sky-200">
              <span className="w-2 h-2 rounded-full bg-sky-600"></span>
              <span>{currentPortal.name}</span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              Sign in to Patient Portal
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Access your medical appointments, clinical records, and pharmacy receipts
            </p>
          </div>

          {error && (
            <div role="alert" className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-md text-xs leading-relaxed">
              <span className="font-semibold block mb-0.5">Authentication Failed</span>
              <span>{error}</span>
            </div>
          )}

          {statusNotice && (
            <div role="alert" className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-md text-xs leading-relaxed">
              <span className="font-semibold block mb-0.5 capitalize">Account Status: {statusNotice.status}</span>
              <span>{statusNotice.message}</span>
            </div>
          )}

          {/* Social Sign In Button */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className="w-full py-2.5 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-md shadow-xs transition flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>{googleLoading ? "Connecting to Google..." : "Continue with Google Account"}</span>
          </button>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink mx-3 text-[11px] text-slate-400 uppercase font-medium">Or continue with email</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-slate-700 mb-1">
                Patient Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="patient@hms.com"
                className="ent-input text-xs"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="password" className="block text-xs font-medium text-slate-700">
                  Password
                </label>
                <button
                  type="button"
                  onClick={onNavigateForgot}
                  className="text-xs text-sky-700 hover:text-sky-800 hover:underline font-medium"
                >
                  Forgot password?
                </button>
              </div>

              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Enter security password"
                  className="ent-input text-xs pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-md text-xs shadow-xs transition duration-150 flex items-center justify-center cursor-pointer disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign In to Portal"}
            </button>
          </form>

          {/* New Patient Registration Link */}
          <div className="text-center pt-2">
            <p className="text-xs text-slate-500">
              New patient?{" "}
              <button
                type="button"
                onClick={onNavigateRegister}
                className="text-sky-700 hover:text-sky-800 font-semibold hover:underline"
              >
                Create your patient account &rarr;
              </button>
            </p>
          </div>

          {/* Preset Demo Credentials for Quick Testing */}
          <div className="pt-4 border-t border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-2">
              Development Sandbox Account
            </span>
            <button
              type="button"
              onClick={() => fillDemoAccount("patient@hms.com", "@abcd_123456")}
              className="w-full text-left px-3 py-2 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 transition text-xs flex items-center justify-between group"
            >
              <div>
                <span className="font-semibold text-slate-800 block">Undhad Harshil (Active Patient)</span>
                <span className="text-[11px] text-slate-500 font-mono">patient@hms.com</span>
              </div>
              <span className="text-[10px] text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200 group-hover:bg-sky-100 font-mono">
                Auto-fill
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
