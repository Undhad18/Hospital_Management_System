import { useState } from "react";
import { loginUser } from "../services/api";
import { PORTALS } from "../services/portalConfig";

export default function Login({
  onLogin,
  onNavigateRegister,
  onNavigateForgot,
  currentRole = "hospital_admin",
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [statusNotice, setStatusNotice] = useState(null);
  const [loading, setLoading] = useState(false);

  const currentPortal = PORTALS[currentRole] || PORTALS.hospital_admin;

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setStatusNotice(null);
    setLoading(true);

    try {
      const result = await loginUser(email, password);

      // Enforce: ONLY hospital_admin can log in to Hospital Admin Portal
      if (result.user?.role !== currentRole) {
        setError(
          `Access Denied: Only Hospital Admin accounts can sign in to this portal. (Detected role: ${result.user?.role || "unknown"}).`
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
      {/* ======================= LEFT SPLIT: CLINICAL BRANDING ======================= */}
      <div className="lg:w-5/12 bg-slate-900 text-white p-8 lg:p-14 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800 relative">
        <div className="absolute inset-0 opacity-5 pointer-events-none bg-[radial-gradient(#CBD5E1_1px,transparent_1px)] [background-size:16px_16px]"></div>

        <div className="relative z-10">
          <div className="flex items-center space-x-3 mb-8">
            <div className="w-10 h-10 rounded-md bg-sky-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight text-white block">
                CareCommand
              </span>
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                Hospital Administration
              </span>
            </div>
          </div>

          <div className="space-y-4 max-w-md">
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-white leading-snug">
              Clinical Operations &amp; Facility Administration
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Institutional console for managing clinical departments, credentialing physicians and nurses, facility schedules, and point-of-care billing setups.
            </p>
          </div>

          <div className="mt-8 space-y-3 max-w-sm text-xs text-slate-300">
            <div className="flex items-start space-x-2.5">
              <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
              <span>Physician &amp; nursing credential approvals with automated licensing review</span>
            </div>
            <div className="flex items-start space-x-2.5">
              <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
              <span>Clinical departmental taxonomy and facility operating schedules</span>
            </div>
            <div className="flex items-start space-x-2.5">
              <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
              <span>Instant QR payment terminals for outpatient billing and cashier desks</span>
            </div>
          </div>
        </div>

        <div className="relative z-10 pt-8 mt-8 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
          <span>Enterprise Healthcare Edition</span>
          <span className="font-mono text-[11px] text-slate-400">Port :5174</span>
        </div>
      </div>

      {/* ======================= RIGHT SPLIT: AUTH CARD ======================= */}
      <div className="lg:w-7/12 flex items-center justify-center p-6 sm:p-12 lg:p-16 bg-white">
        <div className="w-full max-w-md space-y-6">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-slate-100 text-slate-700 text-xs font-medium mb-3 border border-slate-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>{currentPortal.name}</span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              Sign in to Hospital Console
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Enter your authorized hospital administrator credentials to proceed
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

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-slate-700 mb-1">
                Administrator Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="hospitaladmin@hms.com"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 transition"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label htmlFor="password" className="block text-xs font-medium text-slate-700">
                  Password
                </label>
                {onNavigateForgot && (
                  <button
                    type="button"
                    onClick={onNavigateForgot}
                    className="text-xs text-sky-700 hover:text-sky-800 font-medium"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Enter your password"
                  className="w-full pl-3 pr-10 py-2 bg-white border border-slate-300 rounded-md text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 text-xs font-medium focus:outline-none"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-4 bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-md text-xs shadow-xs transition disabled:opacity-50 flex items-center justify-center cursor-pointer"
            >
              {loading ? "Authenticating..." : "Sign in to Console"}
            </button>
          </form>

          {/* Quick-fill preset */}
          <div className="pt-4 border-t border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                Demo Credentials Preset
              </span>
              <span className="text-[11px] text-emerald-700 font-medium">Ready</span>
            </div>

            <button
              type="button"
              onClick={() => fillDemoAccount("hospitaladmin@hms.com", "@abcd_123456")}
              className="w-full p-2.5 rounded-md border border-slate-200 hover:border-slate-300 bg-slate-50 hover:bg-slate-100 text-left flex items-center justify-between transition cursor-pointer"
            >
              <div className="min-w-0 pr-2">
                <span className="font-semibold text-xs text-slate-900 block truncate">
                  Metro Care Hospital Admin
                </span>
                <span className="text-[11px] text-slate-500 block truncate">
                  hospitaladmin@hms.com
                </span>
              </div>
              <span className="text-xs font-medium text-sky-700 bg-white border border-slate-200 px-2 py-0.5 rounded shadow-xs shrink-0">
                Auto-fill
              </span>
            </button>
          </div>

          {onNavigateRegister && (
            <div className="text-center pt-2">
              <p className="text-xs text-slate-500">
                Need to register a patient?{" "}
                <button
                  type="button"
                  onClick={onNavigateRegister}
                  className="text-sky-700 hover:underline font-medium"
                >
                  Open Patient Registration
                </button>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
