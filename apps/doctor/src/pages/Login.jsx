import { useState } from "react";
import { loginUser } from "../services/api";
import { PORTALS } from "../services/portalConfig";

export default function Login({
  onLogin,
  onNavigateForgot,
  currentRole = "doctor",
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [statusNotice, setStatusNotice] = useState(null);
  const [loading, setLoading] = useState(false);

  const currentPortal = PORTALS[currentRole] || PORTALS.doctor;

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setStatusNotice(null);
    setLoading(true);

    try {
      const result = await loginUser(email, password);

      // Enforce: ONLY doctor can log in to Doctor Clinical Portal
      if (result.user?.role !== currentRole) {
        setError(
          `Access Denied: Only Doctor accounts can sign in to the Doctor Clinical Portal. (Detected role: ${result.user?.role || "unknown"}).`
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
            <div className="w-10 h-10 rounded-md bg-teal-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight text-white block">
                CareCommand
              </span>
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                Physician Clinical Workstation
              </span>
            </div>
          </div>

          <div className="space-y-4 max-w-md">
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-white leading-snug">
              Point-of-Care EHR &amp; Clinical Queue
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Secure clinical workstation designed for licensed physicians. Access live OPD patient queues, electronic health records, diagnostic lab reviews, and immediate triage dispositions.
            </p>
          </div>

          <div className="mt-8 space-y-3 max-w-sm text-xs text-slate-300">
            <div className="flex items-start space-x-2.5">
              <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
              <span>Real-time OPD triage appointments with patient vital telemetry</span>
            </div>
            <div className="flex items-start space-x-2.5">
              <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
              <span>Integrated lab report alerts (biochemistry, pathology, imaging)</span>
            </div>
            <div className="flex items-start space-x-2.5">
              <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
              <span>Audit-grade clinical notes &amp; digital prescription signature logs</span>
            </div>
          </div>
        </div>

        <div className="relative z-10 pt-8 mt-8 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
          <span>Clinical Physician Console</span>
          <span className="font-mono text-[11px] text-slate-400">Port :5175</span>
        </div>
      </div>

      {/* ======================= RIGHT SPLIT: AUTH CARD ======================= */}
      <div className="lg:w-7/12 flex items-center justify-center p-6 sm:p-12 lg:p-16 bg-white">
        <div className="w-full max-w-md space-y-6">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-slate-100 text-slate-700 text-xs font-medium mb-3 border border-slate-200">
              <span className="w-2 h-2 rounded-full bg-teal-500"></span>
              <span>{currentPortal.name}</span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              Sign in to Doctor Portal
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Enter your clinical physician credentials to open your patient workstation
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
              <span className="font-semibold block mb-0.5 capitalize">Physician Account Status: {statusNotice.status}</span>
              <span>{statusNotice.message}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-slate-700 mb-1">
                Physician Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="doctor@hospital.org"
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
              className="w-full py-2 px-4 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-md text-xs shadow-xs transition duration-150 flex items-center justify-center cursor-pointer disabled:opacity-50"
            >
              {loading ? "Authenticating Physician..." : "Sign In to Workstation"}
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
                onClick={() => fillDemoAccount("doctor@hms.com", "@abcd_123456")}
                className="w-full text-left px-3 py-2 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 transition text-xs flex items-center justify-between group"
              >
                <div>
                  <span className="font-semibold text-slate-800 block">Dr. Sarah Jenkins</span>
                  <span className="text-[11px] text-slate-500 font-mono">doctor@hms.com</span>
                </div>
                <span className="text-[10px] text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200 group-hover:bg-teal-100 font-mono">
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
