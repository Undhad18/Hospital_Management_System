import { useState } from "react";
import { loginUser } from "../services/api";
import { PORTALS } from "../services/portalConfig";

export default function Login({
  onLogin,
  onNavigateForgot,
  currentRole = "staff",
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [statusNotice, setStatusNotice] = useState(null);
  const [loading, setLoading] = useState(false);

  const currentPortal = PORTALS[currentRole] || PORTALS.staff;

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setStatusNotice(null);
    setLoading(true);

    try {
      const result = await loginUser(email, password);

      // Enforce: ONLY staff can log in to Hospital Staff Portal
      if (result.user?.role !== currentRole) {
        setError(
          `Access Denied: Only Staff accounts can sign in to the Hospital Staff Portal. (Detected role: ${result.user?.role || "unknown"}).`
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

  function fillDemoAccount(demoEmail, demoPassword) {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setError("");
    setStatusNotice(null);
  }

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-slate-50 text-slate-900 font-sans">
      {/* ======================= LEFT SPLIT: STAFF BRANDING ======================= */}
      <div className="lg:w-5/12 bg-slate-900 text-white p-8 lg:p-14 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800 relative">
        <div className="absolute inset-0 opacity-5 pointer-events-none bg-[radial-gradient(#CBD5E1_1px,transparent_1px)] [background-size:16px_16px]"></div>

        <div className="relative z-10">
          <div className="flex items-center space-x-3 mb-8">
            <div className="w-10 h-10 rounded-md bg-amber-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight text-white block">
                CareCommand
              </span>
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                Clinic Operations &amp; Staff Desk
              </span>
            </div>
          </div>

          <div className="space-y-4 max-w-md">
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-white leading-snug">
              Patient Reception &amp; Admissions Desk
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Frontline clinical support console for hospital staff. Streamline walk-in patient check-ins, queue token routing, bed allocation, and clinic appointment scheduling.
            </p>
          </div>

          <div className="mt-8 space-y-3 max-w-sm text-xs text-slate-300">
            <div className="flex items-start space-x-2.5">
              <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
              <span>Instant token dispatch &amp; departmental waiting hall routing</span>
            </div>
            <div className="flex items-start space-x-2.5">
              <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
              <span>Real-time inpatient bed occupancy &amp; emergency ward triage</span>
            </div>
            <div className="flex items-start space-x-2.5">
              <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
              <span>Cashier desk counter link with QR payment receipts</span>
            </div>
          </div>
        </div>

        <div className="relative z-10 pt-8 mt-8 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
          <span>Staff Desk Operations Console</span>
          <span className="font-mono text-[11px] text-slate-400">Port :5176</span>
        </div>
      </div>

      {/* ======================= RIGHT SPLIT: AUTH CARD ======================= */}
      <div className="lg:w-7/12 flex items-center justify-center p-6 sm:p-12 lg:p-16 bg-white">
        <div className="w-full max-w-md space-y-6">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-slate-100 text-slate-700 text-xs font-medium mb-3 border border-slate-200">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span>{currentPortal.name}</span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              Sign in to Staff Desk
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Enter your hospital staff credentials to open your desk terminal
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
              <span className="font-semibold block mb-0.5 capitalize">Staff Account Status: {statusNotice.status}</span>
              <span>{statusNotice.message}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-slate-700 mb-1">
                Staff Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="staff@hospital.org"
                className="ent-input text-xs"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="password" className="block text-xs font-medium text-slate-700">
                  Account Password
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
              className="w-full py-2 px-4 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-md text-xs shadow-xs transition duration-150 flex items-center justify-center cursor-pointer disabled:opacity-50"
            >
              {loading ? "Authenticating Staff..." : "Sign In to Operational Desk"}
            </button>
          </form>

          {/* Preset Demo Credentials for Quick Testing */}
          <div className="pt-4 border-t border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-2">
              Development Sandbox Credentials
            </span>
            <div className="grid grid-cols-1 gap-1.5">
              <button
                type="button"
                onClick={() => fillDemoAccount("staff@hms.com", "@abcd_123456")}
                className="w-full text-left px-3 py-2 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 transition text-xs flex items-center justify-between group"
              >
                <div>
                  <span className="font-semibold text-slate-800 block">Robert Chen</span>
                  <span className="text-[11px] text-slate-500 font-mono">staff@hms.com</span>
                </div>
                <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 group-hover:bg-amber-100 font-mono">
                  Prefill
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
