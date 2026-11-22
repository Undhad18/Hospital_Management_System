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
    <div className="w-full min-h-screen flex items-center justify-center p-6 bg-slate-50 text-slate-900 font-sans">
      <div className="w-full max-w-md bg-white rounded-lg shadow-xl border border-slate-200 p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-amber-50 text-amber-700 mb-2 border border-amber-200">
            <svg
              className="w-6 h-6"
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
          <h1 className="text-lg font-bold text-slate-900">
            Staff Password Recovery
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Enter your registered staff email to receive a 6-digit verification code
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-md text-xs leading-relaxed"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="forgot-email"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Staff Email Address
            </label>
            <input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="staff@hospital.org"
              className="ent-input text-xs"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-md text-xs shadow-xs transition disabled:opacity-50 flex items-center justify-center cursor-pointer"
          >
            {loading ? "Sending Verification Code..." : "Send Verification Code"}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-200 text-center">
          <button
            type="button"
            onClick={onBackToLogin}
            className="text-xs text-amber-700 hover:underline font-medium"
          >
            &larr; Back to Staff Sign In
          </button>
        </div>
      </div>
    </div>
  );
}
