import { useState } from "react";
import { changePassword } from "../services/api";

export default function ChangePasswordModal({
  token,
  isForced = false,
  onSuccess,
  onClose,
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (newPassword.length < 12) {
      setError("New password must be at least 12 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    if (currentPassword === newPassword) {
      setError("New password must be different from current password.");
      return;
    }

    setLoading(true);

    try {
      const result = await changePassword(token, {
        currentPassword,
        newPassword,
        confirmPassword,
      });

      onSuccess(result);
    } catch (err) {
      setError(err.message || "Failed to update password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 text-slate-800">
      <div className="w-full max-w-md bg-white rounded-lg shadow-xl border border-slate-200 p-6 sm:p-8">
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-md bg-amber-50 text-amber-700 mb-2 border border-amber-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-slate-900">
            {isForced ? "Action Required: Update Password" : "Change Password"}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {isForced
              ? "You are logged in with a temporary key. Please establish permanent credentials."
              : "Update your administrative access credentials."}
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-md text-xs"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label
              htmlFor="cp-current"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Current / Temporary Password
            </label>
            <input
              id="cp-current"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500 text-xs"
            />
          </div>

          <div>
            <label
              htmlFor="cp-new"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              New Password
            </label>
            <input
              id="cp-new"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              placeholder="Min 12 characters"
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500 text-xs"
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
              htmlFor="cp-confirm"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Confirm New Password
            </label>
            <input
              id="cp-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder="Confirm new password"
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-1 focus:ring-sky-500 text-xs"
            />
          </div>

          <div className="pt-2 flex items-center space-x-2.5">
            {!isForced && onClose && (
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="w-1/2 py-1.5 px-3 border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium rounded-md text-xs transition shadow-xs"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className={`py-1.5 px-3 bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-md text-xs shadow-xs transition disabled:opacity-50 flex items-center justify-center ${
                isForced || !onClose ? "w-full" : "w-1/2"
              }`}
            >
              {loading ? "Updating..." : "Update Password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
