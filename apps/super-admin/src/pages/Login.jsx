import { useState } from "react";
import { loginUser } from "../services/api";

export default function Login({
  onLogin,
  onNavigateForgot,
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [statusNotice, setStatusNotice] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setStatusNotice(null);
    setLoading(true);

    try {
      const result = await loginUser(email, password);

      if (result.user?.role !== "super_admin") {
        setError(
          `Access Denied: Only Super Admin accounts can sign in to the Super Admin Portal. (Detected role: ${result.user?.role || "unknown"}).`
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
      {/* ======================= LEFT SPLIT: ENTERPRISE BRANDING ======================= */}
      <div className="lg:w-5/12 bg-slate-900 text-white p-8 lg:p-14 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800 relative">
        {/* Subtle architectural background texture */}
        <div className="absolute inset-0 opacity-5 pointer-events-none bg-[radial-gradient(#CBD5E1_1px,transparent_1px)] [background-size:16px_16px]"></div>

        {/* Top: Brand Identity */}
        <div className="relative z-10">
          <div className="flex items-center space-x-3 mb-8">
            <div className="w-10 h-10 rounded-lg bg-sky-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight text-white block">
                HealthMesh Central
              </span>
              <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">
                Enterprise Authority
              </span>
            </div>
          </div>

          <div className="space-y-4 max-w-md">
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-white leading-snug">
              Multi-Hospital Infrastructure &amp; Central Governance
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Centralized orchestration system for network hospitals, clinical personnel approvals, automated point-of-care billing setups, and master taxonomies.
            </p>
          </div>

          {/* Capabilities List */}
          <div className="mt-8 space-y-3 max-w-sm text-xs text-slate-300">
            <div className="flex items-start space-x-2.5">
              <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
              <span>Multi-tier RBAC lifecycle governance &amp; credential approvals</span>
            </div>
            <div className="flex items-start space-x-2.5">
              <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
              <span>Automated UPI QR settlement &amp; facility operational hours</span>
            </div>
            <div className="flex items-start space-x-2.5">
              <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
              <span>Geographic state/city masters &amp; departmental taxonomy</span>
            </div>
          </div>
        </div>

        {/* Bottom Trust & Compliance */}
        <div className="relative z-10 pt-8 mt-8 border-t border-slate-800 text-xs text-slate-400 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <span>Enterprise Core v3.4.1</span>
          <span className="flex items-center space-x-1.5 text-emerald-400 font-mono text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Cluster Status: Operational</span>
          </span>
        </div>
      </div>

      {/* ======================= RIGHT SPLIT: FOCUSED WHITE AUTH CARD ======================= */}
      <div className="lg:w-7/12 flex items-center justify-center p-6 sm:p-12 lg:p-16 bg-slate-50">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-lg p-8 sm:p-10 shadow-xs">
          {/* Header */}
          <div className="mb-6">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              Sign in to Central Console
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Enter your corporate administrator credentials to manage the hospital cluster.
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div
              role="alert"
              className="mb-5 p-3 rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start space-x-2.5"
            >
              <svg className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="leading-snug">{error}</span>
            </div>
          )}

          {/* Status Notice */}
          {statusNotice && (
            <div
              role="alert"
              className="mb-5 p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start space-x-2.5"
            >
              <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-semibold capitalize">Account {statusNotice.status}</p>
                <p className="mt-0.5 text-xs text-amber-700">{statusNotice.message}</p>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Work Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="superadmin@hms.com"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-600 transition"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Password
                </label>
                {onNavigateForgot && (
                  <button
                    type="button"
                    onClick={onNavigateForgot}
                    className="text-xs text-sky-600 hover:text-sky-700 font-medium hover:underline"
                  >
                    Forgot Password?
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
                  placeholder="••••••••••••"
                  className="w-full px-3 py-2 pr-10 bg-white border border-slate-300 rounded-md text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-600 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
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
              className="w-full mt-2 py-2.5 px-4 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white font-medium rounded-md text-sm shadow-xs transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Authenticating Session...
                </>
              ) : (
                "Sign In to Console"
              )}
            </button>
          </form>

          {/* Dev Quick-Fill Accordion / Presets */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Authorized Credentials Preset:
              </span>
            </div>
            <button
              type="button"
              onClick={() => fillDemoAccount("admin@hms.com", "@abcd_123456")}
              className="w-full px-3 py-2.5 rounded-md bg-slate-50 hover:bg-slate-100 text-slate-700 text-left border border-slate-200 flex items-center justify-between transition cursor-pointer"
            >
              <div>
                <span className="font-semibold text-xs text-slate-900 block">
                  Root Super Admin
                </span>
                <span className="font-mono text-[11px] text-slate-500">
                  superadmin@hms.com
                </span>
              </div>
              <span className="text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded">
                Auto-fill
              </span>
            </button>

            <p className="text-[11px] text-slate-400 mt-3 text-center">
              Restricted central access. All authentication requests are audit-logged.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
