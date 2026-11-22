import { useState } from "react";
import { resetPassword } from "../services/api";

export default function ResetPassword({
  initialEmail = "",
  onResetSuccess,
  onBackToLogin,
}) {
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (otp.trim().length !== 6) {
      setError("Please enter the 6-digit verification code sent to your email.");
      return;
    }

    if (newPassword.length < 12) {
      setError("New password must be at least 12 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    setLoading(true);

    try {
      await resetPassword({
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
        newPassword,
        confirmPassword,
      });

      onResetSuccess();
    } catch (err) {
      setError(err.message || "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full min-h-screen flex items-center justify-center p-6 bg-slate-50 text-slate-900 font-sans">
      <div className="w-full max-w-md bg-white rounded-lg shadow-xl border border-slate-200 p-8">
        <div className="text-center mb-6">
          <h1 className="text-lg font-bold text-slate-900">Establish New Password</h1>
          <p className="text-xs text-slate-500 mt-1">
            Enter the 6-digit verification code and choose a new password
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
              htmlFor="reset-email"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Email Address
            </label>
            <input
              id="reset-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div>
            <label
              htmlFor="reset-otp"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              6-Digit Reset Code
            </label>
            <input
              id="reset-otp"
              type="text"
              maxLength="6"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              required
              placeholder="000000"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sky-800 placeholder-slate-400 font-mono tracking-widest text-center text-lg focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div>
            <label
              htmlFor="reset-newPass"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              New Password
            </label>
            <input
              id="reset-newPass"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              placeholder="Min 12 characters"
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <span
              className={`text-[11px] mt-1 block ${
                newPassword.length >= 12
                  ? "text-emerald-700 font-medium"
                  : "text-slate-400"
              }`}
            >
              {newPassword.length}/12 characters minimum
            </span>
          </div>

          <div>
            <label
              htmlFor="reset-confirmPass"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Confirm New Password
            </label>
            <input
              id="reset-confirmPass"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder="Confirm new password"
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-md text-xs shadow-xs transition disabled:opacity-50 flex items-center justify-center cursor-pointer"
          >
            {loading ? "Resetting Password..." : "Update Password"}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-200 text-center">
          <button
            type="button"
            onClick={onBackToLogin}
            className="text-xs text-sky-700 hover:underline font-medium"
          >
            &larr; Back to Administrator Sign In
          </button>
        </div>
      </div>
    </div>
  );
}
