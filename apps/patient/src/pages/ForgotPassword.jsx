import { useState } from "react";
import { forgotPassword } from "../services/api";

export default function ForgotPassword({ onRequestSuccess, onBackToLogin }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await forgotPassword(email.trim().toLowerCase());
      onRequestSuccess(email.trim().toLowerCase());
    } catch (err) {
      setError(err.message || "Failed to process password reset request.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-4 text-slate-800">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-8 sm:p-10">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-sky-50 text-sky-600 mb-3 border border-sky-100 shadow-sm">
            <svg
              className="w-7 h-7"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            Forgot Password
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Enter your registered patient email to receive a 6-digit password reset code.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm flex items-start space-x-2"
          >
            <svg className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="forgot-email"
              className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1"
            >
              Registered Email Address
            </label>
            <input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="patient@hms.com"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white text-sm transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-sm shadow-md shadow-sky-600/20 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {loading ? "Sending Reset Code..." : "Send Reset Code"}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-100 text-center">
          <button
            type="button"
            onClick={onBackToLogin}
            className="text-sm text-sky-600 hover:text-sky-700 font-bold hover:underline"
          >
            Back to Sign In
          </button>
        </div>
      </div>
    </div>
  );
}
